import {
  ICommand,
  ICommandHandler,
  IQuery,
  IQueryHandler,
} from "../shared/cqrs";
import { UserRepository } from "../shared/repositories/auth.repository";
import { OrderRepository } from "../shared/repositories/order.repository";
import { StoreRepository } from "../shared/repositories/store.repository";
import { ProductRepository } from "../shared/repositories/product.repository";
import { CategoryRepository } from "../shared/repositories/category.repository";
import { ReviewRepository } from "../shared/repositories/review.repository";
import { BadRequestError, NotFoundError } from "../shared/errors";
import { parseImages, parseProductImages, normalizeLocale } from "../shared/mappers";
import { paymentHistoryPush } from "../shared/mappers";

export class RevenueChartQuery implements IQuery {
  constructor(public readonly days: number) {}
}

export class UsersChartQuery implements IQuery {
  constructor(public readonly days: number) {}
}

export class OrdersStatsQuery implements IQuery {}

export class UsersStatsQuery implements IQuery {}

export class StoresStatsQuery implements IQuery {}

export class ProductsStatsQuery implements IQuery {}

export class CategoriesStatsQuery implements IQuery {}

export class ReviewsStatsQuery implements IQuery {}

export class DashboardStatsQuery implements IQuery {}

export class AdminUsersQuery implements IQuery {
  constructor(
    public readonly page: number,
    public readonly limit: number,
    public readonly role?: string,
    public readonly q?: string
  ) {}
}

export class UpdateUserRoleCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly role: string
  ) {}
}

export class DeleteUserCommand implements ICommand {
  constructor(public readonly userId: string) {}
}

export class AdminOrdersQuery implements IQuery {
  constructor(
    public readonly page: number,
    public readonly limit: number,
    public readonly status?: string,
    public readonly q?: string
  ) {}
}

export class AdminUpdateOrderStatusCommand implements ICommand {
  constructor(
    public readonly orderId: string,
    public readonly status: string
  ) {}
}

export class AdminUpdateOrderPaymentCommand implements ICommand {
  constructor(
    public readonly orderId: string,
    public readonly paymentStatus: string,
    public readonly note?: string
  ) {}
}

export class AdminStoresQuery implements IQuery {
  constructor(
    public readonly page: number,
    public readonly limit: number,
    public readonly q?: string,
    public readonly verified?: string
  ) {}
}

export class VerifyStoreCommand implements ICommand {
  constructor(public readonly storeId: string) {}
}

export class DeleteStoreCommand implements ICommand {
  constructor(public readonly storeId: string) {}
}

export class AdminProductsQuery implements IQuery {
  constructor(
    public readonly page: number,
    public readonly limit: number,
    public readonly q?: string,
    public readonly active?: string,
    public readonly categoryId?: string
  ) {}
}

export class ToggleProductActiveCommand implements ICommand {
  constructor(public readonly productId: string) {}
}

export class AdminDeleteProductCommand implements ICommand {
  constructor(public readonly productId: string) {}
}

export class AdminCategoriesQuery implements IQuery {}

export class CreateCategoryCommand implements ICommand {
  constructor(
    public readonly data: {
      name: string;
      slug?: string;
      icon?: string;
      image?: string;
      parentId?: string;
      translations?: { locale: string; name?: string }[];
    }
  ) {}
}

export class UpdateCategoryCommand implements ICommand {
  constructor(
    public readonly categoryId: string,
    public readonly data: {
      name?: string;
      slug?: string;
      icon?: string;
      image?: string;
      translations?: { locale: string; name?: string }[];
    }
  ) {}
}

export class DeleteCategoryCommand implements ICommand {
  constructor(public readonly categoryId: string) {}
}

export class AdminReviewsQuery implements IQuery {
  constructor(
    public readonly page: number,
    public readonly limit: number
  ) {}
}

export class DeleteReviewCommand implements ICommand {
  constructor(public readonly reviewId: string) {}
}

function dayRange(daysAgoIndex: number) {
  const now = new Date();
  const dayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - daysAgoIndex
  );
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);
  return { dayStart, dayEnd };
}

function categorySlugFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export class RevenueChartQueryHandler
  implements IQueryHandler<RevenueChartQuery, any>
{
  constructor(private readonly orders: OrderRepository) {}

  async handle(query: RevenueChartQuery) {
    const results: any[] = [];
    for (let i = query.days - 1; i >= 0; i--) {
      const { dayStart, dayEnd } = dayRange(i);
      const [rev, orderCount] = await Promise.all([
        this.orders.revenueBetween(dayStart, new Date(dayEnd.getTime() + 1)),
        this.orders.countBetween(dayStart, new Date(dayEnd.getTime() + 1)),
      ]);
      results.push({
        date: dayStart.toISOString().split("T")[0],
        label: `${dayStart.getDate()}/${dayStart.getMonth() + 1}`,
        revenue: rev._sum.total || 0,
        orders: orderCount,
      });
    }
    return { data: results };
  }
}

export class UsersChartQueryHandler
  implements IQueryHandler<UsersChartQuery, any>
{
  constructor(private readonly users: UserRepository) {}

  async handle(query: UsersChartQuery) {
    const results: any[] = [];
    for (let i = query.days - 1; i >= 0; i--) {
      const { dayStart, dayEnd } = dayRange(i);
      const count = await this.users.countBetween(
        dayStart,
        new Date(dayEnd.getTime() + 1)
      );
      results.push({
        date: dayStart.toISOString().split("T")[0],
        label: `${dayStart.getDate()}/${dayStart.getMonth() + 1}`,
        users: count,
      });
    }
    return { data: results };
  }
}

export class OrdersStatsQueryHandler
  implements IQueryHandler<OrdersStatsQuery, any>
{
  constructor(private readonly orders: OrderRepository) {}

  async handle() {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      total,
      thisMonthCount,
      lastMonthCount,
      thisMonthRevenue,
      lastMonthRevenue,
      pending,
      byStatus,
    ] = await Promise.all([
      this.orders.countAll(),
      this.orders.countSince(thisMonth),
      this.orders.countBetween(lastMonth, thisMonth),
      this.orders.revenueSince(thisMonth),
      this.orders.revenueBetween(lastMonth, thisMonth),
      this.orders.countPending(),
      this.orders.groupByStatus(),
    ]);

    const avgOrder =
      total > 0 ? (thisMonthRevenue._sum.total || 0) / (thisMonthCount || 1) : 0;

    return {
      total,
      thisMonth: thisMonthCount,
      lastMonth: lastMonthCount,
      thisMonthRevenue: thisMonthRevenue._sum.total || 0,
      lastMonthRevenue: lastMonthRevenue._sum.total || 0,
      pending,
      avgOrderValue: Math.round(avgOrder),
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
    };
  }
}

export class UsersStatsQueryHandler
  implements IQueryHandler<UsersStatsQuery, any>
{
  constructor(private readonly users: UserRepository) {}

  async handle() {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      total,
      buyers,
      sellers,
      admins,
      newThisWeek,
      newThisMonth,
      byRole,
    ] = await Promise.all([
      this.users.countAll(),
      this.users.countByRole("BUYER"),
      this.users.countByRole("SELLER"),
      this.users.countByRole("ADMIN"),
      this.users.countCreatedSince(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ),
      this.users.countCreatedSince(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      ),
      this.users.groupByRole(),
    ]);

    return {
      total,
      buyers,
      sellers,
      admins,
      newThisWeek,
      newThisMonth,
      byRole: byRole.map((r) => ({ role: r.role, count: r._count })),
    };
  }
}

export class StoresStatsQueryHandler
  implements IQueryHandler<StoresStatsQuery, any>
{
  constructor(
    private readonly stores: StoreRepository,
    private readonly reviews: ReviewRepository
  ) {}

  async handle() {
    const [total, verified, unverified, avgRating, byProvince] =
      await Promise.all([
        this.stores.countAll(),
        this.stores.countVerified(),
        this.stores.countUnverified(),
        this.reviews.avgRatingAll(),
        this.stores.groupByProvince(8),
      ]);

    return {
      total,
      verified,
      unverified,
      avgRating: avgRating._avg.rating || 0,
      byProvince: byProvince.map((p) => ({
        province: p.province,
        count: p._count,
      })),
    };
  }
}

export class ProductsStatsQueryHandler
  implements IQueryHandler<ProductsStatsQuery, any>
{
  constructor(
    private readonly products: ProductRepository,
    private readonly reviews: ReviewRepository,
    private readonly categories: CategoryRepository
  ) {}

  async handle() {
    const [
      total,
      active,
      inactive,
      avgPrice,
      avgRating,
      byCategory,
      newThisWeek,
    ] = await Promise.all([
      this.products.countAll(),
      this.products.countActive(),
      this.products.countInactive(),
      this.products.avgPrice(),
      this.reviews.avgRatingAll(),
      this.categories.findTopByProducts(6),
      this.products.countCreatedSince(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ),
    ]);

    return {
      total,
      active,
      inactive,
      avgPrice: Math.round(avgPrice._avg.price || 0),
      avgRating: avgRating._avg.rating || 0,
      newThisWeek,
      byCategory: byCategory.map((c) => ({
        name: c.name,
        count: c._count.products,
      })),
    };
  }
}

