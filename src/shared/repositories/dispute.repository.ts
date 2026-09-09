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

  listAdminDisputes(
    where: Record<string, unknown> = {},
    skip = 0,
    take = 20
  ) {
    return (this.client as any).orderDispute.findMany({
      where,
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
            receiptAttempts: true,
            shippingName: true,
            shippingProvince: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true } },
            items: {
              select: {
                storeId: true,
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            content: true,
            senderRole: true,
            createdAt: true,
          },
        },
        _count: { select: { messages: true } },
      },
    });
  }

  countAdminDisputes(where: Record<string, unknown> = {}) {
    return (this.client as any).orderDispute.count({ where });
  }

  disputeStats() {
    return Promise.all([
      (this.client as any).orderDispute.count(),
      (this.client as any).orderDispute.count({ where: { status: "OPEN" } }),
      (this.client as any).orderDispute.count({
        where: { status: "RESOLVED" },
      }),
      (this.client as any).orderDispute.count({ where: { status: "CLOSED" } }),
    ]).then(([total, open, resolved, closed]) => ({
      total,
      open,
      resolved,
      closed,
    }));
  }

  countUnreadMessagesByDispute(disputeIds: string[]) {
    if (!disputeIds.length) return Promise.resolve([]);
    return (this.client as any).orderDisputeMessage.groupBy({
      by: ["disputeId"],
      where: {
        disputeId: { in: disputeIds },
        senderRole: { not: "ADMIN" },
      },
      _count: { _all: true },
    });
  }

  // --- Notificações de Mensagens Não Lidas (por utilizador) ---

  listUserDisputes(userId: string, storeIds: string[], isAdmin: boolean) {
    const where: Record<string, unknown> = {};
    if (!isAdmin) {
      const or: Record<string, unknown>[] = [{ order: { userId } }];
      if (storeIds.length) {
        or.push({
          order: { items: { some: { storeId: { in: storeIds } } } },
        });
      }
      where.OR = or;
    }
    return (this.client as any).orderDispute.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        order: { select: { id: true, orderNumber: true } },
      },
    });
  }

  getReadMap(disputeIds: string[], userId: string) {
    if (!disputeIds.length) return Promise.resolve(new Map<string, Date>());
    return (this.client as any)
      .orderDisputeRead.findMany({
        where: { disputeId: { in: disputeIds }, userId },
      })
      .then((rows: any[]) => {
        const map = new Map<string, Date>();
        for (const row of rows) map.set(row.disputeId, row.lastReadAt);
        return map;
      });
  }

  markDisputeRead(disputeId: string, userId: string) {
    return (this.client as any).orderDisputeRead.upsert({
      where: { disputeId_userId: { disputeId, userId } },
      update: { lastReadAt: new Date() },
      create: { disputeId, userId },
    });
  }

  messagesToOthers(disputeIds: string[], userId: string) {
    if (!disputeIds.length) return Promise.resolve([]);
    return (this.client as any).orderDisputeMessage.findMany({
      where: {
        disputeId: { in: disputeIds },
        senderId: { not: userId },
      },
      select: {
        id: true,
        disputeId: true,
        senderRole: true,
        senderId: true,
        content: true,
        createdAt: true,
        sender: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
