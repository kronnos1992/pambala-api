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
