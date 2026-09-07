import {
  ICommand,
  ICommandHandler,
  IQuery,
  IQueryHandler,
} from "../shared/cqrs";
import { ProductRepository } from "../shared/repositories/product.repository";
import { StoreRepository } from "../shared/repositories/store.repository";
import { CategoryRepository } from "../shared/repositories/category.repository";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../shared/errors";
import {
  applyLocalized,
  computeAvgRating,
  normalizeLocale,
  parseProductImages,
  slugify,
  stripTranslations,
} from "../shared/mappers";
import { ProductInput } from "../lib/validators";

export class FeaturedProductsQuery implements IQuery {
  constructor(public readonly locale?: string) {}
}

export class ProductsByCategoryQuery implements IQuery {
  constructor(
    public readonly categoryId: string,
    public readonly page: number,
    public readonly limit: number,
    public readonly locale?: string
  ) {}
}

export class ListProductsQuery implements IQuery {
  constructor(
    public readonly filters: {
      page: number;
      limit: number;
      q?: string;
      categoryId?: string;
      categorySlug?: string;
      storeId?: string;
      minPrice?: string;
      maxPrice?: string;
      condition?: string;
      sort?: string;
      locale?: string;
    }
  ) {}
}

export class GetProductQuery implements IQuery {
  constructor(
    public readonly idOrSlug: string,
    public readonly locale?: string
  ) {}
}

export class CreateProductCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly role: string,
    public readonly data: ProductInput
  ) {}
}

export class UpdateProductCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly id: string,
    public readonly body: any
  ) {}
}

export class DeleteProductCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly id: string
  ) {}
}

export async function attachSales(
  repo: ProductRepository,
  items: any[]
): Promise<any[]> {
  if (items.length === 0) return items;
  const ids = items.map((p) => p.id);
  const sales = await repo.orderItemSales(ids);
  const salesMap = new Map(
    sales.map((s) => [s.productId, s._sum.quantity || 0])
  );
  return items.map((p) => ({ ...p, salesCount: salesMap.get(p.id) || 0 }));
}

function localizeProduct(product: any, locale?: string): any {
  let p = applyLocalized(product, locale, ["name", "description"]);
  if (p.category) {
    const c = applyLocalized(p.category, locale, ["name"]);
    p = { ...p, category: stripTranslations(c) };
  }
  if (p.store) {
    const s = applyLocalized(p.store, locale, ["province", "district"]);
    p = { ...p, store: stripTranslations(s) };
  }
  return stripTranslations(p);
}

export class FeaturedProductsQueryHandler
  implements IQueryHandler<FeaturedProductsQuery, any>
{
  constructor(private readonly products: ProductRepository) {}

  async handle(query: FeaturedProductsQuery) {
    const featured = await this.products.findFeatured();

    const productsWithRating = featured.map((p) =>
      localizeProduct(
        {
          ...parseProductImages(p),
          avgRating: computeAvgRating(p.reviews),
          reviews: undefined,
        },
        query.locale
      )
    );

    return {
      products: await attachSales(this.products, productsWithRating),
    };
  }
}

export class ProductsByCategoryQueryHandler
  implements IQueryHandler<ProductsByCategoryQuery, any>
{
  constructor(private readonly products: ProductRepository) {}

  async handle(query: ProductsByCategoryQuery) {
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.products.findByCategory(query.categoryId, skip, query.limit),
      this.products.countByCategory(query.categoryId),
    ]);

    const productsWithRating = items.map((p) =>
      localizeProduct(
        {
          ...parseProductImages(p),
          avgRating: computeAvgRating(p.reviews),
          reviews: undefined,
        },
        query.locale
      )
    );

    return {
      products: await attachSales(this.products, productsWithRating),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}

