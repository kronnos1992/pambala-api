import {
  ICommandHandler,
  IQuery,
  IQueryHandler,
} from "../shared/cqrs";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../shared/errors";
import { resolvePermissions, PERMISSIONS } from "../lib/permissions";
import { OrderRepository } from "../shared/repositories/order.repository";
import { StoreRepository } from "../shared/repositories/store.repository";
import { OrderDisputeRepository } from "../shared/repositories/dispute.repository";
import { UserRepository } from "../shared/repositories/auth.repository";
import { paymentHistoryPush } from "../shared/mappers";
import { disputeEvents } from "../shared/events/dispute-events";

// Helper de verificação de permissão tripartida
async function checkTripartiteAccess(
  order: any,
  userId: string,
  roles: string[],
  stores: StoreRepository
): Promise<{ isBuyer: boolean; isSeller: boolean; isAdmin: boolean; effectiveRole: string }> {
  const effective = await resolvePermissions(roles);
  const isAdmin =
    roles.includes("ADMIN") ||
    roles.includes("MANAGER") ||
    effective.has(PERMISSIONS.adminOrdersManage) ||
    effective.has(PERMISSIONS.disputesModerate);

  const isBuyer = order.userId === userId;

  let isSeller = false;
  if (!isAdmin && !isBuyer) {
    const store = await stores.findByUserId(userId);
    if (store && order.items) {
      isSeller = order.items.some((item: any) => item.storeId === store.id);
    }
  }

  if (!isAdmin && !isBuyer && !isSeller) {
    throw new ForbiddenError("Não autorizado a aceder a esta conversa");
  }

  let effectiveRole = "CLIENT";
  if (isAdmin) effectiveRole = "ADMIN";
  else if (isSeller) effectiveRole = "SELLER";

  return { isBuyer, isSeller, isAdmin, effectiveRole };
}

// Query: Obter detalhes e mensagens do Chat Tripartido
export class GetOrderDisputeQuery implements IQuery {
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly roles: string[]
  ) {}
}

export class GetOrderDisputeQueryHandler
  implements IQueryHandler<GetOrderDisputeQuery, any>
{
  constructor(
    private readonly orders: OrderRepository,
    private readonly stores: StoreRepository,
    private readonly disputes: OrderDisputeRepository
  ) {}

  async handle(query: GetOrderDisputeQuery) {
    const { orderId, userId, roles } = query;

    let order = await this.orders.findByIdentifierWithDetails(orderId);
    if (!order) {
      order = await this.orders.findByOrderNumberWithDetails(orderId);
    }
    if (!order) {
      throw new NotFoundError("Pedido não encontrado");
    }

    const { effectiveRole } = await checkTripartiteAccess(
      order,
      userId,
      roles,
      this.stores
    );

    let dispute = await this.disputes.findByOrderId(order.id);

    // Se a disputa ainda não existe, cria automaticamente se houver rejeição ou se solicitado
    if (!dispute) {
      const isRejected =
        order.validationStatus === "PROOF_REJECTED" ||
        order.validationStatus === "FAIL" ||
        order.paymentStatus === "REJECTED";

      if (isRejected) {
        dispute = await this.disputes.create({
          orderId: order.id,
          status: "OPEN",
          reason: "RECEIPT_REJECTED",
        });

        // Mensagem inicial automática do sistema
        await this.disputes.addMessage({
          disputeId: dispute.id,
          senderId: userId,
          senderRole: "SYSTEM",
          content:
            "Sala de mediação tripartida aberta para o pedido #" +
            order.orderNumber +
            ". O comprovativo de pagamento foi recusado pelo sistema. O comprador, o vendedor e o suporte da Pambala podem utilizar este espaço para esclarecer dúvidas e enviar novos documentos.",
        });

        dispute = await this.disputes.findByOrderId(order.id);
        disputeEvents.publish(order.id);
      }
    }

    return {
      dispute,
      currentUserRole: effectiveRole,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        validationStatus: order.validationStatus,
        receiptAttempts: (order as any).receiptAttempts || 0,
        customerName: order.user?.name,
      },
    };
  }
}

// Command: Enviar mensagem no Chat Tripartido
export class SendDisputeMessageCommand {
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly roles: string[],
    public readonly content: string,
    public readonly attachment?: string
  ) {}
}

