import {
  ICommand,
  ICommandHandler,
  IQuery,
  IQueryHandler,
} from "../shared/cqrs";
import { ReviewRepository } from "../shared/repositories/review.repository";
import { StoreRepository } from "../shared/repositories/store.repository";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../shared/errors";
import { computeAvgRating } from "../shared/mappers";
import { ReviewInput } from "../lib/validators";

export class ProductReviewsQuery implements IQuery {
  constructor(public readonly productId: string) {}
}

export class StoreReviewsQuery implements IQuery {
  constructor(public readonly storeIdOrSlug: string) {}
}

export class CreateReviewCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: ReviewInput
  ) {}
}

export class ProductReviewsQueryHandler
  implements IQueryHandler<ProductReviewsQuery, any>
{
  constructor(private readonly reviews: ReviewRepository) {}

  async handle(query: ProductReviewsQuery) {
    const reviewsList = await this.reviews.findByProduct(query.productId);

    const avgRating = computeAvgRating(reviewsList);

    return {
      reviews: reviewsList,
      avgRating,
      totalReviews: reviewsList.length,
    };
  }
}

export class StoreReviewsQueryHandler
  implements IQueryHandler<StoreReviewsQuery, any>
{
  constructor(
    private readonly reviews: ReviewRepository,
    private readonly stores: StoreRepository
  ) {}

  async handle(query: StoreReviewsQuery) {
    const store = await this.stores.findBySlugOrIdWithCounts(
      query.storeIdOrSlug
    );

    if (!store) {
      throw new NotFoundError("Loja não encontrada");
    }

    const reviewsList = await this.reviews.findByStore(store.id);

    const avgRating = computeAvgRating(reviewsList);

    return {
      reviews: reviewsList,
      avgRating,
      totalReviews: reviewsList.length,
    };
  }
}

export class CreateReviewCommandHandler
  implements ICommandHandler<CreateReviewCommand, any>
{
  constructor(
    private readonly reviews: ReviewRepository,
    private readonly stores: StoreRepository
  ) {}

  async handle(command: CreateReviewCommand) {
    const { userId, data } = command;

    if (!data.productId && !data.storeId) {
      throw new BadRequestError("productId ou storeId é obrigatório");
    }

    if (data.productId) {
      const existingReview = await this.reviews.findByUserAndProduct(
        userId,
        data.productId
      );
      if (existingReview) {
        throw new ConflictError("Você já avaliou este produto");
      }
    }

    if (data.storeId) {
      const existingReview = await this.reviews.findByUserAndStore(
        userId,
        data.storeId
      );
      if (existingReview) {
        throw new ConflictError("Você já avaliou esta loja");
      }
    }

    const review = await this.reviews.create({
      rating: data.rating,
      comment: data.comment,
      userId,
      productId: data.productId || null,
      storeId: data.storeId || null,
    });

    if (data.storeId) {
      const storeReviews = await this.reviews.aggregateAvgByStore(data.storeId);

      if (storeReviews._avg.rating) {
        await this.stores.updateRating(data.storeId, storeReviews._avg.rating);
      }
    }

    return { review };
  }
}