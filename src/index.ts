import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import { serve } from "@hono/node-server";
import { errorHandler } from "./middleware/error-handler";
import authRoutes from "./routes/auth";
import productRoutes from "./routes/products";
import categoryRoutes from "./routes/categories";
import storeRoutes from "./routes/stores";
import cartRoutes from "./routes/cart";
import orderRoutes from "./routes/orders";
import reviewRoutes from "./routes/reviews";
import uploadRoutes from "./routes/uploads";
import adminRoutes from "./routes/admin";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());
app.use("*", errorHandler);

app.route("/api/auth", authRoutes);
app.route("/api/products", productRoutes);
app.route("/api/categories", categoryRoutes);
app.route("/api/stores", storeRoutes);
app.route("/api/cart", cartRoutes);
app.route("/api/orders", orderRoutes);
app.route("/api/reviews", reviewRoutes);
app.route("/api/uploads", uploadRoutes);
app.route("/api/admin", adminRoutes);

app.get("/uploads/*", serveStatic({ root: "./" }));

app.get("/", (c) => {
  return c.json({
    name: "Pambala API",
    version: "1.0.0",
    docs: "/api/docs",
  });
});

app.notFound((c) => {
  return c.json({ error: "Rota não encontrada" }, 404);
});

const port = parseInt(process.env.PORT || "3001");

console.log(`Pambala API running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
