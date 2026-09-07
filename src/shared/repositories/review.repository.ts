import { BaseRepository } from "./base.repository";

const reviewUserSelect = {
  user: {
    select: { id: true, name: true, avatar: true },
  },
};

export class ReviewRepository extends BaseRepository {
  findByProduct(productId: string) {
    return this.client.review.findMany({
      where: { productId },
      include: reviewUserSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  findByStore(storeId: string) {
    return this.client.review.findMany({
      where: { storeId },
      include: {
        ...reviewUserSelect,
        product: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  findByUserAndProduct(userId: string, productId: string) {
    return this.client.review.findUnique({
      where: { userId_productId: { userId, productId } },
    });
  }

  findByUserAndStore(userId: string, storeId: string) {
    return this.client.review.findUnique({
      where: { userId_storeId: { userId, storeId } },
    });
  }

  create(data: any) {
    return this.client.review.create({
      data,
      include: reviewUserSelect,
    });
  }

  aggregateAvgByStore(storeId: string) {
    return this.client.review.aggregate({
      where: { storeId },
      _avg: { rating: true },
    });
  }

  countAll() {
    return this.client.review.count();
  }

  avgRatingAll() {
    return this.client.review.aggregate({ _avg: { rating: true } });
  }

  countFiveStar() {
    return this.client.review.count({ where: { rating: 5 } });
  }

  countCreatedSince(date: Date) {
    return this.client.review.count({
      where: { createdAt: { gte: date } },
    });
  }

  groupByRating() {
    return this.client.review.groupBy({
      by: ["rating"],
      _count: true,
      orderBy: { rating: "asc" },
    });
  }

  adminFindMany(skip: number, limit: number) {
    return this.client.review.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        product: { select: { id: true, name: true, images: true } },
        store: { select: { id: true, name: true } },
      },
    });
  }

  delete(id: string) {
    return this.client.review.delete({ where: { id } });
  }
}