export class ListProductsQueryHandler
  implements IQueryHandler<ListProductsQuery, any>
{
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository
  ) {}

  async handle(query: ListProductsQuery) {
    const { filters } = query;
    const page = filters.page;
    const limit = filters.limit;
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };

    if (filters.q) {
      where.OR = [
        { name: { contains: filters.q } },
        { description: { contains: filters.q } },
      ];
    }
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.categorySlug) {
      const cat = await this.categories.findBySlugOrId(filters.categorySlug);
      if (cat) where.categoryId = cat.id;
    }
    if (filters.storeId) where.storeId = filters.storeId;
    if (filters.minPrice) {
      where.price = { ...where.price, gte: parseFloat(filters.minPrice) };
    }
    if (filters.maxPrice) {
      where.price = { ...where.price, lte: parseFloat(filters.maxPrice) };
    }
    if (filters.condition) where.condition = filters.condition;

    let orderBy: any = { createdAt: "desc" };
    if (filters.sort === "price-asc") orderBy = { price: "asc" };
    else if (filters.sort === "price-desc") orderBy = { price: "desc" };
    else if (filters.sort === "popular") orderBy = { views: "desc" };

    let items: any[] = [];
    let total = 0;

    if (filters.sort === "best-sellers") {
      const matching = await this.products.findIdsMatching(where);
      total = matching.length;
      const pageIds = matching.map((m) => m.id).slice(skip, skip + limit);
      const sales = await this.products.orderItemSales(pageIds);
      const salesMap = new Map(
        sales.map((s) => [s.productId, s._sum.quantity || 0])
      );
      pageIds.sort((a, b) => (salesMap.get(b) || 0) - (salesMap.get(a) || 0));
      const found = await this.products.findByIds(pageIds);
      const byId = new Map(found.map((p) => [p.id, p]));
      items = pageIds.map((id) => byId.get(id)).filter(Boolean);
    } else {
      [items, total] = await Promise.all([
        this.products.findMany(where, skip, limit, orderBy),
        this.products.count(where),
      ]);
    }

    const locale = filters.locale;
    const productsWithRating = items.map((p) =>
      localizeProduct(
        {
          ...parseProductImages(p),
          avgRating: computeAvgRating(p.reviews),
          reviews: undefined,
        },
        locale
      )
    );

    return {
      products: await attachSales(this.products, productsWithRating),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export class GetProductQueryHandler
  implements IQueryHandler<GetProductQuery, any>
{
  constructor(private readonly products: ProductRepository) {}

  async handle(query: GetProductQuery) {
    const product = await this.products.findBySlugOrIdWithDetails(
      query.idOrSlug
    );

    if (!product) {
      throw new NotFoundError("Produto não encontrado");
    }

    await this.products.incrementViews(product.id);

    const avgRating = computeAvgRating(product.reviews);

    const [p] = await attachSales(
      this.products,
      [localizeProduct({ ...parseProductImages({ ...product, avgRating }) }, query.locale)]
    );

    return { product: p };
  }
}

export class CreateProductCommandHandler
  implements ICommandHandler<CreateProductCommand, any>
{
  constructor(
    private readonly products: ProductRepository,
    private readonly stores: StoreRepository
  ) {}

  async handle(command: CreateProductCommand) {
    const { userId, role, data } = command;

    if (role !== "SELLER" && role !== "ADMIN") {
      throw new ForbiddenError("Apenas vendedores podem criar produtos");
    }

    const store = await this.stores.findByUserId(userId);

    if (!store) {
      throw new BadRequestError("Você não tem uma loja");
    }

    const storeCategoryIds = await this.products.categoryIdsByStore(store.id);
    if (
      !storeCategoryIds.includes(data.categoryId) &&
      storeCategoryIds.length >= 3
    ) {
      throw new BadRequestError(
        "Limite atingido: uma loja só pode vender em até 3 categorias"
      );
    }

    let slug = slugify(data.name);
    const existingSlug = await this.products.findBySlug(slug);
    if (existingSlug) {
      slug = `${slug}-${Date.now()}`;
    }

    const product = await this.products.create({
      name: data.name,
      slug,
      description: data.description,
      price: data.price,
      comparePrice: data.comparePrice,
      images: JSON.stringify(data.images),
      condition: data.condition,
      stock: data.stock,
      isActive: data.isActive ?? true,
      storeId: store.id,
      categoryId: data.categoryId,
    });

    for (const t of data.translations || []) {
      const locale = normalizeLocale(t.locale);
      if (locale === "pt") continue;
      await this.products.upsertTranslation(product.id, locale, {
        name: t.name,
        description: t.description,
      });
    }

    return { product: parseProductImages(product) };
  }
}

export class UpdateProductCommandHandler
  implements ICommandHandler<UpdateProductCommand, any>
{
  constructor(private readonly products: ProductRepository) {}

  async handle(command: UpdateProductCommand) {
    const { userId, id, body } = command;

    const existingProduct = await this.products.findByIdWithStore(id);

    if (!existingProduct) {
      throw new NotFoundError("Produto não encontrado");
    }

    if (existingProduct.store.userId !== userId) {
      throw new ForbiddenError("Não autorizado");
    }

    if (body.categoryId && body.categoryId !== existingProduct.categoryId) {
      const storeCategoryIds = await this.products.categoryIdsByStore(
        existingProduct.store.id
      );
      if (
        !storeCategoryIds.includes(body.categoryId) &&
        storeCategoryIds.length >= 3
      ) {
        throw new BadRequestError(
          "Limite atingido: uma loja só pode vender em até 3 categorias"
        );
      }
    }

    const updateData: any = {};
    if (body.name) {
      updateData.name = body.name;
      let slug = slugify(body.name);
      const existingSlug = await this.products.findBySlugExcluding(slug, id);
      if (existingSlug) slug = `${slug}-${Date.now()}`;
      updateData.slug = slug;
    }
    if (body.description !== undefined) updateData.description = body.description;
    if (body.price !== undefined) updateData.price = body.price;
    if (body.comparePrice !== undefined) updateData.comparePrice = body.comparePrice;
    if (body.images) updateData.images = JSON.stringify(body.images);
    if (body.condition) updateData.condition = body.condition;
    if (body.stock !== undefined) updateData.stock = body.stock;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.categoryId) updateData.categoryId = body.categoryId;

    const product = await this.products.update(id, updateData);

    if (Array.isArray(body.translations)) {
      for (const t of body.translations) {
        const locale = normalizeLocale(t.locale);
        if (locale === "pt") continue;
        await this.products.upsertTranslation(id, locale, {
          name: t.name,
          description: t.description,
        });
      }
    }

    const translated = await this.products.findTranslations(id);

    return {
      product: parseProductImages({
        ...product,
        translations: translated,
      }),
    };
  }
}

export class DeleteProductCommandHandler
  implements ICommandHandler<DeleteProductCommand, any>
{
  constructor(private readonly products: ProductRepository) {}

  async handle(command: DeleteProductCommand) {
    const { userId, id } = command;

    const existingProduct = await this.products.findByIdWithStore(id);

    if (!existingProduct) {
      throw new NotFoundError("Produto não encontrado");
    }

    if (existingProduct.store.userId !== userId) {
      throw new ForbiddenError("Não autorizado");
    }

    await this.products.delete(id);

    return { message: "Produto eliminado" };
  }
}