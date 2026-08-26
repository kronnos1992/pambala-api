import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../lib/auth";

function parseImages(images: any): string[] {
  if (Array.isArray(images)) return images;
  try { return JSON.parse(images); } catch { return []; }
}

function parseCartProduct(product: any) {
  if (!product) return product;
  return { ...product, images: parseImages(product.images) };
}

const cart = new Hono();

cart.use("*", authMiddleware);

cart.get("/", async (c) => {
  const userId = (c as any).get("userId") as string;

  let cartRecord = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          product: {
            include: {
              store: {
                select: { id: true, name: true, slug: true },
              },
            },
          },
        },
      },
    },
  });

  if (!cartRecord) {
    cartRecord = await prisma.cart.create({
      data: { userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                store: {
                  select: { id: true, name: true, slug: true },
                },
              },
            },
          },
        },
      },
    });
  }

  const total = cartRecord.items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  return c.json({
    cart: {
      ...cartRecord,
      total,
      items: cartRecord.items.map((item) => ({
        ...item,
        product: parseCartProduct(item.product),
      })),
    },
  });
});

cart.post("/items", async (c) => {
  const userId = (c as any).get("userId") as string;
  const body = await c.req.json();
  const { productId, quantity = 1 } = body;

  if (!productId) {
    return c.json({ error: "productId é obrigatório" }, 400);
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product || !product.isActive) {
    return c.json({ error: "Produto não encontrado" }, 404);
  }

  if (product.stock < quantity) {
    return c.json({ error: "Estoque insuficiente" }, 400);
  }

  let cartRecord = await prisma.cart.findUnique({
    where: { userId },
  });

  if (!cartRecord) {
    cartRecord = await prisma.cart.create({
      data: { userId },
    });
  }

  const existingItem = await prisma.cartItem.findUnique({
    where: {
      cartId_productId: {
        cartId: cartRecord.id,
        productId,
      },
    },
  });

  if (existingItem) {
    const newQuantity = existingItem.quantity + quantity;
    if (newQuantity > product.stock) {
      return c.json({ error: "Estoque insuficiente" }, 400);
    }
    await prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity: newQuantity },
    });
  } else {
    await prisma.cartItem.create({
      data: {
        cartId: cartRecord.id,
        productId,
        quantity,
      },
    });
  }

  const updatedCart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          product: {
            include: {
              store: {
                select: { id: true, name: true, slug: true },
              },
            },
          },
        },
      },
    },
  });

  const total = updatedCart!.items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  return c.json({
    cart: {
      ...updatedCart!,
      total,
      items: updatedCart!.items.map((item) => ({
        ...item,
        product: parseCartProduct(item.product),
      })),
    },
  });
});

cart.put("/items/:itemId", async (c) => {
  const userId = (c as any).get("userId") as string;
  const itemId = c.req.param("itemId");
  const body = await c.req.json();
  const { quantity } = body;

  if (!quantity || quantity < 1) {
    return c.json({ error: "Quantidade inválida" }, 400);
  }

  const cartRecord = await prisma.cart.findUnique({
    where: { userId },
  });

  if (!cartRecord) {
    return c.json({ error: "Carrinho não encontrado" }, 404);
  }

  const cartItem = await prisma.cartItem.findFirst({
    where: {
      id: itemId,
      cartId: cartRecord.id,
    },
    include: { product: true },
  });

  if (!cartItem) {
    return c.json({ error: "Item não encontrado" }, 404);
  }

  if (quantity > cartItem.product.stock) {
    return c.json({ error: "Estoque insuficiente" }, 400);
  }

  await prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity },
  });

  return c.json({ message: "Item atualizado" });
});

cart.delete("/items/:itemId", async (c) => {
  const userId = (c as any).get("userId") as string;
  const itemId = c.req.param("itemId");

  const cartRecord = await prisma.cart.findUnique({
    where: { userId },
  });

  if (!cartRecord) {
    return c.json({ error: "Carrinho não encontrado" }, 404);
  }

  const cartItem = await prisma.cartItem.findFirst({
    where: {
      id: itemId,
      cartId: cartRecord.id,
    },
  });

  if (!cartItem) {
    return c.json({ error: "Item não encontrado" }, 404);
  }

  await prisma.cartItem.delete({ where: { id: itemId } });

  return c.json({ message: "Item removido" });
});

cart.delete("/", async (c) => {
  const userId = (c as any).get("userId") as string;

  const cartRecord = await prisma.cart.findUnique({
    where: { userId },
  });

  if (!cartRecord) {
    return c.json({ error: "Carrinho não encontrado" }, 404);
  }

  await prisma.cartItem.deleteMany({
    where: { cartId: cartRecord.id },
  });

  return c.json({ message: "Carrinho limpo" });
});

export default cart;
