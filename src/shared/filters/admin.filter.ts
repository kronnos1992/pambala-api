import { Context, Next } from "hono";

export async function adminFilter(c: Context, next: Next) {
  const role = (c as any).get("role");
  if (role !== "ADMIN") {
    return c.json({ error: "Acesso negado" }, 403);
  }
  return next();
}