export class SendDisputeMessageCommandHandler
  implements ICommandHandler<SendDisputeMessageCommand, any>
{
  constructor(
    private readonly orders: OrderRepository,
    private readonly stores: StoreRepository,
    private readonly disputes: OrderDisputeRepository
  ) {}

  async handle(command: SendDisputeMessageCommand) {
    const { orderId, userId, roles, content, attachment } = command;

    if (!content && !attachment) {
      throw new BadRequestError("Mensagem ou anexo é obrigatório");
    }

    let order = await this.orders.findByIdentifierWithDetails(orderId);
    if (!order) {
      order = await this.orders.findByOrderNumberWithDetails(orderId);
    }
    if (!order) {
      throw new NotFoundError("Pedido não encontrado");
    }

    const { effectiveRole } = await checkTripartiteAccess(
      order,
      userId,
      roles,
      this.stores
    );

    let dispute = await this.disputes.findByOrderId(order.id);
    if (!dispute) {
      dispute = await this.disputes.create({
        orderId: order.id,
        status: "OPEN",
        reason:
          order.validationStatus === "PROOF_REJECTED"
            ? "RECEIPT_REJECTED"
            : "ORDER_SUPPORT",
      });
    }

    const message = await this.disputes.addMessage({
      disputeId: dispute.id,
      senderId: userId,
      senderRole: effectiveRole,
      content: content ? content.trim() : "",
      attachment,
    });

    disputeEvents.publish(order.id);

    return { message, disputeId: dispute.id };
  }
}

// Command: Atualizar estado da disputa (OPEN, RESOLVED, CLOSED)
export class UpdateDisputeStatusCommand {
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly roles: string[],
    public readonly status: string
  ) {}
}

export class UpdateDisputeStatusCommandHandler
  implements ICommandHandler<UpdateDisputeStatusCommand, any>
{
  constructor(
    private readonly orders: OrderRepository,
    private readonly stores: StoreRepository,
    private readonly disputes: OrderDisputeRepository,
    private readonly users: UserRepository
  ) {}

  async handle(command: UpdateDisputeStatusCommand) {
    const { orderId, userId, roles, status } = command;

    if (!["OPEN", "RESOLVED", "CLOSED"].includes(status)) {
      throw new BadRequestError("Estado de disputa inválido");
    }

    let order = await this.orders.findByIdentifierWithDetails(orderId);
    if (!order) {
      order = await this.orders.findByOrderNumberWithDetails(orderId);
    }
    if (!order) {
      throw new NotFoundError("Pedido não encontrado");
    }

    const { effectiveRole } = await checkTripartiteAccess(
      order,
      userId,
      roles,
      this.stores
    );

    let dispute = await this.disputes.findByOrderId(order.id);
    if (!dispute) {
      throw new NotFoundError("Disputa não encontrada");
    }

    const updated = await this.disputes.updateStatus(dispute.id, status);

    const user = await this.users.findById(userId);
    const actorName = user?.name || "Utilizador";

    const statusLabels: Record<string, string> = {
      OPEN: "reaberta",
      RESOLVED: "marcada como resolvida",
      CLOSED: "encerrada",
    };

    await this.disputes.addMessage({
      disputeId: dispute.id,
      senderId: userId,
      senderRole: "SYSTEM",
      content: `Mediação ${statusLabels[status] || status} por ${actorName} (${effectiveRole}).`,
    });

    disputeEvents.publish(order.id);

    return { dispute: updated };
  }
}

// Query: Listar disputas (para Admin)
export class ListDisputesQuery implements IQuery {
  constructor(
    public readonly roles: string[],
    public readonly skip = 0,
    public readonly take = 50
  ) {}
}

export class ListDisputesQueryHandler
  implements IQueryHandler<ListDisputesQuery, any>
{
  constructor(private readonly disputes: OrderDisputeRepository) {}

  async handle(query: ListDisputesQuery) {
    const effective = await resolvePermissions(query.roles);
    const isAdmin =
      query.roles.includes("ADMIN") ||
      query.roles.includes("MANAGER") ||
      effective.has(PERMISSIONS.disputesModerate);

    if (!isAdmin) {
      throw new ForbiddenError("Apenas administradores podem listar disputas");
    }

    const items = await this.disputes.listDisputes(query.skip, query.take);
    return { disputes: items };
  }
}

// Query: Fila central de disputas para o painel Admin (paginação, filtros e stats)
export class AdminListDisputesQuery implements IQuery {
  constructor(
    public readonly roles: string[],
    public readonly page = 1,
    public readonly limit = 20,
    public readonly status?: string,
    public readonly q?: string
  ) {}
}

