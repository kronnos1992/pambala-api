import {
  ICommand,
  ICommandHandler,
  IQuery,
  IQueryHandler,
} from "../shared/cqrs";
import {
  OrderRepository,
  OrderItemRepository,
  ReceiptQueueRepository,
} from "../shared/repositories/order.repository";
import { CartRepository } from "../shared/repositories/cart.repository";
import { ProductRepository } from "../shared/repositories/product.repository";
import { StoreRepository } from "../shared/repositories/store.repository";
import { UnitOfWork } from "../shared/unit-of-work";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../shared/errors";
import {
  generateOrderNumber,
  generatePaymentCode,
  parseOrderItemImages,
  parsePaymentMethods,
  paymentHistoryPush,
} from "../shared/mappers";
import { OrderInput } from "../lib/validators";
import { InvoiceEmitter } from "../lib/fiscal/emitter";
import {
  assertPermission,
  resolvePermissions,
  PERMISSIONS,
  primaryRoleOf,
} from "../lib/permissions";

export class SellerOrdersQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly roles: string[],
    public readonly page: number,
    public readonly limit: number
  ) {}
}

export class GetSellerOrderQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly roles: string[],
    public readonly id: string
  ) {}
}

export class CreateOrderCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: OrderInput
  ) {}
}

export class ListUserOrdersQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly page: number,
    public readonly limit: number
  ) {}
}

export class GetOrderQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly roles: string[],
    public readonly id: string
  ) {}
}

export class UpdateOrderStatusCommand implements ICommand {
  constructor(
    public readonly roles: string[],
    public readonly id: string,
    public readonly status: string
  ) {}
}

export class UploadReceiptCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly id: string,
    public readonly receiptImage: string
  ) {}
}

export class UpdateOrderPaymentStatusCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly roles: string[],
    public readonly id: string,
    public readonly paymentStatus: string
  ) {}
}

const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "RECEIVED",
  "CANCELLED",
];

function statusTimestamps(status: string) {
  const now = new Date();
  const fields: Record<string, Date> = {};
  if (status === "SHIPPED") fields.shippedAt = now;
  if (status === "DELIVERED") fields.deliveredAt = now;
  if (status === "RECEIVED") fields.receivedAt = now;
  return fields;
}

const PAYMENT_STATUSES = [
  "PENDING",
  "AWAITING_PAYMENT",
  "PAYMENT_RECEIVED",
  "PAID",
  "REJECTED",
];

export class ShipOrderCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly roles: string[],
    public readonly id: string,
    public readonly data: {
      carrierName?: string;
      trackingCode?: string;
      estimatedDelivery?: string;
    }
  ) {}
}

export class MarkOrderDeliveredCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly roles: string[],
    public readonly id: string,
    public readonly note?: string
  ) {}
}

export class ConfirmOrderReceiptCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly roles: string[],
    public readonly id: string
  ) {}
}

export class GetOrderTimelineQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly roles: string[],
    public readonly id: string
  ) {}
}

