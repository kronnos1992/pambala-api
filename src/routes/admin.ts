import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../lib/auth";

const admin = new Hono();

function parseImages(images: any): string[] {
  if (Array.isArray(images)) return images;
  try { return JSON.parse(images); } catch { return []; }
}

function parseProductImages(product: any) {
  return { ...product, images: parseImages(product.images) };
}

function adminMiddleware(c: any, next: any) {
  const role = c.get("role");
  if (role !== "ADMIN") {
    return c.json({ error: "Acesso negado" }, 403);
  }
  return next();
}

admin.use("*", authMiddleware);
admin.use("*", adminMiddleware);

// Chart data
admin.get("/stats/charts/revenue", async (c) => {
  const days = parseInt(c.req.query("days") || "30");
  const now = new Date();
  const results = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    const [rev, orderCount] = await Promise.all([
      prisma.order.aggregate({ _sum: { total: true }, where: { createdAt: { gte: dayStart, lte: dayEnd }, status: { not: "CANCELLED" } } }),
      prisma.order.count({ where: { createdAt: { gte: dayStart, lte: dayEnd } } }),
    ]);
    results.push({
      date: dayStart.toISOString().split("T")[0],
      label: `${dayStart.getDate()}/${dayStart.getMonth() + 1}`,
      revenue: rev._sum.total || 0,
      orders: orderCount,
    });
  }
  return c.json({ data: results });
});

admin.get("/stats/charts/users", async (c) => {
  const days = parseInt(c.req.query("days") || "30");
  const now = new Date();
  const results = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    const count = await prisma.user.count({ where: { createdAt: { gte: dayStart, lte: dayEnd } } });
    results.push({
      date: dayStart.toISOString().split("T")[0],
      label: `${dayStart.getDate()}/${dayStart.getMonth() + 1}`,
      users: count,
    });
  }
  return c.json({ data: results });
});

// Section-specific stats
admin.get("/stats/orders", async (c) => {
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [total, thisMonthCount, lastMonthCount, thisMonthRevenue, lastMonthRevenue, pending, byStatus] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { createdAt: { gte: thisMonth } } }),
    prisma.order.count({ where: { createdAt: { gte: lastMonth, lt: thisMonth } } }),
    prisma.order.aggregate({ _sum: { total: true }, where: { createdAt: { gte: thisMonth }, status: { not: "CANCELLED" } } }),
    prisma.order.aggregate({ _sum: { total: true }, where: { createdAt: { gte: lastMonth, lt: thisMonth }, status: { not: "CANCELLED" } } }),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.order.groupBy({ by: ["status"], _count: true }),
  ]);
  const avgOrder = total > 0 ? (thisMonthRevenue._sum.total || 0) / (thisMonthCount || 1) : 0;
  return c.json({
    total, thisMonth: thisMonthCount, lastMonth: lastMonthCount,
    thisMonthRevenue: thisMonthRevenue._sum.total || 0, lastMonthRevenue: lastMonthRevenue._sum.total || 0,
    pending, avgOrderValue: Math.round(avgOrder),
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
  });
});

admin.get("/stats/users", async (c) => {
  const [total, buyers, sellers, admins, newThisWeek, newThisMonth, byRole] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "BUYER" } }),
    prisma.user.count({ where: { role: "SELLER" } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
    prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
    prisma.user.groupBy({ by: ["role"], _count: true }),
  ]);
  return c.json({ total, buyers, sellers, admins, newThisWeek, newThisMonth, byRole: byRole.map((r) => ({ role: r.role, count: r._count })) });
});

admin.get("/stats/stores", async (c) => {
  const [total, verified, unverified, avgRating, byProvince] = await Promise.all([
    prisma.store.count(),
    prisma.store.count({ where: { isVerified: true } }),
    prisma.store.count({ where: { isVerified: false } }),
    prisma.review.aggregate({ _avg: { rating: true } }),
    prisma.store.groupBy({ by: ["province"], _count: true, orderBy: { _count: { province: "desc" } }, take: 8 }),
  ]);
  return c.json({ total, verified, unverified, avgRating: avgRating._avg.rating || 0, byProvince: byProvince.map((p) => ({ province: p.province, count: p._count })) });
});

