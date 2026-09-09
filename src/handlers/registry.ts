import { mediator } from "../shared/mediator";
import { UnitOfWork } from "../shared/unit-of-work";
import { UserRepository } from "../shared/repositories/auth.repository";
import { CategoryRepository } from "../shared/repositories/category.repository";
import { ProductRepository } from "../shared/repositories/product.repository";
import { StoreRepository } from "../shared/repositories/store.repository";
import { CartRepository } from "../shared/repositories/cart.repository";
import {
  OrderRepository,
  OrderItemRepository,
  ReceiptQueueRepository,
} from "../shared/repositories/order.repository";
import { ReviewRepository } from "../shared/repositories/review.repository";
import { RoleRepository } from "../shared/repositories/role.repository";
import {
  RegisterUserCommand,
  RegisterUserCommandHandler,
  LoginUserCommand,
  LoginUserCommandHandler,
  SocialLoginCommand,
  SocialLoginCommandHandler,
  UpdateProfileCommand,
  UpdateProfileCommandHandler,
  GetMeQuery,
  GetMeQueryHandler,
} from "./auth.handlers";
import {
  ListCategoriesQuery,
  ListCategoriesQueryHandler,
  GetCategoryQuery,
  GetCategoryQueryHandler,
} from "./categories.handlers";
import {
  ProductReviewsQuery,
  ProductReviewsQueryHandler,
  StoreReviewsQuery,
  StoreReviewsQueryHandler,
  CreateReviewCommand,
  CreateReviewCommandHandler,
} from "./reviews.handlers";
import {
  FeaturedProductsQuery,
  FeaturedProductsQueryHandler,
  ProductsByCategoryQuery,
  ProductsByCategoryQueryHandler,
  ListProductsQuery,
  ListProductsQueryHandler,
  GetProductQuery,
  GetProductQueryHandler,
  CreateProductCommand,
  CreateProductCommandHandler,
  UpdateProductCommand,
  UpdateProductCommandHandler,
  DeleteProductCommand,
  DeleteProductCommandHandler,
} from "./products.handlers";
import {
  MapStoresQuery,
  MapStoresQueryHandler,
  CreateStoreCommand,
  CreateStoreCommandHandler,
  ListStoresQuery,
  ListStoresQueryHandler,
  GetStoreQuery,
  GetStoreQueryHandler,
  UpdateStoreCommand,
  UpdateStoreCommandHandler,
  GetPaymentMethodsQuery,
  GetPaymentMethodsQueryHandler,
  UpdatePaymentMethodsCommand,
  UpdatePaymentMethodsCommandHandler,
  StoreProductsQuery,
  StoreProductsQueryHandler,
} from "./stores.handlers";
import {
  GetCartQuery,
  GetCartQueryHandler,
  AddCartItemCommand,
  AddCartItemCommandHandler,
  UpdateCartItemCommand,
  UpdateCartItemCommandHandler,
  RemoveCartItemCommand,
  RemoveCartItemCommandHandler,
  ClearCartCommand,
  ClearCartCommandHandler,
} from "./cart.handlers";
import {
  SellerOrdersQuery,
  SellerOrdersQueryHandler,
  GetSellerOrderQuery,
  GetSellerOrderQueryHandler,
  CreateOrderCommand,
  CreateOrderCommandHandler,
  ListUserOrdersQuery,
  ListUserOrdersQueryHandler,
  GetOrderQuery,
  GetOrderQueryHandler,
  UpdateOrderStatusCommand,
  UpdateOrderStatusCommandHandler,
  UploadReceiptCommand,
  UploadReceiptCommandHandler,
  UpdateOrderPaymentStatusCommand,
  UpdateOrderPaymentStatusCommandHandler,
  ShipOrderCommand,
  ShipOrderCommandHandler,
  MarkOrderDeliveredCommand,
  MarkOrderDeliveredCommandHandler,
  ConfirmOrderReceiptCommand,
  ConfirmOrderReceiptCommandHandler,
  GetOrderTimelineQuery,
  GetOrderTimelineQueryHandler,
} from "./orders.handlers";
import {
  RevenueChartQuery,
  RevenueChartQueryHandler,
  UsersChartQuery,
  UsersChartQueryHandler,
  OrdersStatsQuery,
  OrdersStatsQueryHandler,
  UsersStatsQuery,
  UsersStatsQueryHandler,
  StoresStatsQuery,
  StoresStatsQueryHandler,
  ProductsStatsQuery,
  ProductsStatsQueryHandler,
  CategoriesStatsQuery,
  CategoriesStatsQueryHandler,
  ReviewsStatsQuery,
  ReviewsStatsQueryHandler,
  StoreRevenueQuery,
  StoreRevenueQueryHandler,
  DashboardStatsQuery,
  DashboardStatsQueryHandler,
  AdminUsersQuery,
  AdminUsersQueryHandler,
  UpdateUserRoleCommand,
  UpdateUserRoleCommandHandler,
  DeleteUserCommand,
  DeleteUserCommandHandler,
  AdminOrdersQuery,
  AdminOrdersQueryHandler,
  AdminUpdateOrderStatusCommand,
  AdminUpdateOrderStatusCommandHandler,
  AdminUpdateOrderPaymentCommand,
  AdminUpdateOrderPaymentCommandHandler,
  AdminStoresQuery,
  AdminStoresQueryHandler,
  VerifyStoreCommand,
  VerifyStoreCommandHandler,
  DeleteStoreCommand,
  DeleteStoreCommandHandler,
  AdminProductsQuery,
  AdminProductsQueryHandler,
  ToggleProductActiveCommand,
  ToggleProductActiveCommandHandler,
  AdminDeleteProductCommand,
  AdminDeleteProductCommandHandler,
  CreateCategoryCommand,
  CreateCategoryCommandHandler,
  AdminCategoriesQuery,
  AdminCategoriesQueryHandler,
  UpdateCategoryCommand,
  UpdateCategoryCommandHandler,
  DeleteCategoryCommand,
  DeleteCategoryCommandHandler,
  AdminReviewsQuery,
  AdminReviewsQueryHandler,
  DeleteReviewCommand,
  DeleteReviewCommandHandler,
} from "./admin.handlers";
import {
  UploadFileCommand,
  UploadFileCommandHandler,
} from "./uploads.handlers";
import {
  ListRolesQuery,
  ListRolesQueryHandler,
  ListResponsibilitiesQuery,
  ListResponsibilitiesQueryHandler,
  CreateRoleCommand,
  CreateRoleCommandHandler,
  UpdateRoleCommand,
  UpdateRoleCommandHandler,
  DeleteRoleCommand,
  DeleteRoleCommandHandler,
  SetRoleResponsibilitiesCommand,
  SetRoleResponsibilitiesCommandHandler,
  CreateResponsibilityCommand,
  CreateResponsibilityCommandHandler,
  UpdateResponsibilityCommand,
  UpdateResponsibilityCommandHandler,
  DeleteResponsibilityCommand,
  DeleteResponsibilityCommandHandler,
} from "./roles.handlers";
import { OrderDisputeRepository } from "../shared/repositories/dispute.repository";
import {
  GetOrderDisputeQuery,
  GetOrderDisputeQueryHandler,
  SendDisputeMessageCommand,
  SendDisputeMessageCommandHandler,
  UpdateDisputeStatusCommand,
  UpdateDisputeStatusCommandHandler,
  ListDisputesQuery,
  ListDisputesQueryHandler,
  AdminListDisputesQuery,
  AdminListDisputesQueryHandler,
  AdminDisputesStatsQuery,
  AdminDisputesStatsQueryHandler,
  UserDisputeUnreadQuery,
  UserDisputeUnreadQueryHandler,
  MarkDisputeReadCommand,
  MarkDisputeReadCommandHandler,
  ModerateDisputeCommand,
  ModerateDisputeCommandHandler,
} from "./disputes.handlers";
import {
  InvoiceRepository,
  InvoiceSeriesRepository,
  StoreFiscalProfileRepository,
  FiscalSettingsRepository,
} from "../shared/repositories/invoice.repository";
import { InvoiceEmitter } from "../lib/fiscal/emitter";
import { AgtClient } from "../lib/fiscal/agt.client";
import {
  GetFiscalSettingsQuery,
  GetFiscalSettingsQueryHandler,
  UpsertFiscalSettingsCommand,
  UpsertFiscalSettingsCommandHandler,
  GetStoreFiscalProfileQuery,
  GetStoreFiscalProfileQueryHandler,
  UpsertStoreFiscalProfileCommand,
  UpsertStoreFiscalProfileCommandHandler,
  ListStoreSeriesQuery,
  ListStoreSeriesQueryHandler,
  OpenInvoiceSeriesCommand,
  OpenInvoiceSeriesCommandHandler,
  GetOrderInvoiceQuery,
  GetOrderInvoiceQueryHandler,
  GetInvoiceQuery,
  GetInvoiceQueryHandler,
  EmitOrderInvoiceCommand,
  EmitOrderInvoiceCommandHandler,
} from "./fiscal.handlers";

