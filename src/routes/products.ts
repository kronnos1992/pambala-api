import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../lib/auth";
import { productSchema } from "../lib/validators";

const products = new Hono();

function parseImages(images: any): string[] {
  if (Array.isArray(images)) return images;
  try {
    return JSON.parse(images);
  } catch {
    return [];
  }
}

function parseProductImages(product: any) {
  return { ...product, images: parseImages(product.images) };
}

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

products.get("/featured", async (c) => {
  const featured = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { views: "desc" },
    take: 10,
    include: {
      store: {
        select: { id: true, name: true, slug: true, isVerified: true },
      },
      category: {
        select: { id: true, name: true, slug: true },
      },
      reviews: {
        select: { rating: true },
      },
    },
  });

  const productsWithRating = featured.map((p) => ({
    ...parseProductImages(p),
    avgRating:
      p.reviews.length > 0
        ? p.reviews.reduce((sum, r) => sum + r.rating, 0) / p.reviews.length
        : 0,
    reviews: undefined,
  }));

  return c.json({ products: productsWithRating });
});

products.get("/category/:categoryId", async (c) => {
  const categoryId = c.req.param("categoryId");
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where: { categoryId, isActive: true },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        store: {
          select: { id: true, name: true, slug: true, isVerified: true },
        },
        category: {
          select: { id: true, name: true, slug: true },
        },
        reviews: {
          select: { rating: true },
        },
      },
    }),
    prisma.product.count({
      where: { categoryId, isActive: true },
    }),
  ]);

  const productsWithRating = items.map((p) => ({
    ...parseProductImages(p),
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

products.get("/", async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const q = c.req.query("q");
  const categoryId = c.req.query("categoryId");
  const storeId = c.req.query("storeId");
  const minPrice = c.req.query("minPrice");
  const maxPrice = c.req.query("maxPrice");
  const condition = c.req.query("condition");
  const sort = c.req.query("sort");

  const skip = (page - 1) * limit;

  const where: any = { isActive: true };

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }
  if (categoryId) where.categoryId = categoryId;
  if (storeId) where.storeId = storeId;
  if (minPrice) where.price = { ...where.price, gte: parseFloat(minPrice) };
  if (maxPrice) where.price = { ...where.price, lte: parseFloat(maxPrice) };
  if (condition) where.condition = condition;

  let orderBy: any = { createdAt: "desc" };
  if (sort === "price-asc") orderBy = { price: "asc" };
  else if (sort === "price-desc") orderBy = { price: "desc" };
  else if (sort === "popular") orderBy = { views: "desc" };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        store: {
          select: { id: true, name: true, slug: true, isVerified: true },
        },
        category: {
          select: { id: true, name: true, slug: true },
        },
        reviews: {
          select: { rating: true },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);

  const productsWithRating = items.map((p) => ({
    ...parseProductImages(p),
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

products.get("/:id", async (c) => {
  const idOrSlug = c.req.param("id");

  const product = await prisma.product.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
    include: {
      store: {
        select: {
          id: true,
          name: true,
          slug: true,
          isVerified: true,
          logo: true,
          province: true,
          district: true,
        },
      },
      category: {
        select: { id: true, name: true, slug: true },
      },
      reviews: {
        include: {
          user: {
            select: { id: true, name: true, avatar: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!product) {
    return c.json({ error: "Produto não encontrado" }, 404);
  }

  await prisma.product.update({
    where: { id: product.id },
    data: { views: { increment: 1 } },
  });

  const avgRating =
    product.reviews.length > 0
      ? product.reviews.reduce((sum, r) => sum + r.rating, 0) /
        product.reviews.length
      : 0;

  return c.json({ product: parseProductImages({ ...product, avgRating }) });
});

products.post("/", authMiddleware, async (c) => {
  const role = (c as any).get("role") as string;

  if (role !== "SELLER" && role !== "ADMIN") {
    return c.json({ error: "Apenas vendedores podem criar produtos" }, 403);
  }

  const userId = (c as any).get("userId") as string;
  const body = await c.req.json();
  const data = productSchema.parse(body);

  const store = await prisma.store.findUnique({
    where: { userId },
  });

  if (!store) {
    return c.json({ error: "Você não tem uma loja" }, 400);
  }

  let slug = slugify(data.name);
  const existingSlug = await prisma.product.findUnique({ where: { slug } });
  if (existingSlug) {
    slug = `${slug}-${Date.now()}`;
  }

  const product = await prisma.product.create({
    data: {
      name: data.name,
      slug,
      description: data.description,
      price: data.price,
      comparePrice: data.comparePrice,
      images: JSON.stringify(data.images),
      condition: data.condition,
      stock: data.stock,
      isActive: data.isActive ?? true,
      storeId: store.id,
      categoryId: data.categoryId,
    },
    include: {
      store: {
        select: { id: true, name: true, slug: true },
      },
      category: {
        select: { id: true, name: true, slug: true },
      },
    },
  });

  return c.json({ product: parseProductImages(product) }, 201);
});

products.put("/:id", authMiddleware, async (c) => {
  const userId = (c as any).get("userId") as string;
  const id = c.req.param("id");
  const body = await c.req.json();

  const existingProduct = await prisma.product.findUnique({
    where: { id },
    include: { store: true },
  });

  if (!existingProduct) {
    return c.json({ error: "Produto não encontrado" }, 404);
  }

  if (existingProduct.store.userId !== userId) {
    return c.json({ error: "Não autorizado" }, 403);
  }

  const updateData: any = {};
  if (body.name) {
    updateData.name = body.name;
    let slug = slugify(body.name);
    const existingSlug = await prisma.product.findFirst({
      where: { slug, id: { not: id } },
    });
    if (existingSlug) slug = `${slug}-${Date.now()}`;
    updateData.slug = slug;
  }
  if (body.description !== undefined) updateData.description = body.description;
  if (body.price !== undefined) updateData.price = body.price;
  if (body.comparePrice !== undefined) updateData.comparePrice = body.comparePrice;
  if (body.images) updateData.images = JSON.stringify(body.images);
  if (body.condition) updateData.condition = body.condition;
  if (body.stock !== undefined) updateData.stock = body.stock;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;
  if (body.categoryId) updateData.categoryId = body.categoryId;

  const product = await prisma.product.update({
    where: { id },
    data: updateData,
    include: {
      store: {
        select: { id: true, name: true, slug: true },
      },
      category: {
        select: { id: true, name: true, slug: true },
      },
    },
  });

  return c.json({ product: parseProductImages(product) });
});

products.delete("/:id", authMiddleware, async (c) => {
  const userId = (c as any).get("userId") as string;
  const id = c.req.param("id");

  const existingProduct = await prisma.product.findUnique({
    where: { id },
    include: { store: true },
  });

  if (!existingProduct) {
    return c.json({ error: "Produto não encontrado" }, 404);
  }

  if (existingProduct.store.userId !== userId) {
    return c.json({ error: "Não autorizado" }, 403);
  }

  await prisma.product.delete({ where: { id } });

  return c.json({ message: "Produto eliminado" });
});

export default products;