export class CategoriesStatsQueryHandler
  implements IQueryHandler<CategoriesStatsQuery, any>
{
  constructor(
    private readonly categories: CategoryRepository,
    private readonly products: ProductRepository
  ) {}

  async handle() {
    const [total, withProducts, empty, totalSubcategories] = await Promise.all([
      this.categories.countAll(),
      this.categories.countWithProducts(),
      this.categories.countEmpty(),
      this.categories.countSubcategories(),
    ]);

    const totalProducts = await this.products.countAll();

    return { total, withProducts, empty, totalSubcategories, totalProducts };
  }
}

export class ReviewsStatsQueryHandler
  implements IQueryHandler<ReviewsStatsQuery, any>
{
  constructor(private readonly reviews: ReviewRepository) {}

  async handle() {
    const [total, avgRating, fiveStar, thisMonth, ratingDist] =
      await Promise.all([
        this.reviews.countAll(),
        this.reviews.avgRatingAll(),
        this.reviews.countFiveStar(),
        this.reviews.countCreatedSince(
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        ),
        this.reviews.groupByRating(),
      ]);

    const fiveStarPct = total > 0 ? Math.round((fiveStar / total) * 100) : 0;

    return {
      total,
      avgRating: avgRating._avg.rating || 0,
      fiveStar,
      fiveStarPct,
      thisMonth,
      ratingDist: ratingDist.map((r) => ({
        rating: r.rating,
        count: r._count,
      })),
    };
  }
}

export class DashboardStatsQueryHandler
  implements IQueryHandler<DashboardStatsQuery, any>
{
  constructor(
    private readonly users: UserRepository,
    private readonly products: ProductRepository,
    private readonly orders: OrderRepository,
    private readonly stores: StoreRepository,
    private readonly reviews: ReviewRepository
  ) {}

  async handle() {
    const thisWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalBuyers,
      totalSellers,
      totalProducts,
      activeProducts,
      totalOrders,
      totalStores,
      verifiedStores,
      totalReviews,
      revenue,
      recentOrders,
      usersThisWeek,
      ordersThisWeek,
    ] = await Promise.all([
      this.users.countAll(),
      this.users.countByRole("BUYER"),
      this.users.countByRole("SELLER"),
      this.products.countAll(),
      this.products.countActive(),
      this.orders.countAll(),
      this.stores.countAll(),
      this.stores.countVerified(),
      this.reviews.countAll(),
      this.orders.revenueAll(),
      this.orders.recentOrders(5),
      this.users.countCreatedSince(thisWeek),
      this.orders.countSince(thisWeek),
    ]);

    return {
      totalUsers,
      totalBuyers,
      totalSellers,
      totalProducts,
      activeProducts,
      inactiveProducts: totalProducts - activeProducts,
      totalOrders,
      totalStores,
      verifiedStores,
      unverifiedStores: totalStores - verifiedStores,
      totalReviews,
      totalRevenue: revenue._sum.total || 0,
      usersThisWeek,
      ordersThisWeek,
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        total: o.total,
        status: o.status,
        createdAt: o.createdAt,
        userName: o.user?.name || "N/A",
        itemsCount: o.items.length,
      })),
    };
  }
}

export class AdminUsersQueryHandler
  implements IQueryHandler<AdminUsersQuery, any>
{
  constructor(private readonly users: UserRepository) {}

  async handle(query: AdminUsersQuery) {
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.users.adminFindMany(skip, query.limit, query.role, query.q),
      this.users.adminCount(query.role, query.q),
    ]);

    return {
      users: items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}

export class UpdateUserRoleCommandHandler
  implements ICommandHandler<UpdateUserRoleCommand, any>
{
  constructor(private readonly users: UserRepository) {}

  async handle(command: UpdateUserRoleCommand) {
    const { userId, role } = command;

    if (!["BUYER", "SELLER", "ADMIN"].includes(role)) {
      throw new BadRequestError("Role invalido");
    }

    const user = await this.users.adminUpdateRole(userId, role);

    return { user };
  }
}

export class DeleteUserCommandHandler
  implements ICommandHandler<DeleteUserCommand, any>
{
  constructor(private readonly users: UserRepository) {}

  async handle(command: DeleteUserCommand) {
    await this.users.adminDelete(command.userId);
    return { success: true };
  }
}

