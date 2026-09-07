import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "@hono/node-server/serve-static";
import { serve } from "@hono/node-server";
import { errorFilter } from "./shared/filters/error.filter";
import { registerHandlers } from "./handlers/registry";
import { e2eDecryptMiddleware, e2eEncryptMiddleware } from "./middleware/e2e.middleware";
import { securityHeaders } from "./middleware/security-headers";
import { generalRateLimit } from "./middleware/rate-limit";
import authRoutes from "./modules/auth/routes";
import productRoutes from "./modules/products/routes";
import categoryRoutes from "./modules/categories/routes";
import storeRoutes from "./modules/stores/routes";
import cartRoutes from "./modules/cart/routes";
import orderRoutes from "./modules/orders/routes";
import reviewRoutes from "./modules/reviews/routes";
import uploadRoutes from "./modules/uploads/routes";
import adminRoutes from "./modules/admin/routes";
import translationRoutes from "./modules/translations/routes";
import securityRoutes from "./modules/security/routes";

registerHandlers();

const app = new Hono();

const defaultOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3002",
];
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : defaultOrigins;

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: allowedOrigins,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Session-ID"],
    maxAge: 86400,
  })
);
app.use("*", securityHeaders);

const jsonBodyLimit = bodyLimit({
  maxSize: 1024 * 1024,
  onError: (c) => c.json({ error: "Payload demasiado grande" }, 413),
});
const uploadBodyLimit = bodyLimit({
  maxSize: 10 * 1024 * 1024,
  onError: (c) => c.json({ error: "Ficheiro demasiado grande (máx 10MB)" }, 413),
});
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/api/uploads")) return uploadBodyLimit(c, next);
  return jsonBodyLimit(c, next);
});
app.onError(errorFilter);

// 🛡️ Rate limit global
app.use("*", generalRateLimit);

// 🔐 E2E Decryption Middleware (ANTES das rotas)
app.use("*", e2eDecryptMiddleware);

// 🔐 E2E Encryption Middleware (DEPOIS das rotas)
app.use("*", e2eEncryptMiddleware());

// Rotas
app.route("/api/security", securityRoutes);
app.route("/api/auth", authRoutes);
app.route("/api/products", productRoutes);
app.route("/api/categories", categoryRoutes);
app.route("/api/stores", storeRoutes);
app.route("/api/cart", cartRoutes);
app.route("/api/orders", orderRoutes);
app.route("/api/reviews", reviewRoutes);
app.route("/api/uploads", uploadRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/translations", translationRoutes);

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
// security-hardening v2
