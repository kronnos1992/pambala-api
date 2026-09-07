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
  parseOrderItemImages,
  parsePaymentMethods,
  paymentHistoryPush,
} from "../shared/mappers";
import { OrderInput } from "../lib/validators";
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
  "CANCELLED",
];

const PAYMENT_STATUSES = [
  "PENDING",
  "AWAITING_PAYMENT",
  "PAYMENT_RECEIVED",
  "PAID",
  "REJECTED",
];

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

      const order = await orderRepo.create({
        orderNumber,
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

    const order = await this.orders.update(id, { status });

    return {
      order: { ...order, items: parseOrderItemImages(order.items) },
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

    const history = paymentHistoryPush(order.paymentHistory, {
      at: new Date().toISOString(),
      by: userId,
      role: "BUYER",
      action: "RECEIPT_UPLOAD",
      status: "AWAITING_PAYMENT",
      validationStatus: "AQUEUE",
      score: 0,
    });

    const updated = await this.orders.update(order.id, {
      receiptImage,
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
    private readonly orderItems: OrderItemRepository
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

    if (isAdmin && paymentStatus === "PAYMENT_RECEIVED") {
      throw new BadRequestError(
        "O administrador deve confirmar (PAID) ou rejeitar (PENDING/REJECTED) o pagamento."
      );
    }

    if (!PAYMENT_STATUSES.includes(paymentStatus)) {
      throw new BadRequestError("Status de pagamento inválido");
    }

    const history = paymentHistoryPush(order.paymentHistory, {
      at: new Date().toISOString(),
      by: userId,
      role: primaryRoleOf(roles),
      action: "PAYMENT_STATUS",
      from: order.paymentStatus,
      to: paymentStatus,
    });

    const updated = await this.orders.update(order.id, {
      paymentStatus,
      status: paymentStatus === "PAID" ? "CONFIRMED" : order.status,
      paymentHistory: JSON.stringify(history),
    });

    return { order: updated };
  }
}