import { Hono } from "hono";
import { mediator } from "../../shared/mediator";
import { authFilter } from "../../shared/filters/auth.filter";
import { reviewSchema } from "../../lib/validators";
import {
  ProductReviewsQuery,
  StoreReviewsQuery,
  CreateReviewCommand,
} from "../../handlers/reviews.handlers";

const reviews = new Hono();

reviews.get("/product/:productId", async (c) => {
  const productId = c.req.param("productId")!;

  const result = await mediator.query(new ProductReviewsQuery(productId));

  return c.json(result);
});

reviews.get("/store/:storeId", async (c) => {
  const storeId = c.req.param("storeId")!;

  const result = await mediator.query(new StoreReviewsQuery(storeId));

  return c.json(result);
});

reviews.post("/", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const body = await c.req.json();
  const data = reviewSchema.parse(body);

  const result = await mediator.send(new CreateReviewCommand(userId, data));

  return c.json(result, 201);
});

export default reviews;