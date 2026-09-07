import { Hono } from "hono";
import { mediator } from "../../shared/mediator";
import { authFilter } from "../../shared/filters/auth.filter";
import {
  GetCartQuery,
  AddCartItemCommand,
  UpdateCartItemCommand,
  RemoveCartItemCommand,
  ClearCartCommand,
} from "../../handlers/cart.handlers";

const cart = new Hono();

cart.use("*", authFilter);

cart.get("/", async (c) => {
  const userId = (c as any).get("userId") as string;

  const result = await mediator.query(new GetCartQuery(userId));

  return c.json(result);
});

cart.post("/items", async (c) => {
  const userId = (c as any).get("userId") as string;
  const body = await c.req.json();
  const { productId, quantity = 1 } = body;

  const result = await mediator.send(
    new AddCartItemCommand(userId, productId, quantity)
  );

  return c.json(result);
});

cart.put("/items/:itemId", async (c) => {
  const userId = (c as any).get("userId") as string;
  const itemId = c.req.param("itemId")!;
  const body = await c.req.json();
  const { quantity } = body;

  const result = await mediator.send(
    new UpdateCartItemCommand(userId, itemId, quantity)
  );

  return c.json(result);
});

cart.delete("/items/:itemId", async (c) => {
  const userId = (c as any).get("userId") as string;
  const itemId = c.req.param("itemId")!;

  const result = await mediator.send(
    new RemoveCartItemCommand(userId, itemId)
  );

  return c.json(result);
});

cart.delete("/", async (c) => {
  const userId = (c as any).get("userId") as string;

  const result = await mediator.send(new ClearCartCommand(userId));

  return c.json(result);
});

export default cart;