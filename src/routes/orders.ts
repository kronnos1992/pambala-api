import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../lib/auth";
import { orderSchema } from "../lib/validators";

function parseImages(images: any): string[] {
  if (Array.isArray(images)) return images;
  try { return JSON.parse(images); } catch { return []; }
}

function parseOrderItemImages(items: any[]): any[] {
  return items.map((item) => ({
    ...item,
    product: item.product ? { ...item.product, images: parseImages(item.product.images) } : item.product,
  }));
}

const orders = new Hono();

function generateOrderNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `PAM-${year}${month}${day}-${random}`;
}

orders.get("/seller/orders", authMiddleware, async (c) => {
  const userId = (c as any).get("userId") as string;

  const store = await prisma.store.findUnique({
    where: { userId },
  });

  if (!store) {
    return c.json({ error: "Loja não encontrada" }, 404);
  }

  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where: {
        items: {
          some: {
            storeId: store.id,
          },
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
          where: { storeId: store.id },
          include: {
            product: {
              select: { id: true, name: true, images: true },
            },
          },
        },
      },
    }),
    prisma.order.count({
      where: {
        items: {
          some: {
            storeId: store.id,
          },
        },
      },
    }),
  ]);

  return c.json({
    orders: items.map((order) => ({ ...order, items: parseOrderItemImages(order.items) })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

orders.post("/", authMiddleware, async (c) => {
  const userId = (c as any).get("userId") as string;
  const body = await c.req.json();
  const data = orderSchema.parse(body);

  const cartRecord = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
  });

  if (!cartRecord || cartRecord.items.length === 0) {
    return c.json({ error: "Carrinho vazio" }, 400);
  }

  for (const item of cartRecord.items) {
    if (item.product.stock < item.quantity) {
      return c.json(
        { error: `Estoque insuficiente para ${item.product.name}` },
        400
      );
    }
  }

  const total = cartRecord.items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  const orderNumber = generateOrderNumber();

  const order = await prisma.order.create({
    data: {
      orderNumber,
      total,
      shippingFee: 0,
      paymentMethod: data.paymentMethod,
      shippingName: data.shippingName,
      shippingPhone: data.shippingPhone,
      shippingAddress: data.shippingAddress,
      shippingProvince: data.shippingProvince,
      shippingDistrict: data.shippingDistrict,
      notes: data.notes,
      userId,
      items: {
        create: cartRecord.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.product.price,
          storeId: item.product.storeId,
        })),
      },
    },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, name: true, images: true },
          },
        },
      },
    },
  });

  for (const item of cartRecord.items) {
    await prisma.product.update({
      where: { id: item.productId },
      data: {
        stock: { decrement: item.quantity },
      },
    });
  }

  await prisma.cartItem.deleteMany({
    where: { cartId: cartRecord.id },
  });

  return c.json({ order }, 201);
});

orders.get("/", authMiddleware, async (c) => {
  const userId = (c as any).get("userId") as string;
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where: { userId },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, images: true },
            },
          },
        },
      },
    }),
    prisma.order.count({ where: { userId } }),
  ]);

  return c.json({
    orders: items.map((order) => ({ ...order, items: parseOrderItemImages(order.items) })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

orders.get("/:id", authMiddleware, async (c) => {
  const userId = (c as any).get("userId") as string;
  const role = (c as any).get("role") as string;
  const id = c.req.param("id");

  let order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, name: true, email: true, phone: true },
      },
      items: {
        include: {
          product: {
            select: { id: true, name: true, images: true, slug: true },
          },
        },
      },
    },
  });

  if (!order) {
    order = await prisma.order.findUnique({
      where: { orderNumber: id },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        items: {
          include: {
            product: {
              select: { id: true, name: true, images: true, slug: true },
            },
          },
        },
      },
    });
  }

  if (!order) {
    return c.json({ error: "Pedido não encontrado" }, 404);
  }

  if (role !== "ADMIN" && order.userId !== userId) {
    return c.json({ error: "Não autorizado" }, 403);
  }

  return c.json({ order: { ...order, items: parseOrderItemImages(order.items) } });
});

orders.put("/:id/status", authMiddleware, async (c) => {
  const role = (c as any).get("role") as string;
  const id = c.req.param("id");
  const body = await c.req.json();

  if (role !== "ADMIN") {
    return c.json({ error: "Apenas administradores podem alterar status" }, 403);
  }

  const { status } = body;

  const validStatuses = [
    "PENDING",
    "CONFIRMED",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
  ];

  if (!validStatuses.includes(status)) {
    return c.json({ error: "Status inválido" }, 400);
  }

  const order = await prisma.order.update({
    where: { id },
    data: { status },
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

  return c.json({ order: { ...order, items: parseOrderItemImages(order.items) } });
});

export default orders;
