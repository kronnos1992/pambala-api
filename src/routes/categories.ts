import { Hono } from "hono";
import { prisma } from "../lib/prisma";

const categories = new Hono();

categories.get("/", async (c) => {
  const categories = await prisma.category.findMany({
    where: { parentId: null },
    include: {
      children: {
        include: {
          _count: {
            select: { products: true },
          },
        },
      },
      _count: {
        select: { products: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return c.json({ categories });
});

categories.get("/:id", async (c) => {
  const id = c.req.param("id");

  const category = await prisma.category.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    include: {
      parent: {
        select: { id: true, name: true, slug: true },
      },
      children: {
        include: {
          _count: {
            select: { products: true },
          },
        },
      },
      _count: {
        select: { products: true },
      },
    },
  });

  if (!category) {
    return c.json({ error: "Categoria não encontrada" }, 404);
  }

  return c.json({ category });
});

export default categories;