export class AdminListDisputesQueryHandler
  implements IQueryHandler<AdminListDisputesQuery, any>
{
  constructor(
    private readonly disputes: OrderDisputeRepository,
    private readonly stores: StoreRepository
  ) {}

  async handle(query: AdminListDisputesQuery) {
    const effective = await resolvePermissions(query.roles);
    const isAdmin =
      query.roles.includes("ADMIN") ||
      query.roles.includes("MANAGER") ||
      effective.has(PERMISSIONS.disputesModerate);

    if (!isAdmin) {
      throw new ForbiddenError("Apenas administradores podem listar disputas");
    }

    const skip = (query.page - 1) * query.limit;
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.q) {
      where.OR = [
        { order: { orderNumber: { contains: query.q } } },
        { order: { shippingName: { contains: query.q } } },
        { order: { user: { name: { contains: query.q } } } },
      ];
    }

    const items = await this.disputes.listAdminDisputes(where, skip, query.limit);
    const [total, stats] = await Promise.all([
      this.disputes.countAdminDisputes(where),
      this.disputes.disputeStats(),
    ]);

    const unreadRows = await this.disputes.countUnreadMessagesByDispute(
      items.map((d: any) => d.id)
    );
    const unreadMap = new Map(
      unreadRows.map((r: any) => [r.disputeId, r._count._all])
    );

    const storeIds = [
      ...new Set(
        items.flatMap((d: any) =>
          (d.order?.items ?? []).map((i: any) => i.storeId as string)
        )
      ),
    ] as string[];
    const stores = storeIds.length
      ? await this.stores.findByIdsWithOwner(storeIds)
      : [];
    const storeMap = new Map(stores.map((s: any) => [s.id, s]));

    return {
      disputes: items.map((d: any) => {
        const orderStoreIds = (d.order?.items ?? []).map((i: any) => i.storeId);
        const sellerStore = orderStoreIds
          .map((sid: string) => storeMap.get(sid))
          .filter((s: any) => !!s)[0];

        return {
          id: d.id,
          orderId: d.orderId,
          orderNumber: d.order?.orderNumber || d.orderId,
          status: d.status,
          reason: d.reason,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          messagesCount: d._count?.messages ?? 0,
          unreadMessages: unreadMap.get(d.id) ?? 0,
          lastMessage: d.messages?.[0]
            ? {
                content: d.messages[0].content,
                senderRole: d.messages[0].senderRole,
                createdAt: d.messages[0].createdAt,
              }
            : undefined,
          order: d.order
            ? {
                id: d.order.id,
                orderNumber: d.order.orderNumber,
                total: d.order.total,
                status: d.order.status,
                paymentStatus: d.order.paymentStatus,
                validationStatus: d.order.validationStatus,
                receiptAttempts: d.order.receiptAttempts,
                shippingName: d.order.shippingName,
                shippingProvince: d.order.shippingProvince,
                createdAt: d.order.createdAt,
              }
            : undefined,
          client: d.order?.user
            ? {
                id: d.order.user.id,
                name: d.order.user.name,
                email: d.order.user.email,
              }
            : undefined,
          seller: sellerStore
            ? {
                id: sellerStore.user?.id,
                name: sellerStore.user?.name,
                storeName: sellerStore.name,
              }
            : undefined,
        };
      }),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
      stats,
    };
  }
}

// Query: Resumo de contagens para a Central de Disputas
export class AdminDisputesStatsQuery implements IQuery {
  constructor(public readonly roles: string[]) {}
}

export class AdminDisputesStatsQueryHandler
  implements IQueryHandler<AdminDisputesStatsQuery, any>
{
  constructor(private readonly disputes: OrderDisputeRepository) {}

  async handle(query: AdminDisputesStatsQuery) {
    const effective = await resolvePermissions(query.roles);
    const isAdmin =
      query.roles.includes("ADMIN") ||
      query.roles.includes("MANAGER") ||
      effective.has(PERMISSIONS.disputesModerate);

    if (!isAdmin) {
      throw new ForbiddenError("Apenas administradores podem listar disputas");
    }

    return this.disputes.disputeStats();
  }
}

// Query: Notificações de mensagens não lidas pelo utilizador
export class UserDisputeUnreadQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly roles: string[]
  ) {}
}

