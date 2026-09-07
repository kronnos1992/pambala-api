import { Context, Next } from "hono";
import { resolvePermissions, PERMISSIONS } from "../../lib/permissions";

export async function adminFilter(c: Context, next: Next) {
  const roles = ((c as any).get("roles") as string[]) || [];
  const effective = await resolvePermissions(roles);
  if (!effective.has(PERMISSIONS.adminAccess)) {
    return c.json({ error: "Acesso negado" }, 403);
  }
  return next();
}