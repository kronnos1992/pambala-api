import { Hono } from "hono";
import { mediator } from "../../shared/mediator";
import { authFilter } from "../../shared/filters/auth.filter";
import {
  GetFiscalSettingsQuery,
  UpsertFiscalSettingsCommand,
  GetStoreFiscalProfileQuery,
  UpsertStoreFiscalProfileCommand,
  ListStoreSeriesQuery,
  OpenInvoiceSeriesCommand,
  GetOrderInvoiceQuery,
  GetInvoiceQuery,
  GetInvoicePdfQuery,
  EmitOrderInvoiceCommand,
  RefreshInvoiceAgtStatusCommand,
} from "../../handlers/fiscal.handlers";

const fiscal = new Hono();

fiscal.get("/settings", authFilter, async (c) => {
  const roles = (c as any).get("roles") as string[];
  const result = await mediator.query(new GetFiscalSettingsQuery(roles));
  return c.json(result);
});

fiscal.put("/settings", authFilter, async (c) => {
  const roles = (c as any).get("roles") as string[];
  const data = await c.req.json();
  const result = await mediator.send(new UpsertFiscalSettingsCommand(roles, data));
  return c.json(result);
});

fiscal.get("/stores/:storeId/fiscal-profile", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const storeId = c.req.param("storeId")!;

  const result = await mediator.query(
    new GetStoreFiscalProfileQuery(userId, roles, storeId)
  );
  return c.json(result);
});

fiscal.put("/stores/:storeId/fiscal-profile", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const storeId = c.req.param("storeId")!;
  const data = await c.req.json();

  const result = await mediator.send(
    new UpsertStoreFiscalProfileCommand(userId, roles, storeId, data)
  );
  return c.json(result);
});

fiscal.get("/stores/:storeId/series", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const storeId = c.req.param("storeId")!;

  const result = await mediator.query(new ListStoreSeriesQuery(userId, roles, storeId));
  return c.json(result);
});

fiscal.post("/stores/:storeId/series", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const storeId = c.req.param("storeId")!;
  const data = await c.req.json();

  const result = await mediator.send(
    new OpenInvoiceSeriesCommand(userId, roles, storeId, data)
  );
  return c.json(result, 201);
});

fiscal.get("/orders/:orderId/invoice", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const orderId = c.req.param("orderId")!;

  const result = await mediator.query(
    new GetOrderInvoiceQuery(userId, roles, orderId)
  );
  return c.json(result);
});

fiscal.post("/orders/:orderId/invoice", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const orderId = c.req.param("orderId")!;

  const result = await mediator.send(
    new EmitOrderInvoiceCommand(userId, roles, orderId)
  );
  return c.json(result, 201);
});

fiscal.get("/invoices/:id", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const id = c.req.param("id")!;

  const result = await mediator.query(new GetInvoiceQuery(userId, roles, id));
  return c.json(result);
});

fiscal.get("/invoices/:id/pdf", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const id = c.req.param("id")!;

  const result = (await mediator.query(
    new GetInvoicePdfQuery(userId, roles, id)
  )) as { pdf: Uint8Array; filename: string };
  c.header("Content-Type", "application/pdf");
  c.header(
    "Content-Disposition",
    `inline; filename="${result.filename.replace(/"/g, "")}"`
  );
  c.header("Cache-Control", "no-store");
  return c.body(result.pdf as any);
});

fiscal.post("/invoices/:id/refresh-status", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const id = c.req.param("id")!;

  const result = await mediator.send(
    new RefreshInvoiceAgtStatusCommand(userId, roles, id)
  );
  return c.json(result);
});

export default fiscal;