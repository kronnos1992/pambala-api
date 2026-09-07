import { Hono } from "hono";
import { mediator } from "../../shared/mediator";
import { authFilter } from "../../shared/filters/auth.filter";
import { storeSchema } from "../../lib/validators";
import {
  MapStoresQuery,
  CreateStoreCommand,
  ListStoresQuery,
  GetStoreQuery,
  UpdateStoreCommand,
  GetPaymentMethodsQuery,
  UpdatePaymentMethodsCommand,
  StoreProductsQuery,
} from "../../handlers/stores.handlers";

const stores = new Hono();

stores.get("/map", async (c) => {
  const locale = c.req.query("locale");
  const result = await mediator.query(new MapStoresQuery(locale));

  return c.json(result);
});

stores.post("/", authFilter, async (c) => {
  const role = (c as any).get("role") as string;
  const userId = (c as any).get("userId") as string;
  const body = await c.req.json();
  const data = storeSchema.parse(body);

  const result = await mediator.send(new CreateStoreCommand(userId, role, data));

  return c.json(result, 201);
});

stores.get("/", async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const sort = c.req.query("sort");

  const result = await mediator.query(new ListStoresQuery(page, limit, sort));

  return c.json(result);
});

stores.get("/payment-methods", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;

  const result = await mediator.query(new GetPaymentMethodsQuery(userId));

  return c.json(result);
});

stores.put("/payment-methods", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const body = await c.req.json();
  const { paymentMethods } = body;

  const result = await mediator.send(
    new UpdatePaymentMethodsCommand(userId, paymentMethods)
  );

  return c.json(result);
});

stores.get("/:idOrSlug", async (c) => {
  const idOrSlug = c.req.param("idOrSlug")!;
  const locale = c.req.query("locale");

  const result = await mediator.query(new GetStoreQuery(idOrSlug, locale));

  return c.json(result);
});

stores.put("/", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const body = await c.req.json();

  const result = await mediator.send(new UpdateStoreCommand(userId, body));

  return c.json(result);
});

stores.get("/:id/products", async (c) => {
  const idOrSlug = c.req.param("id")!;
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const locale = c.req.query("locale");

  const result = await mediator.query(
    new StoreProductsQuery(idOrSlug, page, limit, locale)
  );

  return c.json(result);
});

export default stores;