export class SellerOrdersQueryHandler
  implements IQueryHandler<SellerOrdersQuery, any>
{
  constructor(
    private readonly orders: OrderRepository,
    private readonly stores: StoreRepository
  ) {}

  async handle(query: SellerOrdersQuery) {
    await assertPermission(query.roles, PERMISSIONS.ordersView);

    const store = await this.stores.findByUserId(query.userId);

    if (!store) {
      throw new NotFoundError("Loja não encontrada");
    }

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.orders.findByStore(store.id, skip, query.limit),
      this.orders.countByStore(store.id),
    ]);

    return {
      orders: items.map((order) => ({
        ...order,
        items: parseOrderItemImages(order.items),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}

export class GetSellerOrderQueryHandler
  implements IQueryHandler<GetSellerOrderQuery, any>
{
  constructor(
    private readonly orders: OrderRepository,
    private readonly stores: StoreRepository
  ) {}

  async handle(query: GetSellerOrderQuery) {
    await assertPermission(query.roles, PERMISSIONS.ordersView);

    const store = await this.stores.findByUserId(query.userId);

    if (!store) {
      throw new NotFoundError("Loja não encontrada");
    }

    const order = await this.orders.findByIdentifierForStore(query.id, store.id);

    if (!order) {
      throw new NotFoundError("Pedido não encontrado");
    }

    return {
      order: { ...order, items: parseOrderItemImages(order.items) },
    };
  }
}

export class CreateOrderCommandHandler
  implements ICommandHandler<CreateOrderCommand, any>
{
  constructor(
    private readonly uow: UnitOfWork,
    private readonly orders: OrderRepository,
    private readonly carts: CartRepository,
    private readonly stores: StoreRepository,
    private readonly products: ProductRepository
  ) {}

  async handle(command: CreateOrderCommand) {
    const { userId, data } = command;

    return this.uow.run(async (uow) => {
      const cartRepo = uow.repository(this.carts);
      const orderRepo = uow.repository(this.orders);
      const storeRepo = uow.repository(this.stores);
      const productRepo = uow.repository(this.products);

      const cartRecord = await cartRepo.findWithItems(userId);

      if (!cartRecord || cartRecord.items.length === 0) {
        throw new BadRequestError("Carrinho vazio");
      }

      const store = await storeRepo.findById(data.storeId);

      if (!store) {
        throw new NotFoundError("Loja não encontrada");
      }

      const storeItems = cartRecord.items.filter(
        (item: any) => item.product.storeId === data.storeId
      );

      if (storeItems.length === 0) {
        throw new BadRequestError("Nenhum item desta loja no carrinho");
      }

      for (const item of storeItems) {
        if (item.product.stock < item.quantity) {
          throw new BadRequestError(
            `Estoque insuficiente para ${item.product.name}`
          );
        }
      }

      const total = storeItems.reduce(
        (sum: number, item: any) =>
          sum + item.product.price * item.quantity,
        0
      );

      const paymentMethods = parsePaymentMethods(store.paymentMethods);
      const method = paymentMethods.find(
        (m: any) => m.type === data.paymentMethod
      );

      if (data.paymentMethod !== "CASH_ON_DELIVERY" && !method?.enabled) {
        throw new BadRequestError(
          "Método de pagamento indisponível para esta loja"
        );
      }

      const paymentDetails =
        data.paymentMethod === "CASH_ON_DELIVERY"
          ? null
          : JSON.stringify(method);

      const orderNumber = generateOrderNumber();

      let paymentCode = generatePaymentCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        if (!(await orderRepo.findByPaymentCode(paymentCode))) break;
        paymentCode = generatePaymentCode();
      }

      const order = await orderRepo.create({
        orderNumber,
        paymentCode,
        total,
        shippingFee: 0,
        paymentMethod: data.paymentMethod,
        paymentDetails,
        shippingName: data.shippingName,
        shippingPhone: data.shippingPhone,
        shippingAddress: data.shippingAddress,
        shippingProvince: data.shippingProvince,
        shippingDistrict: data.shippingDistrict,
        notes: data.notes,
        userId,
        paymentHistory: JSON.stringify([
          {
            at: new Date().toISOString(),
            by: userId,
            role: "BUYER",
            action: "ORDER_CREATED",
            to: "PENDING",
          },
        ]),
        items: {
          create: storeItems.map((item: any) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.product.price,
            storeId: item.product.storeId,
          })),
        },
      });

      const removedIds = storeItems.map((item: any) => item.id);
      for (const item of storeItems) {
        await productRepo.update(item.productId, {
          stock: { decrement: item.quantity },
        });
      }

      await cartRepo.deleteItems(removedIds);

      return { order };
    });
  }
}

