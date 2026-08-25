import { Context, Next } from "hono";

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (err: any) {
    console.error("Error:", err);

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
}
