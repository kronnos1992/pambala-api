import { prisma } from "./prisma";
import { ForbiddenError } from "../shared/errors";

/**
 * Catálogo de responsabilidades do sistema.
 * As roles são dinâmicas (criadas via /api/roles), mas as responsabilidades
 * abaixo são as chaves que o código consulta nos guards.
 */
export const PERMISSIONS = {
  // Área administrativa
  adminAccess: "admin.access",
  adminRolesManage: "admin.roles.manage",
  adminUsersManage: "admin.users.manage",
  adminOrdersManage: "admin.orders.manage",
  adminStoresManage: "admin.stores.manage",
  adminProductsManage: "admin.products.manage",
  adminCategoriesManage: "admin.categories.manage",
  adminReviewsManage: "admin.reviews.manage",
  // Lojas e vendas
  storesCreate: "stores.create",
  storesManage: "stores.manage",
  productsManage: "products.manage",
  ordersView: "orders.view",
  ordersRespondPayment: "orders.respond-payment",
  ordersConfirmPayment: "orders.confirm-payment",
  // Traduções
  translationsTranslate: "translations.translate",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Ordem canónica para definir a role "primária" de um utilizador. */
export const ROLE_PRIORITY = ["ADMIN", "MANAGER", "SELLER", "CLIENT"];

export function primaryRoleOf(roleKeys: string[]): string {
  for (const candidate of ROLE_PRIORITY) {
    if (roleKeys.includes(candidate)) return candidate;
  }
  return roleKeys[0] || "CLIENT";
}

/** Sistema roles pré-definidos (não podem ser apagados). */
export const SYSTEM_ROLE_KEYS = ["ADMIN", "MANAGER", "SELLER", "CLIENT"];

/**
 * Cache roleKey -> Set<responsibilityKey>.
 * É invalidado sempre que roles/responsabilidades/atribuições mudam.
 */
let permissionsCache: Map<string, Set<string>> | null = null;

export async function getRolePermissions(): Promise<Map<string, Set<string>>> {
  if (permissionsCache) return permissionsCache;

  const rows = await prisma.roleResponsibility.findMany({
    select: { role: { select: { key: true } }, responsibility: { select: { key: true } } },
  });

  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!map.has(r.role.key)) map.set(r.role.key, new Set());
    map.get(r.role.key)!.add(r.responsibility.key);
  }

  permissionsCache = map;
  return permissionsCache;
}

export function invalidatePermissionsCache(): void {
  permissionsCache = null;
}

/** Resolve o conjunto de responsabilidades efectivas de um utilizador (união das suas roles). */
export async function resolvePermissions(roleKeys: string[]): Promise<Set<string>> {
  const rolePermissions = await getRolePermissions();
  const effective = new Set<string>();
  for (const key of roleKeys) {
    const perms = rolePermissions.get(key);
    if (perms) {
      for (const p of perms) effective.add(p);
    }
  }
  return effective;
}

export async function hasPermission(roleKeys: string[], key: PermissionKey): Promise<boolean> {
  const effective = await resolvePermissions(roleKeys);
  return effective.has(key);
}

export async function assertPermission(roleKeys: string[], key: PermissionKey): Promise<void> {
  const effective = await resolvePermissions(roleKeys);
  if (!effective.has(key)) {
    throw new ForbiddenError("Não tem permissão para esta acção");
  }
}

export function hasAnyRole(roleKeys: string[], needed: string[]): boolean {
  return roleKeys.some((k) => needed.includes(k));
}