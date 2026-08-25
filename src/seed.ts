import { prisma } from "./lib/prisma";
import bcrypt from "bcryptjs";

async function main() {
  console.log("Seeding database...");

  const adminPassword = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@pambala.ao" },
    update: {},
    create: {
      email: "admin@pambala.ao",
      name: "Administrador",
      password: adminPassword,
      role: "ADMIN",
    },
  });
  console.log("Admin user created:", admin.email);

  const categories = [
    {
      name: "Electrónica e Tecnologia",
      slug: "electronica-tecnologia",
      icon: "smartphone",
    },
    {
      name: "Roupa e Acessórios",
      slug: "roupa-acessorios",
      icon: "shirt",
    },
    {
      name: "Eletrodomésticos",
      slug: "eletrodomesticos",
      icon: "washing-machine",
    },
    {
      name: "Móveis e Decoração",
      slug: "moveis-decoracao",
      icon: "sofa",
    },
    {
      name: "Desporto e Lazer",
      slug: "desporto-lazer",
      icon: "dumbbell",
    },
    {
      name: "Beleza e Saúde",
      slug: "beleza-saude",
      icon: "heart",
    },
    {
      name: "Serviços",
      slug: "servicos",
      icon: "briefcase",
    },
    {
      name: "Animais",
      slug: "animais",
      icon: "paw-print",
    },
  ];

  const createdCategories: Record<string, string> = {};

  for (const cat of categories) {
    const existing = await prisma.category.findUnique({
      where: { slug: cat.slug },
    });
    if (!existing) {
      const created = await prisma.category.create({
        data: { name: cat.name, slug: cat.slug, icon: cat.icon },
      });
      createdCategories[cat.slug] = created.id;
    } else {
      createdCategories[cat.slug] = existing.id;
    }
  }
  console.log("Categories created");

  const sellerPassword = await bcrypt.hash("seller123", 10);
  const seller = await prisma.user.upsert({
    where: { email: "vendedor@pambala.ao" },
    update: {},
    create: {
      email: "vendedor@pambala.ao",
      name: "Maria Silva",
      password: sellerPassword,
      role: "SELLER",
      phone: "+244912345678",
    },
  });
  console.log("Seller user created:", seller.email);

  const store = await prisma.store.upsert({
    where: { userId: seller.id },
    update: {},
    create: {
      name: "Loja Maria",
      slug: "loja-maria",
      description: "Loja de electrónica e acessórios em Luanda",
      phone: "+244912345678",
      province: "Luanda",
      district: "Ingombota",
      userId: seller.id,
      isVerified: true,
      rating: 4.5,
    },
  });
  console.log("Store created:", store.name);

  const products = [
    {
      name: "iPhone 15 Pro Max",
      slug: "iphone-15-pro-max",
      description: "O smartphone mais recente da Apple com chip A17 Pro",
      price: 850000,
      comparePrice: 950000,
      images: JSON.stringify(["/uploads/iphone15.jpg"]),
      condition: "NEW" as const,
      stock: 10,
      categoryId: createdCategories["electronica-tecnologia"],
      storeId: store.id,
      views: 245,
    },
    {
      name: "Samsung Galaxy S24 Ultra",
      slug: "samsung-galaxy-s24-ultra",
      description: "Smartphone Samsung com S Pen e câmera de 200MP",
      price: 750000,
      comparePrice: 820000,
      images: JSON.stringify(["/uploads/samsung-s24.jpg"]),
      condition: "NEW" as const,
      stock: 8,
      categoryId: createdCategories["electronica-tecnologia"],
      storeId: store.id,
      views: 189,
    },
    {
      name: "Ténis Nike Air Max",
      slug: "tenis-nike-air-max",
      description: "Ténis confortáveis para uso diário",
      price: 45000,
      comparePrice: 55000,
      images: JSON.stringify(["/uploads/nike-airmax.jpg"]),
      condition: "NEW" as const,
      stock: 25,
      categoryId: createdCategories["roupa-acessorios"],
      storeId: store.id,
      views: 120,
    },
    {
      name: "Smart TV 55\" Samsung",
      slug: "smart-tv-55-samsung",
      description: "Televisão inteligente 4K UHD de 55 polegadas",
      price: 320000,
      comparePrice: 380000,
      images: JSON.stringify(["/uploads/samsung-tv.jpg"]),
      condition: "NEW" as const,
      stock: 5,
      categoryId: createdCategories["eletrodomesticos"],
      storeId: store.id,
      views: 98,
    },
    {
      name: "Sofá 3 Lugares",
      slug: "sofa-3-lugares",
      description: "Sofá confortável em tecido cinza",
      price: 180000,
      comparePrice: 220000,
      images: JSON.stringify(["/uploads/sofa.jpg"]),
      condition: "NEW" as const,
      stock: 3,
      categoryId: createdCategories["moveis-decoracao"],
      storeId: store.id,
      views: 67,
    },
    {
      name: "Bola de Futebol Adidas",
      slug: "bola-futebol-adidas",
      description: "Bola oficial de futebol Adidas",
      price: 8500,
      images: JSON.stringify(["/uploads/bola-adidas.jpg"]),
      condition: "NEW" as const,
      stock: 50,
      categoryId: createdCategories["desporto-lazer"],
      storeId: store.id,
      views: 45,
    },
    {
      name: "Kit Maquilhagem Profissional",
      slug: "kit-maquilhagem-profissional",
      description: "Kit completo de maquilhagem com 48 peças",
      price: 35000,
      comparePrice: 42000,
      images: JSON.stringify(["/uploads/kit-maquilhagem.jpg"]),
      condition: "NEW" as const,
      stock: 15,
      categoryId: createdCategories["beleza-saude"],
      storeId: store.id,
      views: 88,
    },
    {
      name: "MacBook Pro 14\"",
      slug: "macbook-pro-14",
      description: "Portátil Apple MacBook Pro com chip M3",
      price: 1200000,
      comparePrice: 1350000,
      images: JSON.stringify(["/uploads/macbook-pro.jpg"]),
      condition: "NEW" as const,
      stock: 4,
      categoryId: createdCategories["electronica-tecnologia"],
      storeId: store.id,
      views: 312,
    },
    {
      name: "iPhone 13 (Usado)",
      slug: "iphone-13-usado",
      description: "iPhone 13 em excelente estado de conservação",
      price: 350000,
      comparePrice: 500000,
      images: JSON.stringify(["/uploads/iphone13.jpg"]),
      condition: "USED" as const,
      stock: 1,
      categoryId: createdCategories["electronica-tecnologia"],
      storeId: store.id,
      views: 156,
    },
    {
      name: "Ar Condicionado Split 12000 BTU",
      slug: "ar-condicionado-split-12000",
      description: "Ar condicionado inverter com instalação",
      price: 95000,
      comparePrice: 110000,
      images: JSON.stringify(["/uploads/ar-condicionado.jpg"]),
      condition: "NEW" as const,
      stock: 7,
      categoryId: createdCategories["eletrodomesticos"],
      storeId: store.id,
      views: 201,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: {},
      create: product,
    });
  }
  console.log("Products created:", products.length);

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
