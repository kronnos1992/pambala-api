import { prisma } from "./lib/prisma";
import bcrypt from "bcryptjs";

const categories = [
  { name: "Tecnologia", slug: "tecnologia", icon: "smartphone" },
  { name: "Entretenimento", slug: "entretenimento", icon: "gamepad-2" },
  { name: "Moda e Vestuario", slug: "moda-vestuario", icon: "shirt" },
  { name: "Beleza e Cuidados Pessoais", slug: "beleza-cuidados-pessoais", icon: "sparkles" },
  { name: "Casa e Decoracao", slug: "casa-decoracao", icon: "sofa" },
  { name: "Desporto e Lazer", slug: "desporto-lazer", icon: "dumbbell" },
  { name: "Veiculos", slug: "veiculos", icon: "car" },
  { name: "Infantil", slug: "infantil", icon: "baby" },
  { name: "Animais de Estimacao", slug: "animais-estimacao", icon: "paw-print" },
  { name: "Jardinagem e Construcao", slug: "jardinagem-construcao", icon: "hammer" },
  { name: "Alimentos e Bebidas", slug: "alimentos-bebidas", icon: "apple" },
  { name: "Educacao e Artes", slug: "educacao-artes", icon: "book-open" },
  { name: "Servicos", slug: "servicos", icon: "briefcase" },
];

async function main() {
  console.log("Seeding database...");

  const password = await bcrypt.hash("29091992", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@pambala.ao" },
    update: { role: "ADMIN" },
    create: {
      email: "admin@pambala.ao",
      name: "Administrador",
      password,
      role: "ADMIN",
    },
  });
  console.log("Admin:", admin.email, admin.role);

  let created = 0;
  for (const c of categories) {
    const existing = await prisma.category.findUnique({ where: { slug: c.slug } });
    if (existing) continue;
    await prisma.category.create({ data: c });
    created++;
  }
  console.log("Categories created:", created);

  console.log("Seeding completed!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });