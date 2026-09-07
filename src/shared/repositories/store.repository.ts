import { BaseRepository } from "./base.repository";

export const storeTranslationInclude = {
  translations: {
    select: { locale: true, province: true, district: true },
  },
};

export class StoreRepository extends BaseRepository {
  findMapStores() {
    return this.client.store.findMany({
      where: {
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        latitude: true,
        longitude: true,
        province: true,
        district: true,
        logo: true,
        translations: {
          select: { locale: true, province: true, district: true },
        },
        _count: {
          select: { products: true },
        },
      },
    });
  }

  findManyPaginated(skip: number, limit: number, orderBy: any) {
    return this.client.store.findMany({
      skip,
      take: limit,
      orderBy,
      include: {
        ...storeTranslationInclude,
        _count: {
          select: { products: true },
        },
      },
    });
  }

  countAll() {
    return this.client.store.count();
  }

  findBySlugOrIdWithCounts(idOrSlug: string) {
    return this.client.store.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        ...storeTranslationInclude,
        _count: {
          select: { products: true, reviews: true },
        },
        user: {
          select: { id: true, name: true, avatar: true },
        },
      },
    });
  }

  findByUserId(userId: string) {
    return this.client.store.findUnique({ where: { userId } });
  }

  findById(id: string) {
    return this.client.store.findUnique({ where: { id } });
  }

  findBySlug(slug: string) {
    return this.client.store.findUnique({ where: { slug } });
  }

  findBySlugExcluding(slug: string, id: string) {
    return this.client.store.findFirst({
      where: { slug, id: { not: id } },
    });
  }

  create(data: any) {
    return this.client.store.create({ data });
  }

  update(id: string, data: any) {
    return this.client.store.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.client.store.delete({ where: { id } });
  }

  upsertTranslation(storeId: string, locale: string, data: { province?: string; district?: string }) {
    return this.client.storeTranslation.upsert({
      where: { storeId_locale: { storeId, locale } },
      update: data,
      create: { storeId, locale, ...data },
    });
  }

  findTranslations(storeId: string) {
    return this.client.storeTranslation.findMany({ where: { storeId } });
  }

  incrementViews(id: string) {
    return this.client.store.update({
      where: { id },
      data: { views: { increment: 1 } },
    });
  }

  updateRating(id: string, rating: number) {
    return this.client.store.update({
      where: { id },
      data: { rating },
    });
  }

  adminFindMany(where: any, skip: number, limit: number) {
    return this.client.store.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { products: true, reviews: true } },
      },
    });
  }

  adminCount(where: any) {
    return this.client.store.count({ where });
  }

  findByIdIsVerified(id: string) {
    return this.client.store.findUnique({
      where: { id },
      select: { isVerified: true },
    });
  }

  toggleVerified(id: string, isVerified: boolean) {
    return this.client.store.update({
      where: { id },
      data: { isVerified },
    });
  }

  countVerified() {
    return this.client.store.count({ where: { isVerified: true } });
  }

  countUnverified() {
    return this.client.store.count({ where: { isVerified: false } });
  }

  groupByProvince(take: number) {
    return this.client.store.groupBy({
      by: ["province"],
      _count: true,
      orderBy: { _count: { province: "desc" } },
      take,
    });
  }
}