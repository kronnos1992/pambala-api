import { Hono } from "hono";
import { mediator } from "../../shared/mediator";
import { authFilter } from "../../shared/filters/auth.filter";
import { orderSchema } from "../../lib/validators";
import {
  SellerOrdersQuery,
  CreateOrderCommand,
  ListUserOrdersQuery,
  GetOrderQuery,
  UpdateOrderStatusCommand,
  UploadReceiptCommand,
  UpdateOrderPaymentStatusCommand,
} from "../../handlers/orders.handlers";

const orders = new Hono();

orders.get("/seller/orders", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");

  const result = await mediator.query(
    new SellerOrdersQuery(userId, page, limit)
  );

  return c.json(result);
});

orders.post("/", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const body = await c.req.json();
  const data = orderSchema.parse(body);

  const result = await mediator.send(new CreateOrderCommand(userId, data));

  return c.json(result, 201);
});

orders.get("/", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");

  const result = await mediator.query(
    new ListUserOrdersQuery(userId, page, limit)
  );

  return c.json(result);
});

orders.get("/:id", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const role = (c as any).get("role") as string;
  const id = c.req.param("id")!;

  const result = await mediator.query(new GetOrderQuery(userId, role, id));

  return c.json(result);
});

orders.put("/:id/status", authFilter, async (c) => {
  const role = (c as any).get("role") as string;
  const id = c.req.param("id")!;
  const body = await c.req.json();
  const { status } = body;

  const result = await mediator.send(
    new UpdateOrderStatusCommand(role, id, status)
  );

  return c.json(result);
});

orders.post("/:id/receipt", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const id = c.req.param("id")!;
  const body = await c.req.json();
  const { receiptImage } = body;

  const result = await mediator.send(
    new UploadReceiptCommand(userId, id, receiptImage)
  );

  return c.json(result);
});

orders.put("/:id/payment-status", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const role = (c as any).get("role") as string;
  const id = c.req.param("id")!;
  const body = await c.req.json();
  const { paymentStatus } = body;

  const result = await mediator.send(
    new UpdateOrderPaymentStatusCommand(userId, role, id, paymentStatus)
  );

  return c.json(result);
});

export default orders;