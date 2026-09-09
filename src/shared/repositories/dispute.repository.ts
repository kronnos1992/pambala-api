import { BaseRepository } from "./base.repository";

export class OrderDisputeRepository extends BaseRepository {
  findByOrderId(orderId: string) {
    return (this.client as any).orderDispute.findUnique({
      where: { orderId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            sender: {
              select: { id: true, name: true, role: true, avatar: true },
            },
          },
        },
      },
    });
  }

  create(data: { orderId: string; status?: string; reason?: string }) {
    return (this.client as any).orderDispute.create({
      data: {
        orderId: data.orderId,
        status: data.status || "OPEN",
        reason: data.reason || "PAYMENT_ISSUE",
      },
      include: {
        messages: {
          include: {
            sender: {
              select: { id: true, name: true, role: true, avatar: true },
            },
          },
        },
      },
    });
  }

  addMessage(data: {
    disputeId: string;
    senderId: string;
    senderRole: string;
    content: string;
    attachment?: string;
  }) {
    return (this.client as any).orderDisputeMessage.create({
      data: {
        disputeId: data.disputeId,
        senderId: data.senderId,
        senderRole: data.senderRole,
        content: data.content,
        attachment: data.attachment,
      },
      include: {
        sender: {
          select: { id: true, name: true, role: true, avatar: true },
        },
      },
    });
  }

  updateStatus(disputeId: string, status: string) {
    return (this.client as any).orderDispute.update({
      where: { id: disputeId },
      data: { status },
      include: {
        messages: {
          include: {
            sender: {
              select: { id: true, name: true, role: true, avatar: true },
            },
          },
        },
      },
    });
  }

  listDisputes(skip = 0, take = 50) {
    return (this.client as any).orderDispute.findMany({
      skip,
      take,
      orderBy: { updatedAt: "desc" },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            total: true,
            status: true,
            paymentStatus: true,
            validationStatus: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }
}