admin.get("/stats/products", async (c) => {
  const [total, active, inactive, avgPrice, avgRating, byCategory, newThisWeek] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: false } }),
    prisma.product.aggregate({ _avg: { price: true } }),
    prisma.review.aggregate({ _avg: { rating: true } }),
    prisma.category.findMany({ select: { name: true, _count: { select: { products: true } } }, orderBy: { _count: { products: "desc" } }, take: 6 }),
    prisma.product.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
  ]);
  return c.json({ total, active, inactive, avgPrice: Math.round(avgPrice._avg.price || 0), avgRating: avgRating._avg.rating || 0, newThisWeek, byCategory: byCategory.map((c) => ({ name: c.name, count: c._count.products })) });
});

admin.get("/stats/categories", async (c) => {
  const [total, withProducts, empty, totalSubcategories] = await Promise.all([
    prisma.category.count(),
    prisma.category.count({ where: { products: { some: {} } } }),
    prisma.category.count({ where: { products: { none: {} } } }),
    prisma.category.count({ where: { parentId: { not: null } } }),
  ]);
  const totalProductsInCategories = await prisma.product.count();
  return c.json({ total, withProducts, empty, totalSubcategories, totalProducts: totalProductsInCategories });
});

admin.get("/stats/reviews", async (c) => {
  const [total, avgRating, fiveStar, thisMonth, ratingDist] = await Promise.all([
    prisma.review.count(),
    prisma.review.aggregate({ _avg: { rating: true } }),
    prisma.review.count({ where: { rating: 5 } }),
    prisma.review.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
    prisma.review.groupBy({ by: ["rating"], _count: true, orderBy: { rating: "asc" } }),
  ]);
  const fiveStarPct = total > 0 ? Math.round((fiveStar / total) * 100) : 0;
  return c.json({ total, avgRating: avgRating._avg.rating || 0, fiveStar, fiveStarPct, thisMonth, ratingDist: ratingDist.map((r) => ({ rating: r.rating, count: r._count })) });
});

// Dashboard stats
admin.get("/stats", async (c) => {
  const [
    totalUsers,
    totalBuyers,
    totalSellers,
    totalProducts,
    activeProducts,
    totalOrders,
    totalStores,
    verifiedStores,
    totalReviews,
    revenue,
    recentOrders,
    usersThisWeek,
    ordersThisWeek,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "BUYER" } }),
    prisma.user.count({ where: { role: "SELLER" } }),
    prisma.product.count(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.order.count(),
    prisma.store.count(),
    prisma.store.count({ where: { isVerified: true } }),
    prisma.review.count(),
    prisma.order.aggregate({ _sum: { total: true }, where: { status: { not: "CANCELLED" } } }),
    prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { user: { select: { name: true } }, items: true } }),
    prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
    prisma.order.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
  ]);

  return c.json({
    totalUsers,
    totalBuyers,
    totalSellers,
    totalProducts,
    activeProducts,
    inactiveProducts: totalProducts - activeProducts,
    totalOrders,
    totalStores,
    verifiedStores,
    unverifiedStores: totalStores - verifiedStores,
    totalReviews,
    totalRevenue: revenue._sum.total || 0,
    usersThisWeek,
    ordersThisWeek,
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      total: o.total,
      status: o.status,
      createdAt: o.createdAt,
      userName: o.user?.name || "N/A",
      itemsCount: o.items.length,
    })),
  });
});

