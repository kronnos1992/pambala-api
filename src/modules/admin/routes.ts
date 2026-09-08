import { Hono } from "hono";
import { mediator } from "../../shared/mediator";
import { authFilter } from "../../shared/filters/auth.filter";
import { adminFilter } from "../../shared/filters/admin.filter";
import {
  RevenueChartQuery,
  UsersChartQuery,
  OrdersStatsQuery,
  UsersStatsQuery,
  StoresStatsQuery,
  ProductsStatsQuery,
  CategoriesStatsQuery,
  ReviewsStatsQuery,
  StoreRevenueQuery,
  DashboardStatsQuery,
  AdminUsersQuery,
  UpdateUserRoleCommand,
  DeleteUserCommand,
  AdminOrdersQuery,
  AdminUpdateOrderStatusCommand,
  AdminUpdateOrderPaymentCommand,
  AdminStoresQuery,
  VerifyStoreCommand,
  DeleteStoreCommand,
  AdminProductsQuery,
  ToggleProductActiveCommand,
  AdminDeleteProductCommand,
  CreateCategoryCommand,
  UpdateCategoryCommand,
  DeleteCategoryCommand,
  AdminCategoriesQuery,
  AdminReviewsQuery,
  DeleteReviewCommand,
} from "../../handlers/admin.handlers";

const admin = new Hono();

admin.use("*", authFilter);
admin.use("*", adminFilter);

// Chart data
admin.get("/stats/charts/revenue", async (c) => {
  const days = parseInt(c.req.query("days") || "30");

  const result = await mediator.query(new RevenueChartQuery(days));

  return c.json(result);
});

admin.get("/stats/charts/users", async (c) => {
  const days = parseInt(c.req.query("days") || "30");

  const result = await mediator.query(new UsersChartQuery(days));

  return c.json(result);
});

// Section-specific stats
admin.get("/stats/orders", async (c) => {
  const result = await mediator.query(new OrdersStatsQuery());

  return c.json(result);
});

admin.get("/stats/users", async (c) => {
  const result = await mediator.query(new UsersStatsQuery());

  return c.json(result);
});

admin.get("/stats/stores", async (c) => {
  const result = await mediator.query(new StoresStatsQuery());

  return c.json(result);
});

admin.get("/stats/products", async (c) => {
  const result = await mediator.query(new ProductsStatsQuery());

  return c.json(result);
});

admin.get("/stats/categories", async (c) => {
  const result = await mediator.query(new CategoriesStatsQuery());

  return c.json(result);
});

admin.get("/stats/reviews", async (c) => {
  const result = await mediator.query(new ReviewsStatsQuery());

  return c.json(result);
});

admin.get("/stats/store-revenue", async (c) => {
  const result = await mediator.query(new StoreRevenueQuery());

  return c.json(result);
});

// Dashboard stats
admin.get("/stats", async (c) => {
  const result = await mediator.query(new DashboardStatsQuery());

  return c.json(result);
});

// Users
admin.get("/users", async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const role = c.req.query("role");
  const q = c.req.query("q");

  const result = await mediator.query(new AdminUsersQuery(page, limit, role, q));

  return c.json(result);
});

admin.put("/users/:id/role", async (c) => {
  const userId = c.req.param("id")!;
  const body = await c.req.json();
  const roleKeys = Array.isArray(body.roles)
    ? body.roles
    : body.role
      ? [body.role]
      : [];

  const result = await mediator.send(new UpdateUserRoleCommand(userId, roleKeys));

  return c.json(result);
});

admin.delete("/users/:id", async (c) => {
  const userId = c.req.param("id")!;

  const result = await mediator.send(new DeleteUserCommand(userId));

  return c.json(result);
});

// Orders
admin.get("/orders", async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const status = c.req.query("status");
  const q = c.req.query("q");

  const result = await mediator.query(new AdminOrdersQuery(page, limit, status, q));

  return c.json(result);
});

admin.put("/orders/:id/status", async (c) => {
  const orderId = c.req.param("id")!;
  const { status } = await c.req.json();

  const result = await mediator.send(
    new AdminUpdateOrderStatusCommand(orderId, status)
  );

  return c.json(result);
});

// Admin final payment confirmation (sole authority to mark PAID / reject)
admin.put("/orders/:id/payment", async (c) => {
  const orderId = c.req.param("id")!;
  const { paymentStatus, note } = await c.req.json();

  const result = await mediator.send(
    new AdminUpdateOrderPaymentCommand(orderId, paymentStatus, note)
  );

  return c.json(result);
});

// Stores
admin.get("/stores", async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const q = c.req.query("q");
  const verified = c.req.query("verified");

  const result = await mediator.query(new AdminStoresQuery(page, limit, q, verified));

  return c.json(result);
});

admin.put("/stores/:id/verify", async (c) => {
  const storeId = c.req.param("id")!;

  const result = await mediator.send(new VerifyStoreCommand(storeId));

  return c.json(result);
});

admin.delete("/stores/:id", async (c) => {
  const storeId = c.req.param("id")!;

  const result = await mediator.send(new DeleteStoreCommand(storeId));

  return c.json(result);
});

// Products
admin.get("/products", async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const q = c.req.query("q");
  const active = c.req.query("active");
  const categoryId = c.req.query("categoryId");

  const result = await mediator.query(
    new AdminProductsQuery(page, limit, q, active, categoryId)
  );

  return c.json(result);
});

admin.put("/products/:id/toggle-active", async (c) => {
  const productId = c.req.param("id")!;

  const result = await mediator.send(new ToggleProductActiveCommand(productId));

  return c.json(result);
});

admin.delete("/products/:id", async (c) => {
  const productId = c.req.param("id")!;

  const result = await mediator.send(new AdminDeleteProductCommand(productId));

  return c.json(result);
});

// Categories
admin.get("/categories", async (c) => {
  const result = await mediator.query(new AdminCategoriesQuery());

  return c.json(result);
});

admin.post("/categories", async (c) => {
  const body = await c.req.json();
  const { name, slug, icon, image, parentId, translations } = body;

  const result = await mediator.send(
    new CreateCategoryCommand({ name, slug, icon, image, parentId, translations })
  );

  return c.json(result);
});

admin.put("/categories/:id", async (c) => {
  const categoryId = c.req.param("id")!;
  const body = await c.req.json();
  const { name, slug, icon, image, translations } = body;

  const result = await mediator.send(
    new UpdateCategoryCommand(categoryId, { name, slug, icon, image, translations })
  );

  return c.json(result);
});

admin.delete("/categories/:id", async (c) => {
  const categoryId = c.req.param("id")!;

  const result = await mediator.send(new DeleteCategoryCommand(categoryId));

  return c.json(result);
});

// Reviews
admin.get("/reviews", async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");

  const result = await mediator.query(new AdminReviewsQuery(page, limit));

  return c.json(result);
});

admin.delete("/reviews/:id", async (c) => {
  const reviewId = c.req.param("id")!;

  const result = await mediator.send(new DeleteReviewCommand(reviewId));

  return c.json(result);
});

export default admin;