export class ListUserOrdersQueryHandler
  implements IQueryHandler<ListUserOrdersQuery, any>
{
  constructor(private readonly orders: OrderRepository) {}

  async handle(query: ListUserOrdersQuery) {
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.orders.findByUser(query.userId, skip, query.limit),
      this.orders.countByUser(query.userId),
    ]);

    return {
      orders: items.map((order) => ({
        ...order,
        items: parseOrderItemImages(order.items),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}

export class GetOrderQueryHandler implements IQueryHandler<GetOrderQuery, any> {
  constructor(private readonly orders: OrderRepository) {}

  async handle(query: GetOrderQuery) {
    let order = await this.orders.findByIdentifierWithDetails(query.id);

    if (!order) {
      order = await this.orders.findByOrderNumberWithDetails(query.id);
    }

    if (!order) {
      throw new NotFoundError("Pedido não encontrado");
    }

    const adminPermissions = await resolvePermissions(query.roles);
    if (!adminPermissions.has(PERMISSIONS.adminOrdersManage) && order.userId !== query.userId) {
      throw new ForbiddenError("Não autorizado");
    }

    return {
      order: { ...order, items: parseOrderItemImages(order.items) },
    };
  }
}

export class UpdateOrderStatusCommandHandler
  implements ICommandHandler<UpdateOrderStatusCommand, any>
{
  constructor(private readonly orders: OrderRepository) {}

  async handle(command: UpdateOrderStatusCommand) {
    const { roles, id, status } = command;

    await assertPermission(roles, PERMISSIONS.adminOrdersManage);

    if (!ORDER_STATUSES.includes(status)) {
      throw new BadRequestError("Status inválido");
    }

    let order = await this.orders.findByIdentifier(id);
    if (!order) {
      throw new NotFoundError("Pedido não encontrado");
    }

    const history = paymentHistoryPush(order.paymentHistory, {
      at: new Date().toISOString(),
      by: primaryRoleOf(roles),
      role: "ADMIN",
      action: "ORDER_STATUS",
      from: order.status,
      to: status,
    });

    const updated = await this.orders.update(order.id, {
      status,
      ...statusTimestamps(status),
      paymentHistory: JSON.stringify(history),
    });

    return {
      order: { ...updated, items: parseOrderItemImages(updated.items) },
    };
  }
}

export class UploadReceiptCommandHandler
  implements ICommandHandler<UploadReceiptCommand, any>
{
  constructor(
    private readonly orders: OrderRepository,
    private readonly receiptQueue: ReceiptQueueRepository
  ) {}

  async handle(command: UploadReceiptCommand) {
    const { userId, id, receiptImage } = command;

    const order = await this.orders.findByIdentifier(id);

    if (!order) {
      throw new NotFoundError("Pedido não encontrado");
    }

    if (order.userId !== userId) {
      throw new ForbiddenError("Não autorizado");
    }

    if (order.paymentMethod === "CASH_ON_DELIVERY") {
      throw new BadRequestError(
        "Pagamento na entrega não requer comprovativo"
      );
    }

    if (!receiptImage) {
      throw new BadRequestError("Comprovativo obrigatório");
    }

    const currentAttempts = ((order as any).receiptAttempts || 0) + 1;
    if (((order as any).receiptAttempts || 0) >= 3) {
      throw new BadRequestError(
        "Limite de 3 tentativas de envio de comprovativo excedido. O pedido foi bloqueado para análise manual do suporte."
      );
    }

    const history = paymentHistoryPush(order.paymentHistory, {
      at: new Date().toISOString(),
      by: userId,
      role: "BUYER",
      action: "RECEIPT_UPLOAD",
      status: "AWAITING_PAYMENT",
      validationStatus: "AQUEUE",
      attempt: currentAttempts,
      score: 0,
    });

    const updated = await this.orders.update(order.id, {
      receiptImage,
      receiptAttempts: currentAttempts,
      paymentStatus: "AWAITING_PAYMENT",
      validationStatus: "AQUEUE",
      validationResult: null,
      paymentHistory: JSON.stringify(history),
    });

    await this.receiptQueue.enqueue(order.id);

    return { order: updated };
  }
}

export class UpdateOrderPaymentStatusCommandHandler
  implements ICommandHandler<UpdateOrderPaymentStatusCommand, any>
{
  constructor(
    private readonly orders: OrderRepository,
    private readonly stores: StoreRepository,
    private readonly orderItems: OrderItemRepository,
    private readonly emitter?: InvoiceEmitter
  ) {}

  async handle(command: UpdateOrderPaymentStatusCommand) {
    const { userId, roles, id, paymentStatus } = command;

    const order = await this.orders.findByIdentifier(id);

    if (!order) {
      throw new NotFoundError("Pedido não encontrado");
    }

    const effective = await resolvePermissions(roles);
    const isSeller = effective.has(PERMISSIONS.ordersRespondPayment);
    const isAdmin = effective.has(PERMISSIONS.ordersConfirmPayment);

    if (!isAdmin && !isSeller) {
      throw new ForbiddenError("Não autorizado");
    }

    if (isSeller && !isAdmin) {
      const store = await this.stores.findByUserId(userId);
      const orderBelongsToStore = await this.orderItems.findByOrderAndStore(
        order.id,
        store?.id
      );
      if (!store || !orderBelongsToStore) {
        throw new ForbiddenError("Não autorizado");
      }
    }

    if (isSeller && !isAdmin && paymentStatus !== "PAYMENT_RECEIVED") {
      throw new ForbiddenError(
        "O vendedor só pode declarar que recebeu o pagamento. A confirmação final é feita pelo administrador."
      );
    }

    if (
      isSeller &&
      !isAdmin &&
      (order.validationStatus === "PROOF_REJECTED" ||
        order.validationStatus === "FAIL" ||
        order.paymentStatus === "REJECTED")
    ) {
      throw new BadRequestError(
        "Não é possível declarar o pagamento como recebido: o comprovativo foi rejeitado. Solicite ao comprador um comprovativo válido ou aguarde análise do suporte."
      );
    }

    if (isAdmin && paymentStatus === "PAYMENT_RECEIVED") {
      throw new BadRequestError(
        "O administrador deve confirmar (PAID) ou rejeitar (PENDING/REJECTED) o pagamento."
      );
    }

    if (!PAYMENT_STATUSES.includes(paymentStatus)) {
      throw new BadRequestError("Status de pagamento inválido");
    }

    const nextStatus = paymentStatus === "PAID" ? "PROCESSING" : order.status;

    let history = paymentHistoryPush(order.paymentHistory, {
      at: new Date().toISOString(),
      by: userId,
      role: primaryRoleOf(roles),
      action: "PAYMENT_STATUS",
      from: order.paymentStatus,
      to: paymentStatus,
    });

    if (nextStatus !== order.status) {
      history = paymentHistoryPush(history, {
        at: new Date().toISOString(),
        by: userId,
        role: primaryRoleOf(roles),
        action: "ORDER_STATUS",
        from: order.status,
        to: nextStatus,
      });
    }

    const updated = await this.orders.update(order.id, {
      paymentStatus,
      status: nextStatus,
      ...statusTimestamps(nextStatus),
      paymentHistory: JSON.stringify(history),
    });

    let invoice: any = null;
    if (paymentStatus === "PAID" && this.emitter) {
      try {
        invoice = (await this.emitter.emitForOrder(order.id, userId)).invoice;
      } catch (err) {
        console.error(`[fiscal] Emissão de factura falhou (order ${order.id}):`, err);
      }
    }

    return { order: updated, invoice };
  }
}

// --- Ciclo de vida / rastreamento ---

type OrderActor = "ADMIN" | "SELLER" | "BUYER";

async function resolveOrderActor(
  orders: OrderRepository,
  stores: StoreRepository,
  orderItems: OrderItemRepository,
  id: string,
  userId: string,
  roles: string[]
): Promise<{ order: any; actor: OrderActor }> {
  const order = await orders.findByIdentifier(id);

  if (!order) {
    throw new NotFoundError("Pedido não encontrado");
  }

  const effective = await resolvePermissions(roles);
  if (
    effective.has(PERMISSIONS.adminOrdersManage) ||
    effective.has(PERMISSIONS.ordersConfirmPayment)
  ) {
    return { order, actor: "ADMIN" };
  }

  if (order.userId === userId) {
    return { order, actor: "BUYER" };
  }

  if (effective.has(PERMISSIONS.ordersRespondPayment)) {
    const store = await stores.findByUserId(userId);
    const related = store
      ? await orderItems.findByOrderAndStore(order.id, store.id)
      : null;
    if (store && related) {
      return { order, actor: "SELLER" };
    }
  }

  throw new ForbiddenError("Não autorizado");
}

interface OrderTimelineEventEntry {
  id: string;
  kind: string;
  from: string | null;
  to: string | null;
  note: string | null;
  at: string;
  actorRole: string | null;
  score?: number | null;
  tracking?: {
    carrierName?: string | null;
    trackingCode?: string | null;
    estimatedDelivery?: string | null;
  } | null;
}

function parseHistory(raw: string | null): any[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function normalizeHistoryEntry(
  entry: any,
  index: number
): OrderTimelineEventEntry | null {
  if (!entry || typeof entry !== "object") return null;

  const at = entry.at || new Date(0).toISOString();
  const base: OrderTimelineEventEntry = {
    id: `e-${index}`,
    kind: "ORDER",
    from: entry.from ?? null,
    to: entry.to ?? null,
    note: entry.note ?? null,
    at,
    actorRole: entry.role ?? entry.actor ?? null,
    score: typeof entry.score === "number" ? entry.score : null,
    tracking: entry.tracking ?? null,
  };

  switch (entry.action) {
    case "ORDER_CREATED":
      return { ...base, kind: "ORDER", to: "PENDING" };
    case "ORDER_STATUS":
      return { ...base, kind: "ORDER" };
    case "PAYMENT_STATUS":
      return { ...base, kind: "PAYMENT" };
    case "RECEIPT_UPLOAD":
      return {
        ...base,
        kind: "RECEIPT",
        to: entry.to ?? "AWAITING_PAYMENT",
        note:
          typeof entry.attempt === "number"
            ? `tentativa ${entry.attempt}`
            : base.note,
      };
    case "AGENT_REVIEW":
      return {
        ...base,
        kind: "VALIDATION",
        to: entry.to ?? entry.validationStatus ?? null,
      };
    case "MANUAL_OVERRIDE_ACCEPT":
      return { ...base, kind: "MODERATION", to: "PROOF_ACCEPTED" };
    case "DEFINITIVE_REJECT":
      return { ...base, kind: "MODERATION", to: "PROOF_REJECTED" };
    default:
      break;
  }

  if (entry.actor === "admin" || entry.role === "admin") {
    return { ...base, kind: "MODERATION" };
  }

  if (entry.to) {
    return { ...base, kind: "ORDER" };
  }

  return null;
}

function buildOrderTimeline(order: any): OrderTimelineEventEntry[] {
  const history = parseHistory(order.paymentHistory);

  let events = history
    .map((entry, index) => normalizeHistoryEntry(entry, index))
    .filter((e): e is OrderTimelineEventEntry => e !== null);

  if (!events.some((e) => e.kind === "ORDER" && e.to === "PENDING")) {
    events = [
      {
        id: "e-created",
        kind: "ORDER",
        from: null,
        to: "PENDING",
        note: null,
        at:
          order.createdAt?.toISOString?.() ??
          new Date().toISOString(),
        actorRole: "BUYER",
      },
      ...events,
    ];
  }

  return events.sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );
}

export class GetOrderTimelineQueryHandler
  implements IQueryHandler<GetOrderTimelineQuery, any>
{
  constructor(
    private readonly orders: OrderRepository,
    private readonly stores: StoreRepository,
    private readonly orderItems: OrderItemRepository
  ) {}

  async handle(query: GetOrderTimelineQuery) {
    const { order, actor } = await resolveOrderActor(
      this.orders,
      this.stores,
      this.orderItems,
      query.id,
      query.userId,
      query.roles
    );

    const status = order.status;
    const canAdvance = actor !== "BUYER" && status !== "CANCELLED";
    const paymentReady =
      order.paymentMethod === "CASH_ON_DELIVERY" ||
      ["PAYMENT_RECEIVED", "PAID"].includes(order.paymentStatus);

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      currentStatus: status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      tracking: {
        carrierName: order.carrierName ?? null,
        trackingCode: order.trackingCode ?? null,
        estimatedDelivery: order.estimatedDelivery ?? null,
        shippedAt: order.shippedAt ?? null,
        deliveredAt: order.deliveredAt ?? null,
        receivedAt: order.receivedAt ?? null,
      },
      capabilities: {
        role: actor,
        canConfirmReceipt: actor === "BUYER" && status === "DELIVERED",
        canShip: canAdvance && paymentReady && ["PENDING", "CONFIRMED", "PROCESSING"].includes(status),
        canDeliver: canAdvance && status === "SHIPPED",
      },
      events: buildOrderTimeline(order),
    };
  }
}

export class ShipOrderCommandHandler
  implements ICommandHandler<ShipOrderCommand, any>
{
  constructor(
    private readonly orders: OrderRepository,
    private readonly stores: StoreRepository,
    private readonly orderItems: OrderItemRepository
  ) {}

  async handle(command: ShipOrderCommand) {
    const { userId, roles, id, data } = command;

    const { order, actor } = await resolveOrderActor(
      this.orders,
      this.stores,
      this.orderItems,
      id,
      userId,
      roles
    );

    if (actor === "BUYER") {
      throw new ForbiddenError("Não autorizado");
    }

    if (!["PENDING", "CONFIRMED", "PROCESSING"].includes(order.status)) {
      throw new BadRequestError(
        "O pedido não pode ser enviado no estado atual"
      );
    }

    if (
      order.paymentMethod !== "CASH_ON_DELIVERY" &&
      !["PAYMENT_RECEIVED", "PAID"].includes(order.paymentStatus)
    ) {
      throw new BadRequestError("Confirme o pagamento antes de enviar o pedido");
    }

    const carrierName = (data.carrierName || "").trim().slice(0, 120);
    const trackingCode = (data.trackingCode || "").trim().slice(0, 120);
    const estimatedDelivery = (data.estimatedDelivery || "").trim().slice(0, 40);

    if (!carrierName || !trackingCode) {
      throw new BadRequestError(
        "Transportadora e código de rastreio são obrigatórios"
      );
    }

    const history = paymentHistoryPush(order.paymentHistory, {
      at: new Date().toISOString(),
      by: userId,
      role: actor === "ADMIN" ? "ADMIN" : "SELLER",
      action: "ORDER_STATUS",
      from: order.status,
      to: "SHIPPED",
      tracking: { carrierName, trackingCode, estimatedDelivery },
    });

    const updated = await this.orders.update(order.id, {
      status: "SHIPPED",
      carrierName,
      trackingCode,
      estimatedDelivery,
      shippedAt: new Date(),
      paymentHistory: JSON.stringify(history),
    });

    return { order: updated };
  }
}

export class MarkOrderDeliveredCommandHandler
  implements ICommandHandler<MarkOrderDeliveredCommand, any>
{
  constructor(
    private readonly orders: OrderRepository,
    private readonly stores: StoreRepository,
    private readonly orderItems: OrderItemRepository,
    private readonly emitter?: InvoiceEmitter
  ) {}

  async handle(command: MarkOrderDeliveredCommand) {
    const { userId, roles, id, note } = command;

    const { order, actor } = await resolveOrderActor(
      this.orders,
      this.stores,
      this.orderItems,
      id,
      userId,
      roles
    );

    if (actor === "BUYER") {
      throw new ForbiddenError("Não autorizado");
    }

    if (order.status !== "SHIPPED") {
      throw new BadRequestError(
        "O pedido só pode ser entregue depois de enviado"
      );
    }

    const at = new Date().toISOString();
    const cleanNote = (note || "").trim().slice(0, 300) || undefined;

    let history = paymentHistoryPush(order.paymentHistory, {
      at,
      by: userId,
      role: actor === "ADMIN" ? "ADMIN" : "SELLER",
      action: "ORDER_STATUS",
      from: order.status,
      to: "DELIVERED",
      note: cleanNote,
    });

    const data: any = {
      status: "DELIVERED",
      deliveredAt: new Date(),
      paymentHistory: JSON.stringify(history),
    };

    if (
      order.paymentMethod === "CASH_ON_DELIVERY" &&
      order.paymentStatus !== "PAID"
    ) {
      history = paymentHistoryPush(JSON.stringify(history), {
        at,
        by: userId,
        role: actor === "ADMIN" ? "ADMIN" : "SELLER",
        action: "PAYMENT_STATUS",
        from: order.paymentStatus,
        to: "PAID",
        note: "Pagamento na entrega",
      });
      data.paymentStatus = "PAID";
      data.paymentHistory = JSON.stringify(history);
    }

    const updated = await this.orders.update(order.id, data);

    let invoice: any = null;
    if (data.paymentStatus === "PAID" && this.emitter) {
      try {
        invoice = (await this.emitter.emitForOrder(order.id, userId)).invoice;
      } catch (err) {
        console.error(`[fiscal] Emissão de factura falhou (order ${order.id}):`, err);
      }
    }

    return { order: updated, invoice };
  }
}

export class ConfirmOrderReceiptCommandHandler
  implements ICommandHandler<ConfirmOrderReceiptCommand, any>
{
  constructor(
    private readonly orders: OrderRepository,
    private readonly stores: StoreRepository,
    private readonly orderItems: OrderItemRepository
  ) {}

  async handle(command: ConfirmOrderReceiptCommand) {
    const { userId, roles, id } = command;

    const { order, actor } = await resolveOrderActor(
      this.orders,
      this.stores,
      this.orderItems,
      id,
      userId,
      roles
    );

    if (order.userId !== userId && actor !== "ADMIN") {
      throw new ForbiddenError("Não autorizado");
    }

    if (order.status !== "DELIVERED") {
      throw new BadRequestError(
        "A recepção só pode ser confirmada depois da entrega"
      );
    }

    const history = paymentHistoryPush(order.paymentHistory, {
      at: new Date().toISOString(),
      by: userId,
      role: order.userId === userId ? "BUYER" : "ADMIN",
      action: "ORDER_STATUS",
      from: order.status,
      to: "RECEIVED",
    });

    const updated = await this.orders.update(order.id, {
      status: "RECEIVED",
      receivedAt: new Date(),
      paymentHistory: JSON.stringify(history),
    });

    return { order: updated };
  }
}