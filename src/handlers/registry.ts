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
    new CreateStoreCommandHandler(stores, users)
  );
  mediator.registerQuery(
    ListStoresQuery,
    new ListStoresQueryHandler(stores)
  );
  mediator.registerQuery(GetStoreQuery, new GetStoreQueryHandler(stores));
  mediator.register(
    UpdateStoreCommand,
    new UpdateStoreCommandHandler(stores)
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
    new UpdateOrderPaymentStatusCommandHandler(orders, stores, orderItems)
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
    new AdminOrdersQueryHandler(orders)
  );
  mediator.register(
    AdminUpdateOrderStatusCommand,
    new AdminUpdateOrderStatusCommandHandler(orders)
  );
  mediator.register(
    AdminUpdateOrderPaymentCommand,
    new AdminUpdateOrderPaymentCommandHandler(orders)
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
}