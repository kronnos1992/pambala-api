import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../lib/auth";
import { storeSchema } from "../lib/validators";

const stores = new Hono();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

stores.get("/map", async (c) => {
  const stores = await prisma.store.findMany({
    where: {
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      latitude: true,
      longitude: true,
      province: true,
      district: true,
      logo: true,
      _count: {
        select: { products: true },
      },
    },
  });

  return c.json({ stores });
});

stores.post("/", authMiddleware, async (c) => {
  const role = (c as any).get("role") as string;
  const userId = (c as any).get("userId") as string;

  if (role !== "SELLER" && role !== "ADMIN") {
    return c.json({ error: "Apenas vendedores podem criar lojas" }, 403);
  }

  const existingStore = await prisma.store.findUnique({
    where: { userId },
  });

  if (existingStore) {
    return c.json({ error: "Você já tem uma loja" }, 409);
  }

  const body = await c.req.json();
  const data = storeSchema.parse(body);

  let slug = slugify(data.name);
  const existingSlug = await prisma.store.findUnique({ where: { slug } });
  if (existingSlug) {
    slug = `${slug}-${Date.now()}`;
  }

  const store = await prisma.store.create({
    data: {
      name: data.name,
      slug,
      description: data.description,
      phone: data.phone,
      province: data.province,
      district: data.district,
      userId,
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { role: "SELLER" },
  });

  return c.json({ store }, 201);
});

stores.get("/", async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.store.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { products: true },
        },
      },
    }),
    prisma.store.count(),
  ]);

  return c.json({
    stores: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

stores.get("/:idOrSlug", async (c) => {
  const idOrSlug = c.req.param("idOrSlug");

  const store = await prisma.store.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
    include: {
      _count: {
        select: { products: true, reviews: true },
      },
      user: {
        select: { id: true, name: true, avatar: true },
      },
    },
  });

  if (!store) {
    return c.json({ error: "Loja não encontrada" }, 404);
  }

  return c.json({ store });
});

stores.put("/", authMiddleware, async (c) => {
  const userId = (c as any).get("userId") as string;
  const body = await c.req.json();

  const existingStore = await prisma.store.findUnique({
    where: { userId },
  });

  if (!existingStore) {
    return c.json({ error: "Loja não encontrada" }, 404);
  }

  const updateData: any = {};
  if (body.name) {
    updateData.name = body.name;
    let slug = slugify(body.name);
    const existingSlug = await prisma.store.findFirst({
      where: { slug, id: { not: existingStore.id } },
    });
    if (existingSlug) slug = `${slug}-${Date.now()}`;
    updateData.slug = slug;
  }
  if (body.description !== undefined) updateData.description = body.description;
  if (body.phone !== undefined) updateData.phone = body.phone;
  if (body.logo !== undefined) updateData.logo = body.logo;
  if (body.banner !== undefined) updateData.banner = body.banner;
  if (body.province) updateData.province = body.province;
  if (body.district !== undefined) updateData.district = body.district;
  if (body.latitude !== undefined) updateData.latitude = body.latitude;
  if (body.longitude !== undefined) updateData.longitude = body.longitude;

  const store = await prisma.store.update({
    where: { id: existingStore.id },
    data: updateData,
  });

  return c.json({ store });
});

stores.get("/:id/products", async (c) => {
  const idOrSlug = c.req.param("id");
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const skip = (page - 1) * limit;

  const store = await prisma.store.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
  });

  if (!store) {
    return c.json({ error: "Loja não encontrada" }, 404);
  }

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where: { storeId: store.id, isActive: true },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
        reviews: {
          select: { rating: true },
        },
      },
    }),
    prisma.product.count({
      where: { storeId: store.id, isActive: true },
    }),
  ]);

  const productsWithRating = items.map((p) => ({
    ...p,
    avgRating:
      p.reviews.length > 0
        ? p.reviews.reduce((sum, r) => sum + r.rating, 0) / p.reviews.length
        : 0,
    reviews: undefined,
  }));

  return c.json({
    products: productsWithRating,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export default stores;
