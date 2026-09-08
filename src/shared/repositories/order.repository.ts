import { BaseRepository } from "./base.repository";

const orderItemsWithProduct = {
  items: {
    include: {
      product: {
        select: { id: true, name: true, images: true },
      },
    },
  },
};

const orderItemsWithProductSlug = {
  items: {
    include: {
      product: {
        select: { id: true, name: true, images: true, slug: true },
      },
    },
  },
};

export class OrderRepository extends BaseRepository {
  findByStore(storeId: string, skip: number, limit: number) {
    return this.client.order.findMany({
      where: {
        items: {
          some: { storeId },
        },
      },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        items: {
          where: { storeId },
          include: {
            product: {
              select: { id: true, name: true, images: true },
            },
          },
        },
      },
    });
  }

  countByStore(storeId: string) {
    return this.client.order.count({
      where: {
        items: {
          some: { storeId },
        },
      },
    });
  }

  findByUser(userId: string, skip: number, limit: number) {
    return this.client.order.findMany({
      where: { userId },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: orderItemsWithProduct,
    });
  }

  countByUser(userId: string) {
    return this.client.order.count({ where: { userId } });
  }

  findByPaymentCode(code: string) {
    return this.client.order.findFirst({ where: { paymentCode: code } });
  }

  findByIdentifierForStore(identifier: string, storeId: string) {
    return this.client.order.findFirst({
      where: {
        OR: [{ id: identifier }, { orderNumber: identifier }],
        items: { some: { storeId } },
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        items: {
          where: { storeId },
          include: {
            product: {
              select: { id: true, name: true, images: true, slug: true },
            },
          },
        },
      },
    });
  }

  findByIdentifier(identifier: string) {
    return this.client.order.findFirst({
      where: {
        OR: [{ id: identifier }, { orderNumber: identifier }],
      },
    });
  }

  findById(id: string) {
    return this.client.order.findUnique({ where: { id } });
  }

  findByIdentifierWithDetails(identifier: string) {
    return this.client.order.findUnique({
      where: { id: identifier },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        ...orderItemsWithProductSlug,
      },
    });
  }

  findByOrderNumberWithDetails(orderNumber: string) {
    return this.client.order.findUnique({
      where: { orderNumber },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        ...orderItemsWithProductSlug,
      },
    });
  }

  create(data: any) {
    return this.client.order.create({
      data,
      include: orderItemsWithProduct,
    });
  }

  update(id: string, data: any) {
    return this.client.order.update({
      where: { id },
      data,
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });
  }

  updateAndSelect(id: string, data: any, select: any) {
    return this.client.order.update({
      where: { id },
      data,
      select,
    });
  }

  countAll() {
    return this.client.order.count();
  }

  countSince(date: Date) {
    return this.client.order.count({ where: { createdAt: { gte: date } } });
  }

  countBetween(from: Date, to: Date) {
    return this.client.order.count({
      where: { createdAt: { gte: from, lt: to } },
    });
  }

  countPending() {
    return this.client.order.count({ where: { status: "PENDING" } });
  }

  revenueSince(date: Date) {
    return this.client.order.aggregate({
      _sum: { total: true },
      where: { createdAt: { gte: date }, status: { not: "CANCELLED" } },
    });
  }

  revenueAll() {
    return this.client.order.aggregate({
      _sum: { total: true },
      where: { status: { not: "CANCELLED" } },
    });
  }

  revenueBetween(from: Date, to: Date) {
    return this.client.order.aggregate({
      _sum: { total: true },
      where: { createdAt: { gte: from, lt: to }, status: { not: "CANCELLED" } },
    });
  }

  groupByStatus() {
    return this.client.order.groupBy({ by: ["status"], _count: true });
  }

  recentOrders(limit: number) {
    return this.client.order.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { name: true } },
        items: true,
      },
    });
  }

  adminFindMany(where: any, skip: number, limit: number) {
    return this.client.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, images: true } },
          },
        },
      },
    });
  }

  adminCount(where: any) {
    return this.client.order.count({ where });
  }

  adminRevenueAggregate() {
    const statuses = ["PAID", "PAYMENT_RECEIVED"] as const;
    return Promise.all([
      this.client.orderItem.groupBy({
        by: ["orderId", "storeId", "productId"],
        where: { order: { paymentStatus: { in: [...statuses] } } },
        _sum: { price: true, quantity: true },
      }),
      this.client.order.findMany({
        where: { paymentStatus: { in: [...statuses] } },
        select: { id: true, paymentStatus: true },
      }),
    ]).then(([rows, orders]) => ({
      rows,
      statusByOrder: Object.fromEntries(orders.map((o) => [o.id, o.paymentStatus])),
    }));
  }
}

export class OrderItemRepository extends BaseRepository {
  findByOrderAndStore(orderId: string, storeId?: string) {
    return this.client.orderItem.findFirst({
      where: { orderId, storeId },
    });
  }
}

export class ReceiptQueueRepository extends BaseRepository {
  enqueue(orderId: string) {
    const now = new Date();
    return this.client.receiptQueue.upsert({
      where: { orderId },
      update: {
        status: "PENDING",
        attempts: 0,
        lastError: null,
        result: null,
        startedAt: null,
        completedAt: null,
        enqueuedAt: now,
      },
      create: {
        orderId,
        status: "PENDING",
        attempts: 0,
        enqueuedAt: now,
      },
    });
  }

  findByOrder(orderId: string) {
    return this.client.receiptQueue.findUnique({ where: { orderId } });
  }
}