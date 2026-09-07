import { Context, Next } from "hono";
import { resolvePermissions, type PermissionKey } from "../../lib/permissions";

/**
 * Middleware que verifica se a role(s) do utilizador inclui a responsabilidade indicada.
 * Requer authFilter a correr antes (popula `roles` no contexto).
 */
export function requirePermission(key: PermissionKey) {
  return async (c: Context, next: Next) => {
    const roles = ((c as any).get("roles") as string[]) || [];
    const effective = await resolvePermissions(roles);
    if (!effective.has(key)) {
      return c.json({ error: "Não tem permissão para esta acção" }, 403);
    }
    return next();
  };
}