export class UserDisputeUnreadQueryHandler
  implements IQueryHandler<UserDisputeUnreadQuery, any>
{
  constructor(
    private readonly disputes: OrderDisputeRepository,
    private readonly stores: StoreRepository
  ) {}

  async handle(query: UserDisputeUnreadQuery) {
    const effective = await resolvePermissions(query.roles);
    const isAdmin =
      query.roles.includes("ADMIN") ||
      query.roles.includes("MANAGER") ||
      effective.has(PERMISSIONS.adminOrdersManage) ||
      effective.has(PERMISSIONS.disputesModerate);

    let storeIds: string[] = [];
    if (!isAdmin) {
      const stores = await this.stores.findStoreIdsByOwner(query.userId);
      storeIds = stores.map((s: any) => s.id);
    }

    const disputes = await this.disputes.listUserDisputes(
      query.userId,
      storeIds,
      isAdmin
    );

    const readMap = await this.disputes.getReadMap(
      disputes.map((d: any) => d.id),
      query.userId
    );

    const messages = await this.disputes.messagesToOthers(
      disputes.map((d: any) => d.id),
      query.userId
    );

    // Filtrar apenas mensagens mais recentes que o lastReadAt (ou nenhuma leitura = todas contam)
    const items = disputes.map((d: any) => {
      const lastReadAt = readMap.get(d.id);
      const unread = messages
        .filter((m: any) => m.disputeId === d.id)
        .filter(
          (m: any) => !lastReadAt || new Date(m.createdAt) > new Date(lastReadAt)
        );

      const lastMessage = unread[0]
        ? {
            id: unread[0].id,
            senderRole: unread[0].senderRole,
            senderId: unread[0].senderId,
            senderName: unread[0].sender?.name || unread[0].senderRole,
            content: unread[0].content,
            createdAt: unread[0].createdAt,
          }
        : undefined;

      return {
        disputeId: d.id,
        orderId: d.order?.id,
        orderNumber: d.order?.orderNumber || d.orderId,
        status: d.status,
        unreadCount: unread.length,
        lastMessage,
      };
    });

    const withUnread = items.filter((i: any) => i.unreadCount > 0);
    withUnread.sort((a: any, b: any) => {
      const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bt - at;
    });

    return {
      total: withUnread.reduce((s: number, i: any) => s + i.unreadCount, 0),
      items: withUnread.slice(0, 20),
    };
  }
}

// Command: Ação de moderação manual do administrador (forçar aprovação / rejeição definitiva)
export class ModerateDisputeCommand {
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly roles: string[],
    public readonly action: "MANUAL_OVERRIDE_ACCEPT" | "DEFINITIVE_REJECT",
    public readonly note?: string
  ) {}
}

async function resolveIsAdmin(roles: string[]): Promise<boolean> {
  const effective = await resolvePermissions(roles);
  return (
    roles.includes("ADMIN") ||
    roles.includes("MANAGER") ||
    effective.has(PERMISSIONS.adminOrdersManage) ||
    effective.has(PERMISSIONS.disputesModerate) ||
    effective.has(PERMISSIONS.ordersConfirmPayment)
  );
}

