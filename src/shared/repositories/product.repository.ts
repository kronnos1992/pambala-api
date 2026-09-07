import { Prisma } from "@prisma/client";
import { BaseRepository } from "./base.repository";

const storeSelect = {
  id: true,
  name: true,
  slug: true,
  isVerified: true,
};

const storeLightSelect = {
  id: true,
  name: true,
  slug: true,
};

const categorySelect = {
  id: true,
  name: true,
  slug: true,
  translations: {
    select: { locale: true, name: true },
  },
};

export const productTranslationInclude = {
  translations: {
    select: { locale: true, name: true, description: true },
  },
};

const reviewsRatingSelect = {
  rating: true,
};

export class ProductRepository extends BaseRepository {
  findFeatured() {
    return this.client.product.findMany({
      where: { isActive: true },
      orderBy: { views: "desc" },
      take: 10,
      include: {
        store: { select: storeSelect },
        category: { select: categorySelect },
        reviews: { select: reviewsRatingSelect },
        ...productTranslationInclude,
      },
    });
  }

  findByCategory(categoryId: string, skip: number, limit: number) {
    return this.client.product.findMany({
      where: { categoryId, isActive: true },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        store: { select: storeSelect },
        category: { select: categorySelect },
        reviews: { select: reviewsRatingSelect },
        ...productTranslationInclude,
      },
    });
  }

  countByCategory(categoryId: string) {
    return this.client.product.count({ where: { categoryId, isActive: true } });
  }

  findMany(where: any, skip: number, limit: number, orderBy: any) {
    return this.client.product.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        store: { select: storeSelect },
        category: { select: categorySelect },
        reviews: { select: reviewsRatingSelect },
        ...productTranslationInclude,
      },
    });
  }

  count(where: any) {
    return this.client.product.count({ where });
  }

  findIdsMatching(where: any) {
    return this.client.product.findMany({
      where,
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
  }

  findByIds(ids: string[]) {
    return this.client.product.findMany({
      where: { id: { in: ids } },
      include: {
        store: { select: storeSelect },
        category: { select: categorySelect },
        reviews: { select: reviewsRatingSelect },
        ...productTranslationInclude,
      },
    });
  }

  findBySlugOrIdWithDetails(idOrSlug: string) {
    return this.client.product.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            isVerified: true,
            logo: true,
            province: true,
            district: true,
            translations: {
              select: { locale: true, province: true, district: true },
            },
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            translations: {
              select: { locale: true, name: true },
            },
          },
        },
        reviews: {
          include: {
            user: {
              select: { id: true, name: true, avatar: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        ...productTranslationInclude,
      },
    });
  }

  findById(id: string) {
    return this.client.product.findUnique({ where: { id } });
  }

  findByIdWithStore(id: string) {
    return this.client.product.findUnique({
      where: { id },
      include: { store: true },
    });
  }

  findBySlug(slug: string) {
    return this.client.product.findUnique({ where: { slug } });
  }

  findBySlugExcluding(slug: string, id: string) {
    return this.client.product.findFirst({
      where: { slug, id: { not: id } },
    });
  }

  categoryIdsByStore(storeId: string) {
    return this.client.product
      .findMany({
        where: { storeId },
        distinct: ["categoryId"],
        select: { categoryId: true },
      })
      .then((rows) => rows.map((r) => r.categoryId));
  }

  orderItemSales(productIds: string[]) {
    return this.client.orderItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true },
      where: {
        productId: { in: productIds },
        order: { status: { not: "CANCELLED" } },
      },
    });
  }

  create(data: Prisma.ProductCreateInput | Prisma.ProductUncheckedCreateInput) {
    return this.client.product.create({
      data,
      include: {
        store: { select: storeLightSelect },
        category: { select: categorySelect },
        ...productTranslationInclude,
      },
    });
  }

  update(id: string, data: any) {
    return this.client.product.update({
      where: { id },
      data,
      include: {
        store: { select: storeLightSelect },
        category: { select: categorySelect },
        ...productTranslationInclude,
      },
    });
  }

  delete(id: string) {
    return this.client.product.delete({ where: { id } });
  }

  incrementViews(id: string) {
    return this.client.product.update({
      where: { id },
      data: { views: { increment: 1 } },
    });
  }

  findByStore(storeId: string, skip: number, limit: number) {
    return this.client.product.findMany({
      where: { storeId, isActive: true },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        category: { select: categorySelect },
        reviews: { select: reviewsRatingSelect },
        ...productTranslationInclude,
      },
    });
  }

  countByStore(storeId: string) {
    return this.client.product.count({ where: { storeId, isActive: true } });
  }

  adminFindMany(where: any, skip: number, limit: number) {
    return this.client.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        store: { select: storeLightSelect },
        category: { select: categorySelect },
        reviews: { select: reviewsRatingSelect },
        ...productTranslationInclude,
      },
    });
  }

  adminCount(where: any) {
    return this.client.product.count({ where });
  }

  findByIdIsActive(id: string) {
    return this.client.product.findUnique({
      where: { id },
      select: { isActive: true },
    });
  }

  toggleActive(id: string, isActive: boolean) {
    return this.client.product.update({
      where: { id },
      data: { isActive },
    });
  }

  adminDelete(id: string) {
    return this.client.product.delete({ where: { id } });
  }

  countAll() {
    return this.client.product.count();
  }

  countActive() {
    return this.client.product.count({ where: { isActive: true } });
  }

  countInactive() {
    return this.client.product.count({ where: { isActive: false } });
  }

  avgPrice() {
    return this.client.product.aggregate({ _avg: { price: true } });
  }

  countCreatedSince(date: Date) {
    return this.client.product.count({ where: { createdAt: { gte: date } } });
  }

  upsertTranslation(productId: string, locale: string, data: { name?: string; description?: string }) {
    return this.client.productTranslation.upsert({
      where: { productId_locale: { productId, locale } },
      update: data,
      create: { productId, locale, ...data },
    });
  }

  findTranslations(productId: string) {
    return this.client.productTranslation.findMany({ where: { productId } });
  }
}