/**
 * Seed do RBAC dinâmico (idempotente).
 *
 * - Cria as roles e responsabilidades de sistema (ADMIN, MANAGER, SELLER, CLIENT)
 * - Atribui as responsabilidades padrão de cada role de sistema
 * - Migra utilizadores legados (role string) para o modelo M:N UserRole
 *
 * Uso: npx tsx src/seed-rbac.ts
 */
import { prisma } from "./lib/prisma";
import { primaryRoleOf } from "./lib/permissions";

interface SeedItem {
  key: string;
  name: string;
  description: string;
}

const RESPONSIBILITIES: SeedItem[] = [
  { key: "admin.access", name: "Acesso à área administrativa", description: "Acede ao painel de administração" },
  { key: "admin.roles.manage", name: "Gerir roles e permissões", description: "Criar/editar roles, responsabilidades e atribuições" },
  { key: "admin.users.manage", name: "Gerir utilizadores", description: "Ver, editar roles e eliminar utilizadores" },
  { key: "admin.orders.manage", name: "Gerir pedidos", description: "Ver e alterar o estado de todos os pedidos" },
  { key: "admin.stores.manage", name: "Gerir lojas", description: "Verificar e eliminar lojas" },
  { key: "admin.products.manage", name: "Gerir produtos", description: "Gerir todos os produtos do marketplace" },
  { key: "admin.categories.manage", name: "Gerir categorias", description: "CRUD de categorias" },
  { key: "admin.reviews.manage", name: "Gerir avaliações", description: "Ver e eliminar avaliações" },
  { key: "stores.create", name: "Registar loja", description: "Cria uma loja e torna-se seller dela automaticamente" },
  { key: "stores.manage", name: "Gerir a própria loja", description: "Editar dados, logo/banner e formas de pagamento da loja" },
  { key: "products.manage", name: "Gerir produtos da loja", description: "Criar, editar e eliminar produtos da própria loja" },
  { key: "orders.view", name: "Ver pedidos da loja", description: "Consultar os pedidos recebidos pela loja" },
  { key: "orders.respond-payment", name: "Responder a pagamentos", description: "Declarar que recebeu o pagamento (confirmação final é do admin)" },
  { key: "orders.confirm-payment", name: "Confirmar pagamentos", description: "Confirmar (PAID) ou rejeitar pagamentos" },
  { key: "translations.translate", name: "Traduzir conteúdo", description: "Gerar traduções de produtos, lojas e categorias" },
  { key: "fiscal.settings.manage", name: "Gerir configuração fiscal da plataforma", description: "Certificação do software, segredo do hash e credenciais da AGT" },
  { key: "fiscal.profile.manage", name: "Gerir perfil fiscal da loja", description: "NIF, denominação, endereço e regime de IVA da própria loja" },
  { key: "fiscal.series.manage", name: "Gerir séries de faturação", description: "Abrir/fechar séries por ano civil (máx. 50 por estabelecimento/tipologia)" },
  { key: "fiscal.invoices.view", name: "Ver facturas", description: "Consultar facturas emitidas pela loja" },
  { key: "fiscal.invoices.manage", name: "Gerir facturas", description: "Emitir/anular facturas e forçar comunicação com a AGT" },
];

const ROLES: (SeedItem & { responsibilities: string[] })[] = [
  {
    key: "ADMIN",
    name: "Administrador",
    description: "Controlo total do marketplace",
    responsibilities: RESPONSIBILITIES.map((r) => r.key),
  },
  {
    key: "MANAGER",
    name: "Gestor",
    description: "Regista lojas e gere vendas; ao registar uma loja torna-se seller dela",
    responsibilities: [
      "stores.create",
      "stores.manage",
      "products.manage",
      "orders.view",
      "orders.respond-payment",
      "translations.translate",
      "fiscal.profile.manage",
      "fiscal.series.manage",
      "fiscal.invoices.view",
      "fiscal.invoices.manage",
    ],
  },
  {
    key: "SELLER",
    name: "Vendedor",
    description: "Responde a pedidos da loja e gere funções básicas da própria loja",
    responsibilities: [
      "stores.create",
      "stores.manage",
      "products.manage",
      "orders.view",
      "orders.respond-payment",
      "translations.translate",
      "fiscal.profile.manage",
      "fiscal.series.manage",
      "fiscal.invoices.view",
      "fiscal.invoices.manage",
    ],
  },
  {
    key: "CLIENT",
    name: "Cliente",
    description: "Compra e avalia produtos",
    responsibilities: [],
  },
];

const LEGACY_ROLE_MAP: Record<string, string[]> = {
  ADMIN: ["ADMIN"],
  SELLER: ["SELLER"],
  MANAGER: ["MANAGER"],
  BUYER: ["CLIENT"],
  CLIENT: ["CLIENT"],
};

async function main() {
  console.log("🌱 A criar responsabilidades de sistema...");
  for (const resp of RESPONSIBILITIES) {
    await prisma.responsibility.upsert({
      where: { key: resp.key },
      update: { name: resp.name, description: resp.description },
      create: { id: resp.key, key: resp.key, name: resp.name, description: resp.description, isSystem: true },
    });
  }

  console.log("🌱 A criar roles de sistema...");
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { key: role.key },
      update: { name: role.name, description: role.description },
      create: { key: role.key, name: role.name, description: role.description, isSystem: true },
    });
  }

  console.log("🌱 A atribuir responsabilidades às roles...");
  for (const role of ROLES) {
    const dbRole = await prisma.role.findUnique({ where: { key: role.key } });
    if (!dbRole) continue;

    await prisma.roleResponsibility.deleteMany({ where: { roleId: dbRole.id } });
    if (role.responsibilities.length > 0) {
      await prisma.roleResponsibility.createMany({
        data: role.responsibilities.map((key) => ({ roleId: dbRole.id, responsibilityId: key })),
      });
    }
  }

  console.log("🌱 A migrar utilizadores legados (role string → M:N)...");
  const users = await prisma.user.findMany({ select: { id: true, role: true } });

  let migrated = 0;
  for (const user of users) {
    const keys = LEGACY_ROLE_MAP[user.role] || ["CLIENT"];
    const roleKeys = await prisma.role.findMany({
      where: { key: { in: keys } },
      select: { id: true, key: true },
    });

    const existing = await prisma.userRole.findFirst({ where: { userId: user.id } });
    if (!existing && roleKeys.length > 0) {
      await prisma.userRole.createMany({
        data: roleKeys.map((role) => ({ userId: user.id, roleId: role.id })),
      });
      migrated++;
    }

    const primary = primaryRoleOf(roleKeys.map((r) => r.key));
    if (user.role !== primary) {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: primary },
      });
    }
  }

  console.log(`✅ Seed RBAC concluído (${migrated} utilizadores migrados).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());