export class ModerateDisputeCommandHandler
  implements ICommandHandler<ModerateDisputeCommand, any>
{
  constructor(
    private readonly orders: OrderRepository,
    private readonly disputes: OrderDisputeRepository,
    private readonly users: UserRepository
  ) {}

  async handle(command: ModerateDisputeCommand) {
    const { orderId, userId, roles, action, note } = command;

    if (!["MANUAL_OVERRIDE_ACCEPT", "DEFINITIVE_REJECT"].includes(action)) {
      throw new BadRequestError("Ação de moderação inválida");
    }

    const isAdmin = await resolveIsAdmin(roles);
    if (!isAdmin) {
      throw new ForbiddenError(
        "Apenas administradores podem executar ações de moderação"
      );
    }

    let order = await this.orders.findByIdentifierWithDetails(orderId);
    if (!order) {
      order = await this.orders.findByOrderNumberWithDetails(orderId);
    }
    if (!order) {
      throw new NotFoundError("Pedido não encontrado");
    }

    const actor = await this.users.findById(userId);
    const actorName = actor?.name || "Administrador";

    let dispute = await this.disputes.findByOrderId(order.id);
    if (!dispute) {
      dispute = await this.disputes.create({
        orderId: order.id,
        status: "OPEN",
        reason: "RECEIPT_REJECTED",
      });
    }

    const entry = {
      at: new Date().toISOString(),
      actor: "admin",
      action,
      by: userId,
      note: note || undefined,
    };

    if (action === "MANUAL_OVERRIDE_ACCEPT") {
      // Comprovativo legítimo apesar do falso positivo da IA: libera o pedido
      // para o vendedor confirmar o recebimento do pagamento.
      const updated = await this.orders.update(order.id, {
        validationStatus: "PROOF_ACCEPTED",
        validationResult: JSON.stringify({
          status: "PROOF_ACCEPTED",
          source: "MANUAL_OVERRIDE_ACCEPT",
          moderatedBy: actorName,
          moderatedAt: entry.at,
          reason: "administrative_override",
          note: note || "",
          previousStatus: order.validationStatus,
        }),
        paymentStatus: "AWAITING_PAYMENT",
        paymentHistory: JSON.stringify(
          paymentHistoryPush(order.paymentHistory, entry)
        ),
      });

      await this.disputes.updateStatus(dispute.id, "RESOLVED");

      await this.disputes.addMessage({
        disputeId: dispute.id,
        senderId: userId,
        senderRole: "SYSTEM",
        content:
          `Ação de moderação (${actorName}): o comprovativo de pagamento foi aprovado manualmente pelo suporte, ` +
          `apesar de ter sido sinalizado pela verificação automática (override). ${note ? `Motivo: ${note}. ` : ""}` +
          `O vendedor pode agora declarar o recebimento do pagamento.`,
      });

      disputeEvents.publish(order.id);

      return {
        action,
        dispute: await this.disputes.findByOrderId(order.id),
        order: {
          id: updated.id,
          orderNumber: updated.orderNumber,
          status: updated.status,
          paymentStatus: updated.paymentStatus,
          validationStatus: updated.validationStatus,
        },
      };
    }

    // DEFINITIVE_REJECT: encerra tentativas e cancela o pedido
    const updated = await this.orders.update(order.id, {
      validationStatus: "PROOF_REJECTED",
      validationResult: JSON.stringify({
        status: "PROOF_REJECTED",
        source: "DEFINITIVE_REJECT",
        moderatedBy: actorName,
        moderatedAt: entry.at,
        reason: "definitive_reject",
        note: note || "",
        previousStatus: order.validationStatus,
      }),
      receiptAttempts: Math.max(order.receiptAttempts || 0, 3),
      paymentStatus: "REJECTED",
      status: "CANCELLED",
      paymentHistory: JSON.stringify(
        paymentHistoryPush(order.paymentHistory, entry)
      ),
    });

    await this.disputes.updateStatus(dispute.id, "CLOSED");

    await this.disputes.addMessage({
      disputeId: dispute.id,
      senderId: userId,
      senderRole: "SYSTEM",
      content:
        `Ação de moderação (${actorName}): o pagamento foi rejeitado em definitivo pelo suporte. ` +
        `O pedido foi cancelado. ${note ? `Motivo: ${note}. ` : ""}`+
        "Não é possível enviar novos comprovativos para este pedido.",
    });

    disputeEvents.publish(order.id);

    return {
      action,
      dispute: await this.disputes.findByOrderId(order.id),
      order: {
        id: updated.id,
        orderNumber: updated.orderNumber,
        status: updated.status,
        paymentStatus: updated.paymentStatus,
        validationStatus: updated.validationStatus,
      },
    };
  }
}

// Command: Marcar todas as mensagens de uma disputa como lidas
export class MarkDisputeReadCommand {
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly roles: string[]
  ) {}
}

export class MarkDisputeReadCommandHandler
  implements ICommandHandler<MarkDisputeReadCommand, any>
{
  constructor(
    private readonly orders: OrderRepository,
    private readonly stores: StoreRepository,
    private readonly disputes: OrderDisputeRepository
  ) {}

  async handle(command: MarkDisputeReadCommand) {
    let order = await this.orders.findByIdentifierWithDetails(command.orderId);
    if (!order) {
      order = await this.orders.findByOrderNumberWithDetails(command.orderId);
    }
    if (!order) {
      throw new NotFoundError("Pedido não encontrado");
    }

    await checkTripartiteAccess(order, command.userId, command.roles, this.stores);

    let dispute = await this.disputes.findByOrderId(order.id);
    if (!dispute) {
      return { success: true, marked: false };
    }

    await this.disputes.markDisputeRead(dispute.id, command.userId);
    return { success: true, marked: true };
  }
}
