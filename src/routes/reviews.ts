import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../lib/auth";
import { reviewSchema } from "../lib/validators";

const reviews = new Hono();

reviews.get("/product/:productId", async (c) => {
  const productId = c.req.param("productId");

  const reviewsList = await prisma.review.findMany({
    where: { productId },
    include: {
      user: {
        select: { id: true, name: true, avatar: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const avgRating =
    reviewsList.length > 0
      ? reviewsList.reduce((sum, r) => sum + r.rating, 0) / reviewsList.length
      : 0;

  return c.json({
    reviews: reviewsList,
    avgRating,
    totalReviews: reviewsList.length,
  });
});

reviews.get("/store/:storeId", async (c) => {
  const storeId = c.req.param("storeId");

  const reviewsList = await prisma.review.findMany({
    where: { storeId },
    include: {
      user: {
        select: { id: true, name: true, avatar: true },
      },
      product: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const avgRating =
    reviewsList.length > 0
      ? reviewsList.reduce((sum, r) => sum + r.rating, 0) / reviewsList.length
      : 0;

  return c.json({
    reviews: reviewsList,
    avgRating,
    totalReviews: reviewsList.length,
  });
});

reviews.post("/", authMiddleware, async (c) => {
  const userId = (c as any).get("userId") as string;
  const body = await c.req.json();
  const data = reviewSchema.parse(body);

  if (!data.productId && !data.storeId) {
    return c.json({ error: "productId ou storeId é obrigatório" }, 400);
  }

  if (data.productId) {
    const existingReview = await prisma.review.findUnique({
      where: {
        userId_productId: {
          userId,
          productId: data.productId,
        },
      },
    });

    if (existingReview) {
      return c.json({ error: "Você já avaliou este produto" }, 409);
    }
  }

  const review = await prisma.review.create({
    data: {
      rating: data.rating,
      comment: data.comment,
      userId,
      productId: data.productId || null,
      storeId: data.storeId || null,
    },
    include: {
      user: {
        select: { id: true, name: true, avatar: true },
      },
    },
  });

  if (data.storeId) {
    const storeReviews = await prisma.review.aggregate({
      where: { storeId: data.storeId },
      _avg: { rating: true },
    });

    if (storeReviews._avg.rating) {
      await prisma.store.update({
        where: { id: data.storeId },
        data: { rating: storeReviews._avg.rating },
      });
    }
  }

  return c.json({ review }, 201);
});

export default reviews;
