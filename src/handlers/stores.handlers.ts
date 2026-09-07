import {
  ICommand,
  ICommandHandler,
  IQuery,
  IQueryHandler,
} from "../shared/cqrs";
import { StoreRepository } from "../shared/repositories/store.repository";
import { ProductRepository } from "../shared/repositories/product.repository";
import { UserRepository } from "../shared/repositories/auth.repository";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../shared/errors";
import {
  applyLocalized,
  computeAvgRating,
  normalizeLocale,
  parseImages,
  parsePaymentMethods,
  slugify,
  stripTranslations,
} from "../shared/mappers";
import { StoreInput } from "../lib/validators";

export class MapStoresQuery implements IQuery {
  constructor(public readonly locale?: string) {}
}

export class CreateStoreCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly role: string,
    public readonly data: StoreInput
  ) {}
}

export class ListStoresQuery implements IQuery {
  constructor(
    public readonly page: number,
    public readonly limit: number,
    public readonly sort?: string,
    public readonly locale?: string
  ) {}
}

export class GetStoreQuery implements IQuery {
  constructor(
    public readonly idOrSlug: string,
    public readonly locale?: string
  ) {}
}

export class UpdateStoreCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly body: any
  ) {}
}

export class GetPaymentMethodsQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

export class UpdatePaymentMethodsCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly paymentMethods: any
  ) {}
}

export class StoreProductsQuery implements IQuery {
  constructor(
    public readonly idOrSlug: string,
    public readonly page: number,
    public readonly limit: number,
    public readonly locale?: string
  ) {}
}

function localizeStore(store: any, locale?: string): any {
  const s = applyLocalized(store, locale, ["province", "district"]);
  return stripTranslations(s);
}

export class MapStoresQueryHandler implements IQueryHandler<MapStoresQuery, any> {
  constructor(private readonly stores: StoreRepository) {}

  async handle(query: MapStoresQuery) {
    const stores = await this.stores.findMapStores();
    return {
      stores: stores.map((s: any) => localizeStore(s, query.locale)),
    };
  }
}

export class CreateStoreCommandHandler
  implements ICommandHandler<CreateStoreCommand, any>
{
  constructor(
    private readonly stores: StoreRepository,
    private readonly users: UserRepository
  ) {}

  async handle(command: CreateStoreCommand) {
    const { userId, role, data } = command;

    if (role !== "SELLER" && role !== "ADMIN") {
      throw new ForbiddenError("Apenas vendedores podem criar lojas");
    }

    const existingStore = await this.stores.findByUserId(userId);

    if (existingStore) {
      throw new ConflictError("Você já tem uma loja");
    }

    let slug = slugify(data.name);
    const existingSlug = await this.stores.findBySlug(slug);
    if (existingSlug) {
      slug = `${slug}-${Date.now()}`;
    }

    const store = await this.stores.create({
      name: data.name,
      slug,
      description: data.description,
      phone: data.phone,
      province: data.province,
      district: data.district,
      userId,
      paymentMethods: JSON.stringify([
        { type: "EXPRESS", enabled: false, phone: "" },
        { type: "TRANSFER", enabled: false, phone: "", ownerName: "", bankName: "", iban: "", bankAccount: "" },
        { type: "REFERENCE", enabled: false, entity: "", reference: "" },
        { type: "CASH_ON_DELIVERY", enabled: true },
      ]),
    });

    await this.users.updateRole(userId, "SELLER");

    return { store };
  }
}

export class ListStoresQueryHandler implements IQueryHandler<ListStoresQuery, any> {
  constructor(private readonly stores: StoreRepository) {}