export class AdminOrdersQueryHandler
  implements IQueryHandler<AdminOrdersQuery, any>
{
  constructor(private readonly orders: OrderRepository) {}

  async handle(query: AdminOrdersQuery) {
    const skip = (query.page - 1) * query.limit;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.q) {
      where.OR = [
        { orderNumber: { contains: query.q } },
        { shippingName: { contains: query.q } },
      ];
    }

    const [items, total] = await Promise.all([
      this.orders.adminFindMany(where, skip, query.limit),
      this.orders.adminCount(where),
    ]);

    return {
      orders: items.map((o) => ({
        ...o,
        items: o.items.map((i) => ({
          ...i,
          product: i.product
            ? { ...i.product, images: parseImages(i.product.images) }
            : i.product,
        })),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}

export class AdminUpdateOrderStatusCommandHandler
  implements ICommandHandler<AdminUpdateOrderStatusCommand, any>
{
  constructor(private readonly orders: OrderRepository) {}

  async handle(command: AdminUpdateOrderStatusCommand) {
    const { orderId, status } = command;

    if (
      !["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"].includes(status)
    ) {
      throw new BadRequestError("Status invalido");
    }

    const order = await this.orders.updateAndSelect(
      orderId,
      { status },
      { id: true, status: true, orderNumber: true }
    );

    return { order };
  }
}

export class AdminUpdateOrderPaymentCommandHandler
  implements ICommandHandler<AdminUpdateOrderPaymentCommand, any>
{
  constructor(private readonly orders: OrderRepository) {}

  async handle(command: AdminUpdateOrderPaymentCommand) {
    const { orderId, paymentStatus, note } = command;

    if (!["PAID", "PENDING", "REJECTED"].includes(paymentStatus)) {
      throw new BadRequestError("Estado de pagamento invalido");
    }

    const order = await this.orders.findById(orderId);
    if (!order) {
      throw new NotFoundError("Pedido nao encontrado");
    }

    const history = Array.isArray(order.paymentHistory)
      ? order.paymentHistory
      : [];

    const entry = {
      at: new Date().toISOString(),
      actor: "admin",
      from: order.paymentStatus,
      to: paymentStatus,
      note: note || undefined,
    };

    const data: any = {
      paymentStatus,
      paymentHistory: [...history, entry],
    };
    if (paymentStatus === "PAID") {
      data.status = "CONFIRMED";
      data.validationStatus = "PASS";
    }

    const updated = await this.orders.updateAndSelect(
      orderId,
      data,
      { id: true, status: true, paymentStatus: true, validationStatus: true }
    );

    return { order: updated };
  }
}

export class AdminStoresQueryHandler
  implements IQueryHandler<AdminStoresQuery, any>
{
  constructor(private readonly stores: StoreRepository) {}

  async handle(query: AdminStoresQuery) {
    const skip = (query.page - 1) * query.limit;

    const where: any = {};
    if (query.q) {
      where.OR = [
        { name: { contains: query.q } },
        { description: { contains: query.q } },
      ];
    }
    if (query.verified === "true") where.isVerified = true;
    if (query.verified === "false") where.isVerified = false;

    const [items, total] = await Promise.all([
      this.stores.adminFindMany(where, skip, query.limit),
      this.stores.adminCount(where),
    ]);

    return {
      stores: items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}

export class VerifyStoreCommandHandler
  implements ICommandHandler<VerifyStoreCommand, any>
{
  constructor(private readonly stores: StoreRepository) {}

  async handle(command: VerifyStoreCommand) {
    const store = await this.stores.findByIdIsVerified(command.storeId);
    if (!store) {
      throw new NotFoundError("Loja nao encontrada");
    }

    const updated = await this.stores.toggleVerified(
      command.storeId,
      !store.isVerified
    );

    return { store: updated };
  }
}

export class DeleteStoreCommandHandler
  implements ICommandHandler<DeleteStoreCommand, any>
{
  constructor(private readonly stores: StoreRepository) {}

  async handle(command: DeleteStoreCommand) {
    await this.stores.delete(command.storeId);
    return { success: true };
  }
}

export class AdminProductsQueryHandler
  implements IQueryHandler<AdminProductsQuery, any>
{
  constructor(private readonly products: ProductRepository) {}

  async handle(query: AdminProductsQuery) {
    const skip = (query.page - 1) * query.limit;

    const where: any = {};
    if (query.q) {
      where.OR = [
        { name: { contains: query.q } },
        { description: { contains: query.q } },
      ];
    }
    if (query.active === "true") where.isActive = true;
    if (query.active === "false") where.isActive = false;
    if (query.categoryId) where.categoryId = query.categoryId;

    const [items, total] = await Promise.all([
      this.products.adminFindMany(where, skip, query.limit),
      this.products.adminCount(where),
    ]);

    const productsWithRating = items.map((p) => ({
      ...parseProductImages(p),
      avgRating:
        p.reviews.length > 0
          ? p.reviews.reduce(
              (s: number, r: { rating: number }) => s + r.rating,
              0
            ) / p.reviews.length
          : 0,
      reviewsCount: p.reviews.length,
      reviews: undefined,
    }));

    return {
      products: productsWithRating,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}

export class ToggleProductActiveCommandHandler
  implements ICommandHandler<ToggleProductActiveCommand, any>
{
  constructor(private readonly products: ProductRepository) {}

  async handle(command: ToggleProductActiveCommand) {
    const product = await this.products.findByIdIsActive(command.productId);
    if (!product) {
      throw new NotFoundError("Produto nao encontrado");
    }

    const updated = await this.products.toggleActive(
      command.productId,
      !product.isActive
    );

    return { product: parseProductImages(updated) };
  }
}

export class AdminDeleteProductCommandHandler
  implements ICommandHandler<AdminDeleteProductCommand, any>
{
  constructor(private readonly products: ProductRepository) {}

  async handle(command: AdminDeleteProductCommand) {
    await this.products.adminDelete(command.productId);
    return { success: true };
  }
}

export class CreateCategoryCommandHandler
  implements ICommandHandler<CreateCategoryCommand, any>
{
  constructor(private readonly categories: CategoryRepository) {}

  async handle(command: CreateCategoryCommand) {
    const { data } = command;

    const category = await this.categories.create({
      name: data.name,
      slug:
        data.slug || categorySlugFromName(data.name),
      icon: data.icon,
      image: data.image,
      parentId: data.parentId || null,
    });

    for (const t of data.translations || []) {
      const locale = normalizeLocale(t.locale);
      if (locale === "pt") continue;
      await this.categories.upsertTranslation(category.id, locale, t.name);
    }

    const translations = await this.categories.findTranslations(category.id);

    return { category: { ...category, translations } };
  }
}

export class UpdateCategoryCommandHandler
  implements ICommandHandler<UpdateCategoryCommand, any>
{
  constructor(private readonly categories: CategoryRepository) {}

  async handle(command: UpdateCategoryCommand) {
    const { categoryId, data } = command;

    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.slug) updateData.slug = data.slug;
    if (data.icon !== undefined) updateData.icon = data.icon;
    if (data.image !== undefined) updateData.image = data.image;

    const category = await this.categories.update(categoryId, updateData);

    for (const t of data.translations || []) {
      const locale = normalizeLocale(t.locale);
      if (locale === "pt") continue;
      await this.categories.upsertTranslation(categoryId, locale, t.name);
    }

    const translations = await this.categories.findTranslations(categoryId);

    return { category: { ...category, translations } };
  }
}

export class DeleteCategoryCommandHandler
  implements ICommandHandler<DeleteCategoryCommand, any>
{
  constructor(private readonly categories: CategoryRepository) {}

  async handle(command: DeleteCategoryCommand) {
    await this.categories.delete(command.categoryId);
    return { success: true };
  }
}

export class AdminCategoriesQueryHandler
  implements IQueryHandler<AdminCategoriesQuery, any>
{
  constructor(private readonly categories: CategoryRepository) {}

  async handle(_query: AdminCategoriesQuery) {
    return { categories: await this.categories.findTree() };
  }
}

export class AdminReviewsQueryHandler
  implements IQueryHandler<AdminReviewsQuery, any>
{
  constructor(private readonly reviews: ReviewRepository) {}

  async handle(query: AdminReviewsQuery) {
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.reviews.adminFindMany(skip, query.limit),
      this.reviews.countAll(),
    ]);

    return {
      reviews: items.map((r) => ({
        ...r,
        product: r.product
          ? { ...r.product, images: parseImages(r.product.images) }
          : r.product,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}

export class DeleteReviewCommandHandler
  implements ICommandHandler<DeleteReviewCommand, any>
{
  constructor(private readonly reviews: ReviewRepository) {}

  async handle(command: DeleteReviewCommand) {
    await this.reviews.delete(command.reviewId);
    return { success: true };
  }
}