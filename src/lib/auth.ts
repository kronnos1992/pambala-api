import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Context, Next } from "hono";

const JWT_SECRET = process.env.JWT_SECRET || "pambala-secret-key";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: {
  userId: string;
  role: string;
}): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(
  token: string
): { userId: string; role: string } {
  return jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Token não fornecido" }, 401);
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyToken(token);
    (c as any).set("userId", decoded.userId);
    (c as any).set("role", decoded.role);
    await next();
  } catch {
    return c.json({ error: "Token inválido ou expirado" }, 401);
  }
}