  async handle(query: ListStoresQuery) {
    const skip = (query.page - 1) * query.limit;
    const orderBy =
      query.sort === "popular"
        ? { views: "desc" as const }
        : { createdAt: "desc" as const };

    const [items, total] = await Promise.all([
      this.stores.findManyPaginated(skip, query.limit, orderBy),
      this.stores.countAll(),
    ]);

    return {
      stores: items.map((s: any) => localizeStore(s, query.locale)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}

export class GetStoreQueryHandler implements IQueryHandler<GetStoreQuery, any> {
  constructor(private readonly stores: StoreRepository) {}

  async handle(query: GetStoreQuery) {
    const store = await this.stores.findBySlugOrIdWithCounts(query.idOrSlug);

    if (!store) {
      throw new NotFoundError("Loja não encontrada");
    }

    await this.stores.incrementViews(store.id);

    const localized = localizeStore(store, query.locale);

    return {
      store: {
        ...localized,
        views: store.views + 1,
        paymentMethods: parsePaymentMethods(store.paymentMethods),
      },
    };
  }
}

export class UpdateStoreCommandHandler
  implements ICommandHandler<UpdateStoreCommand, any>
{
  constructor(private readonly stores: StoreRepository) {}

  async handle(command: UpdateStoreCommand) {
    const { userId, body } = command;

    const existingStore = await this.stores.findByUserId(userId);

    if (!existingStore) {
      throw new NotFoundError("Loja não encontrada");
    }

    const updateData: any = {};
    if (body.name) {
      updateData.name = body.name;
      let slug = slugify(body.name);
      const existingSlug = await this.stores.findBySlugExcluding(
        slug,
        existingStore.id
      );
      if (existingSlug) slug = `${slug}-${Date.now()}`;
      updateData.slug = slug;
    }
    if (body.description !== undefined) updateData.description = body.description;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.logo !== undefined) updateData.logo = body.logo;
    if (body.banner !== undefined) updateData.banner = body.banner;
    if (body.province) updateData.province = body.province;
    if (body.district !== undefined) updateData.district = body.district;
    if (body.latitude !== undefined) updateData.latitude = body.latitude;
    if (body.longitude !== undefined) updateData.longitude = body.longitude;

    const store = await this.stores.update(existingStore.id, updateData);

    if (Array.isArray(body.translations)) {
      for (const t of body.translations) {
        const locale = normalizeLocale(t.locale);
        if (locale === "pt") continue;
        await this.stores.upsertTranslation(existingStore.id, locale, {
          province: t.province,
          district: t.district,
        });
      }
    }

    const translations = await this.stores.findTranslations(existingStore.id);

    return { store: { ...store, translations } };
  }
}

export class GetPaymentMethodsQueryHandler
  implements IQueryHandler<GetPaymentMethodsQuery, any>
{
  constructor(private readonly stores: StoreRepository) {}

  async handle(query: GetPaymentMethodsQuery) {
    const store = await this.stores.findByUserId(query.userId);

    if (!store) {
      throw new NotFoundError("Loja não encontrada");
    }

    return { paymentMethods: parsePaymentMethods(store.paymentMethods) };
  }
}

export class UpdatePaymentMethodsCommandHandler
  implements ICommandHandler<UpdatePaymentMethodsCommand, any>
{
  constructor(private readonly stores: StoreRepository) {}

  async handle(command: UpdatePaymentMethodsCommand) {
    const { userId, paymentMethods } = command;

    const store = await this.stores.findByUserId(userId);

    if (!store) {
      throw new NotFoundError("Loja não encontrada");
    }

    if (!Array.isArray(paymentMethods)) {
      throw new BadRequestError("paymentMethods deve ser um array");
    }

    const updated = await this.stores.update(store.id, {
      paymentMethods: JSON.stringify(paymentMethods),
    });

    return { paymentMethods: parsePaymentMethods(updated.paymentMethods) };
  }
}

export class StoreProductsQueryHandler
  implements IQueryHandler<StoreProductsQuery, any>
{
  constructor(
    private readonly stores: StoreRepository,
    private readonly products: ProductRepository
  ) {}

  async handle(query: StoreProductsQuery) {
    const store = await this.stores.findBySlugOrIdWithCounts(query.idOrSlug);

    if (!store) {
      throw new NotFoundError("Loja não encontrada");
    }

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.products.findByStore(store.id, skip, query.limit),
      this.products.countByStore(store.id),
    ]);

    const productsWithRating = items.map((p) =>
      applyLocalized(
        {
          ...p,
          images: parseImages(p.images),
          avgRating: computeAvgRating(p.reviews),
          reviews: undefined,
        },
        query.locale,
        ["name", "description"]
      )
    );

    const ids = productsWithRating.map((p) => p.id);
    const sales =
      ids.length > 0
        ? await this.products.orderItemSales(ids)
        : [];
    const salesMap = new Map(
      sales.map((s) => [s.productId, s._sum.quantity || 0])
    );

    return {
      products: productsWithRating.map((p) =>
        stripTranslations({
          ...p,
          category: p.category
            ? stripTranslations(applyLocalized(p.category, query.locale, ["name"]))
            : p.category,
          salesCount: salesMap.get(p.id) || 0,
        })
      ),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}