export function registerHandlers(): void {
  const uow = new UnitOfWork();

  const users = new UserRepository();
  const categories = new CategoryRepository();
  const products = new ProductRepository();
  const stores = new StoreRepository();
  const carts = new CartRepository();
  const orders = new OrderRepository();
  const orderItems = new OrderItemRepository();
  const receiptQueue = new ReceiptQueueRepository();
  const reviews = new ReviewRepository();
  const roles = new RoleRepository();
  const disputes = new OrderDisputeRepository();
  const fiscalSettings = new FiscalSettingsRepository();
  const fiscalProfiles = new StoreFiscalProfileRepository();
  const fiscalSeries = new InvoiceSeriesRepository();
  const invoices = new InvoiceRepository();
  const invoiceEmitter = new InvoiceEmitter(
    uow,
    invoices,
    fiscalSeries,
    fiscalProfiles,
    fiscalSettings,
    orders,
    new AgtClient()
  );

  // auth
  mediator.register(
    RegisterUserCommand,
    new RegisterUserCommandHandler(users)
  );
  mediator.register(LoginUserCommand, new LoginUserCommandHandler(users));
  mediator.register(
    SocialLoginCommand,
    new SocialLoginCommandHandler(users)
  );
  mediator.register(
    UpdateProfileCommand,
    new UpdateProfileCommandHandler(users)
  );
  mediator.registerQuery(GetMeQuery, new GetMeQueryHandler(users));

  // categories
  mediator.registerQuery(
    ListCategoriesQuery,
    new ListCategoriesQueryHandler(categories)
  );
  mediator.registerQuery(
    GetCategoryQuery,
    new GetCategoryQueryHandler(categories)
  );

  // reviews
  mediator.registerQuery(
    ProductReviewsQuery,
    new ProductReviewsQueryHandler(reviews)
  );
  mediator.registerQuery(
    StoreReviewsQuery,
    new StoreReviewsQueryHandler(reviews, stores)
  );
  mediator.register(
    CreateReviewCommand,
    new CreateReviewCommandHandler(reviews, stores)
  );

  // products
  mediator.registerQuery(
    FeaturedProductsQuery,
    new FeaturedProductsQueryHandler(products)
  );
  mediator.registerQuery(
    ProductsByCategoryQuery,
    new ProductsByCategoryQueryHandler(products)
  );
  mediator.registerQuery(
    ListProductsQuery,
    new ListProductsQueryHandler(products, categories)
  );
  mediator.registerQuery(
    GetProductQuery,
    new GetProductQueryHandler(products)
  );
  mediator.register(
    CreateProductCommand,
    new CreateProductCommandHandler(products, stores)
  );
  mediator.register(
    UpdateProductCommand,
    new UpdateProductCommandHandler(products)
  );
  mediator.register(
    DeleteProductCommand,
    new DeleteProductCommandHandler(products)
  );

  // stores
  mediator.registerQuery(MapStoresQuery, new MapStoresQueryHandler(stores));
  mediator.register(
    CreateStoreCommand,
    new CreateStoreCommandHandler(stores, users, categories)
  );
  mediator.registerQuery(
    ListStoresQuery,
    new ListStoresQueryHandler(stores)
  );
  mediator.registerQuery(GetStoreQuery, new GetStoreQueryHandler(stores));
  mediator.register(
    UpdateStoreCommand,
    new UpdateStoreCommandHandler(stores, categories)
  );
  mediator.registerQuery(
    GetPaymentMethodsQuery,
    new GetPaymentMethodsQueryHandler(stores)
  );
  mediator.register(
    UpdatePaymentMethodsCommand,
    new UpdatePaymentMethodsCommandHandler(stores)
  );
  mediator.registerQuery(
    StoreProductsQuery,
    new StoreProductsQueryHandler(stores, products)
  );

  // cart
  mediator.registerQuery(GetCartQuery, new GetCartQueryHandler(carts));
  mediator.register(
    AddCartItemCommand,
    new AddCartItemCommandHandler(carts, products)
  );
  mediator.register(
    UpdateCartItemCommand,
    new UpdateCartItemCommandHandler(carts)
  );
  mediator.register(
    RemoveCartItemCommand,
    new RemoveCartItemCommandHandler(carts)
  );
  mediator.register(
    ClearCartCommand,
    new ClearCartCommandHandler(carts)
  );

  // orders
  mediator.registerQuery(
    SellerOrdersQuery,
    new SellerOrdersQueryHandler(orders, stores)
  );
  mediator.registerQuery(
    GetSellerOrderQuery,
    new GetSellerOrderQueryHandler(orders, stores)
  );
  mediator.register(
    CreateOrderCommand,
    new CreateOrderCommandHandler(uow, orders, carts, stores, products)
  );
  mediator.registerQuery(
    ListUserOrdersQuery,
    new ListUserOrdersQueryHandler(orders)
  );
  mediator.registerQuery(GetOrderQuery, new GetOrderQueryHandler(orders));
  mediator.register(
    UpdateOrderStatusCommand,
    new UpdateOrderStatusCommandHandler(orders)
  );
  mediator.register(
    UploadReceiptCommand,
    new UploadReceiptCommandHandler(orders, receiptQueue)
  );
  mediator.register(
    UpdateOrderPaymentStatusCommand,
    new UpdateOrderPaymentStatusCommandHandler(
      orders,
      stores,
      orderItems,
      invoiceEmitter
    )
  );
  mediator.register(
    ShipOrderCommand,
    new ShipOrderCommandHandler(orders, stores, orderItems)
  );
  mediator.register(
    MarkOrderDeliveredCommand,
    new MarkOrderDeliveredCommandHandler(
      orders,
      stores,
      orderItems,
      invoiceEmitter
    )
  );
  mediator.register(
    ConfirmOrderReceiptCommand,
    new ConfirmOrderReceiptCommandHandler(orders, stores, orderItems)
  );
  mediator.registerQuery(
    GetOrderTimelineQuery,
    new GetOrderTimelineQueryHandler(orders, stores, orderItems)
  );

  // disputes (chat tripartido)
  mediator.registerQuery(
    GetOrderDisputeQuery,
    new GetOrderDisputeQueryHandler(orders, stores, disputes)
  );
  mediator.register(
    SendDisputeMessageCommand,
    new SendDisputeMessageCommandHandler(orders, stores, disputes)
  );
  mediator.register(
    UpdateDisputeStatusCommand,
    new UpdateDisputeStatusCommandHandler(orders, stores, disputes, users)
  );
  mediator.registerQuery(
    ListDisputesQuery,
    new ListDisputesQueryHandler(disputes)
  );
  mediator.registerQuery(
    AdminListDisputesQuery,
    new AdminListDisputesQueryHandler(disputes, stores)
  );
  mediator.registerQuery(
    AdminDisputesStatsQuery,
    new AdminDisputesStatsQueryHandler(disputes)
  );
  mediator.registerQuery(
    UserDisputeUnreadQuery,
    new UserDisputeUnreadQueryHandler(disputes, stores)
  );
  mediator.register(
    MarkDisputeReadCommand,
    new MarkDisputeReadCommandHandler(orders, stores, disputes)
  );
  mediator.register(
    ModerateDisputeCommand,
    new ModerateDisputeCommandHandler(orders, disputes, users)
  );

  // admin
  mediator.registerQuery(
    RevenueChartQuery,
    new RevenueChartQueryHandler(orders)
  );
  mediator.registerQuery(
    UsersChartQuery,
    new UsersChartQueryHandler(users)
  );
  mediator.registerQuery(
    OrdersStatsQuery,
    new OrdersStatsQueryHandler(orders)
  );
  mediator.registerQuery(
    UsersStatsQuery,
    new UsersStatsQueryHandler(users)
  );
  mediator.registerQuery(
    StoresStatsQuery,
    new StoresStatsQueryHandler(stores, reviews)
  );
  mediator.registerQuery(
    ProductsStatsQuery,
    new ProductsStatsQueryHandler(products, reviews, categories)
  );
  mediator.registerQuery(
    CategoriesStatsQuery,
    new CategoriesStatsQueryHandler(categories, products)
  );
  mediator.registerQuery(
    ReviewsStatsQuery,
    new ReviewsStatsQueryHandler(reviews)
  );
  mediator.registerQuery(
    DashboardStatsQuery,
    new DashboardStatsQueryHandler(users, products, orders, stores, reviews)
  );
  mediator.registerQuery(
    AdminUsersQuery,
    new AdminUsersQueryHandler(users)
  );
  mediator.register(
    UpdateUserRoleCommand,
    new UpdateUserRoleCommandHandler(users)
  );
  mediator.register(
    DeleteUserCommand,
    new DeleteUserCommandHandler(users)
  );
  mediator.registerQuery(
    AdminOrdersQuery,
    new AdminOrdersQueryHandler(orders, stores)
  );
  mediator.registerQuery(
    StoreRevenueQuery,
    new StoreRevenueQueryHandler(orders, stores, products)
  );
  mediator.register(
    AdminUpdateOrderStatusCommand,
    new AdminUpdateOrderStatusCommandHandler(orders)
  );
  mediator.register(
    AdminUpdateOrderPaymentCommand,
    new AdminUpdateOrderPaymentCommandHandler(orders, invoiceEmitter)
  );
  mediator.registerQuery(
    AdminStoresQuery,
    new AdminStoresQueryHandler(stores)
  );
  mediator.register(
    VerifyStoreCommand,
    new VerifyStoreCommandHandler(stores)
  );
  mediator.register(
    DeleteStoreCommand,
    new DeleteStoreCommandHandler(stores)
  );
  mediator.registerQuery(
    AdminProductsQuery,
    new AdminProductsQueryHandler(products)
  );
  mediator.register(
    ToggleProductActiveCommand,
    new ToggleProductActiveCommandHandler(products)
  );
  mediator.register(
    AdminDeleteProductCommand,
    new AdminDeleteProductCommandHandler(products)
  );
  mediator.register(
    CreateCategoryCommand,
    new CreateCategoryCommandHandler(categories)
  );
  mediator.registerQuery(
    AdminCategoriesQuery,
    new AdminCategoriesQueryHandler(categories)
  );
  mediator.register(
    UpdateCategoryCommand,
    new UpdateCategoryCommandHandler(categories)
  );
  mediator.register(
    DeleteCategoryCommand,
    new DeleteCategoryCommandHandler(categories)
  );
  mediator.registerQuery(
    AdminReviewsQuery,
    new AdminReviewsQueryHandler(reviews)
  );
  mediator.register(
    DeleteReviewCommand,
    new DeleteReviewCommandHandler(reviews)
  );

  // uploads
  mediator.register(UploadFileCommand, new UploadFileCommandHandler());

  // roles & responsabilidades (RBAC dinâmico)
  mediator.registerQuery(ListRolesQuery, new ListRolesQueryHandler(roles));
  mediator.registerQuery(
    ListResponsibilitiesQuery,
    new ListResponsibilitiesQueryHandler(roles)
  );
  mediator.register(CreateRoleCommand, new CreateRoleCommandHandler(roles));
  mediator.register(UpdateRoleCommand, new UpdateRoleCommandHandler(roles));
  mediator.register(DeleteRoleCommand, new DeleteRoleCommandHandler(roles));
  mediator.register(
    SetRoleResponsibilitiesCommand,
    new SetRoleResponsibilitiesCommandHandler(roles)
  );
  mediator.register(
    CreateResponsibilityCommand,
    new CreateResponsibilityCommandHandler(roles)
  );
  mediator.register(
    UpdateResponsibilityCommand,
    new UpdateResponsibilityCommandHandler(roles)
  );
  mediator.register(
    DeleteResponsibilityCommand,
    new DeleteResponsibilityCommandHandler(roles)
  );

  // fiscal (Regime Jurídico das Faturas – Decreto Presidencial 71/25)
  mediator.registerQuery(
    GetFiscalSettingsQuery,
    new GetFiscalSettingsQueryHandler(fiscalSettings)
  );
  mediator.register(
    UpsertFiscalSettingsCommand,
    new UpsertFiscalSettingsCommandHandler(fiscalSettings)
  );
  mediator.registerQuery(
    GetStoreFiscalProfileQuery,
    new GetStoreFiscalProfileQueryHandler(fiscalProfiles, stores)
  );
  mediator.register(
    UpsertStoreFiscalProfileCommand,
    new UpsertStoreFiscalProfileCommandHandler(fiscalProfiles, stores)
  );
  mediator.registerQuery(
    ListStoreSeriesQuery,
    new ListStoreSeriesQueryHandler(fiscalSeries, stores)
  );
  mediator.register(
    OpenInvoiceSeriesCommand,
    new OpenInvoiceSeriesCommandHandler(fiscalSeries, stores)
  );
  mediator.registerQuery(
    GetOrderInvoiceQuery,
    new GetOrderInvoiceQueryHandler(invoices, orders, stores)
  );
  mediator.registerQuery(
    GetInvoiceQuery,
    new GetInvoiceQueryHandler(invoices, stores)
  );
  mediator.register(
    EmitOrderInvoiceCommand,
    new EmitOrderInvoiceCommandHandler(
      invoiceEmitter,
      orders,
      orderItems,
      stores
    )
  );
}