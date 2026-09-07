import { BaseRepository } from "./base.repository";

const translationSelect = { locale: true, name: true };

export class CategoryRepository extends BaseRepository {
  findTree() {
    return this.client.category.findMany({
      where: { parentId: null },
      include: {
        children: {
          include: {
            translations: { select: translationSelect },
            _count: {
              select: { products: true },
            },
          },
        },
        translations: { select: translationSelect },
        _count: {
          select: { products: true },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  findBySlugOrId(idOrSlug: string) {
    return this.client.category.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        parent: {
          select: { id: true, name: true, slug: true },
        },
        children: {
          include: {
            translations: { select: translationSelect },
            _count: {
              select: { products: true },
            },
          },
        },
        translations: { select: translationSelect },
        _count: {
          select: { products: true },
        },
      },
    });
  }

  create(data: any) {
    return this.client.category.create({ data });
  }

  update(id: string, data: any) {
    return this.client.category.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.client.category.delete({ where: { id } });
  }

  upsertTranslation(categoryId: string, locale: string, name?: string) {
    return this.client.categoryTranslation.upsert({
      where: { categoryId_locale: { categoryId, locale } },
      update: { name },
      create: { categoryId, locale, name },
    });
  }

  findTranslations(categoryId: string) {
    return this.client.categoryTranslation.findMany({ where: { categoryId } });
  }

  countAll() {
    return this.client.category.count();
  }

  countWithProducts() {
    return this.client.category.count({ where: { products: { some: {} } } });
  }

  countEmpty() {
    return this.client.category.count({ where: { products: { none: {} } } });
  }

  countSubcategories() {
    return this.client.category.count({ where: { parentId: { not: null } } });
  }

  findTopByProducts(take: number) {
    return this.client.category.findMany({
      select: { name: true, _count: { select: { products: true } } },
      orderBy: { products: { _count: "desc" } },
      take,
    });
  }
}