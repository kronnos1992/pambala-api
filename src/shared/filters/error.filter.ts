import { Context } from "hono";
import { AppError } from "../errors";

export async function errorFilter(err: any, c: Context) {
  console.error("Error:", err);

  const origin = c.req.header("Origin");
  if (origin) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Session-ID, Accept, Origin, X-Requested-With"
    );
    c.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
  }

  if (err instanceof AppError) {
    return c.json({ error: err.message }, err.status as any);
  }

  if (err.name === "ZodError") {
    return c.json(
      { error: "Dados inválidos", details: err.errors },
      400
    );
  }

  if (err.code === "P2002") {
    return c.json(
      { error: "Registro já existe" },
      409
    );
  }

  if (err.code === "P2025") {
    return c.json(
      { error: "Registro não encontrado" },
      404
    );
  }

  return c.json(
    { error: err.message || "Erro interno do servidor" },
    err.status || 500
  );
}