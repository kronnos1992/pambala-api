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
  ProcessAgtWebhookCommand,
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

// Webhook de notificação da AGT: recebe o resultado da validação diferida das
// facturas em tempo real (documentStatus V/I) e atualiza o agtStatus local.
// Endpoint público (sem authFilter) — a autenticação é feita por token
// partilhado ou Basic Auth, conforme FiscalSettings.
fiscal.post("/webhooks/agt", async (c) => {
  let payload: any = {};
  try {
    payload = await c.req.json();
  } catch {
    payload = {};
  }

  const token =
    c.req.header("x-agt-webhook-token") ||
    c.req.header("x-agttoken") ||
    "";

  let basicAuth: { username?: string; password?: string } | null = null;
  const authorization = c.req.header("authorization") || "";
  if (authorization.toLowerCase().startsWith("basic ")) {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString(
      "utf8"
    );
    const idx = decoded.indexOf(":");
    if (idx >= 0) {
      basicAuth = {
        username: decoded.slice(0, idx),
        password: decoded.slice(idx + 1),
      };
    }
  }

  const result = (await mediator.send(
    new ProcessAgtWebhookCommand(payload, token, basicAuth)
  )) as any;

  const status = result?.status === 401 ? 401 : 200;
  return c.json(result, status);
});

export default fiscal;