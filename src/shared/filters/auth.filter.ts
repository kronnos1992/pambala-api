import { Context, Next } from "hono";
import { verifyToken } from "../../lib/auth";
import { UserRepository } from "../repositories/auth.repository";

const repo = new UserRepository();

export async function authFilter(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Token não fornecido" }, 401);
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyToken(token);

    const user = await repo.findById(decoded.userId);
    if (!user || user.tokenVersion !== (decoded.tokenVersion ?? 0)) {
      return c.json({ error: "Token revogado. Inicie sessão novamente." }, 401);
    }

    (c as any).set("userId", decoded.userId);
    (c as any).set("role", decoded.role);
    (c as any).set("tokenVersion", decoded.tokenVersion ?? 0);
    await next();
  } catch {
    return c.json({ error: "Token inválido ou expirado" }, 401);
  }
}