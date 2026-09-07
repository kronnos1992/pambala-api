import { Hono } from "hono";
import { mediator } from "../../shared/mediator";
import { authFilter } from "../../shared/filters/auth.filter";
import { productSchema } from "../../lib/validators";
import {
  FeaturedProductsQuery,
  ProductsByCategoryQuery,
  ListProductsQuery,
  GetProductQuery,
  CreateProductCommand,
  UpdateProductCommand,
  DeleteProductCommand,
} from "../../handlers/products.handlers";

const products = new Hono();

products.get("/featured", async (c) => {
  const locale = c.req.query("locale");
  const result = await mediator.query(new FeaturedProductsQuery(locale));

  return c.json(result);
});

products.get("/category/:categoryId", async (c) => {
  const categoryId = c.req.param("categoryId")!;
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const locale = c.req.query("locale");

  const result = await mediator.query(
    new ProductsByCategoryQuery(categoryId, page, limit, locale)
  );

  return c.json(result);
});

products.get("/", async (c) => {
  const result = await mediator.query(
    new ListProductsQuery({
      page: parseInt(c.req.query("page") || "1"),
      limit: parseInt(c.req.query("limit") || "20"),
      q: c.req.query("q"),
      categoryId: c.req.query("categoryId"),
      categorySlug: c.req.query("categorySlug"),
      storeId: c.req.query("storeId"),
      minPrice: c.req.query("minPrice"),
      maxPrice: c.req.query("maxPrice"),
      condition: c.req.query("condition"),
      sort: c.req.query("sort"),
      locale: c.req.query("locale"),
    })
  );

  return c.json(result);
});

products.get("/:id", async (c) => {
  const idOrSlug = c.req.param("id")!;
  const locale = c.req.query("locale");

  const result = await mediator.query(new GetProductQuery(idOrSlug, locale));

  return c.json(result);
});

products.post("/", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const body = await c.req.json();
  const data = productSchema.parse(body);

  const result = await mediator.send(
    new CreateProductCommand(userId, roles, data)
  );

  return c.json(result, 201);
});

products.put("/:id", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const id = c.req.param("id")!;
  const body = await c.req.json();

  const result = await mediator.send(new UpdateProductCommand(userId, id, body));

  return c.json(result);
});

products.delete("/:id", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const id = c.req.param("id")!;

  const result = await mediator.send(new DeleteProductCommand(userId, id));

  return c.json(result);
});

export default products;