// Users
admin.get("/users", async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const role = c.req.query("role");
  const q = c.req.query("q");
  const skip = (page - 1) * limit;

  const where: any = {};
  if (role) where.role = role;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { email: { contains: q } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, phone: true, role: true, avatar: true, createdAt: true, updatedAt: true },
    }),
    prisma.user.count({ where }),
  ]);

  return c.json({ users: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

admin.put("/users/:id/role", async (c) => {
  const userId = c.req.param("id");
  const { role } = await c.req.json();
  if (!["BUYER", "SELLER", "ADMIN"].includes(role)) {
    return c.json({ error: "Role invalido" }, 400);
  }
  const user = await prisma.user.update({ where: { id: userId }, data: { role }, select: { id: true, name: true, email: true, role: true } });
  return c.json({ user });
});

admin.delete("/users/:id", async (c) => {
  const userId = c.req.param("id");
  await prisma.user.delete({ where: { id: userId } });
  return c.json({ success: true });
});

// Orders
admin.get("/orders", async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const status = c.req.query("status");
  const q = c.req.query("q");
  const skip = (page - 1) * limit;

  const where: any = {};
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { orderNumber: { contains: q } },
      { shippingName: { contains: q } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: { include: { product: { select: { id: true, name: true, images: true } } } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return c.json({
    orders: items.map((o) => ({
      ...o,
      items: o.items.map((i) => ({
        ...i,
        product: i.product ? { ...i.product, images: parseImages(i.product.images) } : i.product,
      })),
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

admin.put("/orders/:id/status", async (c) => {
  const orderId = c.req.param("id");
  const { status } = await c.req.json();
  if (!["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"].includes(status)) {
    return c.json({ error: "Status invalido" }, 400);
  }
  const order = await prisma.order.update({ where: { id: orderId }, data: { status }, select: { id: true, status: true, orderNumber: true } });
  return c.json({ order });
});

// Stores
admin.get("/stores", async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const q = c.req.query("q");
  const verified = c.req.query("verified");
  const skip = (page - 1) * limit;

  const where: any = {};
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { description: { contains: q } },
    ];
  }
  if (verified === "true") where.isVerified = true;
  if (verified === "false") where.isVerified = false;

  const [items, total] = await Promise.all([
    prisma.store.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { products: true, reviews: true } },
      },
    }),
    prisma.store.count({ where }),
  ]);

  return c.json({ stores: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

admin.put("/stores/:id/verify", async (c) => {
  const storeId = c.req.param("id");
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { isVerified: true } });
  if (!store) return c.json({ error: "Loja nao encontrada" }, 404);
  const updated = await prisma.store.update({ where: { id: storeId }, data: { isVerified: !store.isVerified } });
  return c.json({ store: updated });
});

admin.delete("/stores/:id", async (c) => {
  const storeId = c.req.param("id");
  await prisma.store.delete({ where: { id: storeId } });
  return c.json({ success: true });
});

// Products
admin.get("/products", async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const q = c.req.query("q");
  const active = c.req.query("active");
  const categoryId = c.req.query("categoryId");
  const skip = (page - 1) * limit;

  const where: any = {};
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { description: { contains: q } },
    ];
  }
  if (active === "true") where.isActive = true;
  if (active === "false") where.isActive = false;
  if (categoryId) where.categoryId = categoryId;

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        store: { select: { id: true, name: true, slug: true } },
        category: { select: { id: true, name: true, slug: true } },
        reviews: { select: { rating: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  const productsWithRating = items.map((p) => ({
    ...parseProductImages(p),
    avgRating: p.reviews.length > 0 ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length : 0,
    reviewsCount: p.reviews.length,
    reviews: undefined,
  }));

  return c.json({ products: productsWithRating, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

admin.put("/products/:id/toggle-active", async (c) => {
  const productId = c.req.param("id");
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { isActive: true } });
  if (!product) return c.json({ error: "Produto nao encontrado" }, 404);
  const updated = await prisma.product.update({ where: { id: productId }, data: { isActive: !product.isActive } });
  return c.json({ product: parseProductImages(updated) });
});

admin.delete("/products/:id", async (c) => {
  const productId = c.req.param("id");
  await prisma.product.delete({ where: { id: productId } });
  return c.json({ success: true });
});

// Categories
admin.post("/categories", async (c) => {
  const body = await c.req.json();
  const { name, slug, icon, image, parentId } = body;
  const category = await prisma.category.create({ data: { name, slug: slug || name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""), icon, image, parentId: parentId || null } });
  return c.json({ category });
});

admin.put("/categories/:id", async (c) => {
  const categoryId = c.req.param("id");
  const body = await c.req.json();
  const { name, slug, icon, image } = body;
  const data: any = {};
  if (name) data.name = name;
  if (slug) data.slug = slug;
  if (icon !== undefined) data.icon = icon;
  if (image !== undefined) data.image = image;
  const category = await prisma.category.update({ where: { id: categoryId }, data });
  return c.json({ category });
});

admin.delete("/categories/:id", async (c) => {
  const categoryId = c.req.param("id");
  await prisma.category.delete({ where: { id: categoryId } });
  return c.json({ success: true });
});

// Reviews
admin.get("/reviews", async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.review.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        product: { select: { id: true, name: true, images: true } },
        store: { select: { id: true, name: true } },
      },
    }),
    prisma.review.count(),
  ]);

  return c.json({
    reviews: items.map((r) => ({
      ...r,
      product: r.product ? { ...r.product, images: parseImages(r.product.images) } : r.product,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

admin.delete("/reviews/:id", async (c) => {
  const reviewId = c.req.param("id");
  await prisma.review.delete({ where: { id: reviewId } });
  return c.json({ success: true });
});

export default admin;
