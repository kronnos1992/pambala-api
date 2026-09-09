import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { mediator } from "../../shared/mediator";
import { authFilter } from "../../shared/filters/auth.filter";
import { disputeEvents } from "../../shared/events/dispute-events";
import { orderSchema } from "../../lib/validators";
import {
  SellerOrdersQuery,
  GetSellerOrderQuery,
  CreateOrderCommand,
  ListUserOrdersQuery,
  GetOrderQuery,
  UpdateOrderStatusCommand,
  UploadReceiptCommand,
  UpdateOrderPaymentStatusCommand,
  ShipOrderCommand,
  MarkOrderDeliveredCommand,
  ConfirmOrderReceiptCommand,
  GetOrderTimelineQuery,
} from "../../handlers/orders.handlers";
import {
  GetOrderDisputeQuery,
  SendDisputeMessageCommand,
  UpdateDisputeStatusCommand,
  UserDisputeUnreadQuery,
  MarkDisputeReadCommand,
  ModerateDisputeCommand,
} from "../../handlers/disputes.handlers";

const orders = new Hono();

// Notificações de mensagens não lidas (usado como "badge" em todo o site)
orders.get("/disputes/unread", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];

  const result = await mediator.query(
    new UserDisputeUnreadQuery(userId, roles)
  );

  return c.json(result);
});

orders.get("/seller/orders", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");

  const result = await mediator.query(
    new SellerOrdersQuery(userId, roles, page, limit)
  );

  return c.json(result);
});

orders.get("/seller/orders/:id", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const id = c.req.param("id")!;

  const result = await mediator.query(
    new GetSellerOrderQuery(userId, roles, id)
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
  const roles = (c as any).get("roles") as string[];
  const id = c.req.param("id")!;

  const result = await mediator.query(new GetOrderQuery(userId, roles, id));

  return c.json(result);
});

orders.put("/:id/status", authFilter, async (c) => {
  const roles = (c as any).get("roles") as string[];
  const id = c.req.param("id")!;
  const body = await c.req.json();
  const { status } = body;

  const result = await mediator.send(
    new UpdateOrderStatusCommand(roles, id, status)
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
  const roles = (c as any).get("roles") as string[];
  const id = c.req.param("id")!;
  const body = await c.req.json();
  const { paymentStatus } = body;

  const result = await mediator.send(
    new UpdateOrderPaymentStatusCommand(userId, roles, id, paymentStatus)
  );

  return c.json(result);
});

// Chat Tripartido (Mediação de Pedido: Cliente, Vendedor, Admin)
orders.get("/:id/dispute", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const id = c.req.param("id")!;

  const result = await mediator.query(
    new GetOrderDisputeQuery(id, userId, roles)
  );

  return c.json(result);
});

// Stream de eventos em tempo real do chat tripartido (SSE).
// Substitui o polling de 4s do cliente: o servidor empurra o snapshot completo
// da disputa sempre que há uma alteração na mediação daquele pedido.
// O formato é text/event-stream (fora do encriptador E2E de respostas JSON).
orders.get("/:id/dispute/events", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const id = c.req.param("id")!;

  // Verifica acesso/participação antes de abrir o stream (rejeita 401/403/404)
  const initial = await mediator.query<{
    dispute: unknown;
    currentUserRole: string;
    order: { id: string };
  }>(new GetOrderDisputeQuery(id, userId, roles));
  const orderId = initial.order.id;

  c.header("Cache-Control", "no-cache, no-transform");
  c.header("X-Accel-Buffering", "no");
  c.header("Connection", "keep-alive");

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: "update",
      data: JSON.stringify(initial),
    });

    let refreshing = false;
    const refresh = async () => {
      if (stream.aborted || refreshing) return;
      refreshing = true;
      try {
        const fresh = await mediator.query(
          new GetOrderDisputeQuery(id, userId, roles)
        );
        if (stream.aborted) return;
        await stream.writeSSE({
          event: "update",
          data: JSON.stringify(fresh),
        });
      } catch {
        // Cliente desligou durante a consulta → o loop seguinte detecta o abort
      } finally {
        refreshing = false;
      }
    };

    const unsubscribe = disputeEvents.subscribe((changedOrderId) => {
      if (changedOrderId === orderId) {
        void refresh();
      }
    });

    stream.onAbort(() => unsubscribe());

    // Heartbeat a cada 30s: mantém a ligação viva em proxies/limites de idle do Node
    while (!stream.aborted) {
      await stream.sleep(30000);
      if (stream.aborted) break;
      await stream.write(": keep-alive\n\n");
    }

    unsubscribe();
  });
});

orders.post("/:id/dispute/messages", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const id = c.req.param("id")!;
  const body = await c.req.json();
  const { content, attachment } = body;

  const result = await mediator.send(
    new SendDisputeMessageCommand(id, userId, roles, content, attachment)
  );

  return c.json(result, 201);
});

orders.put("/:id/dispute/status", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const id = c.req.param("id")!;
  const body = await c.req.json();
  const { status } = body;

  const result = await mediator.send(
    new UpdateDisputeStatusCommand(id, userId, roles, status)
  );

  return c.json(result);
});

orders.put("/:id/dispute/read", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const id = c.req.param("id")!;

  const result = await mediator.send(
    new MarkDisputeReadCommand(id, userId, roles)
  );

  return c.json(result);
});

// Ação de moderação manual do administrador (forçar aprovação / rejeição definitiva)
orders.post("/:id/dispute/moderation", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const id = c.req.param("id")!;
  const body = await c.req.json();
  const { action, note } = body;

  const result = await mediator.send(
    new ModerateDisputeCommand(id, userId, roles, action, note)
  );

  return c.json(result);
});

// Ciclo de vida do pedido: rastreamento em tempo real
// Linha do tempo dos eventos (criado, pagamento, verificação, moderação, envio, entrega)
orders.get("/:id/timeline", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const id = c.req.param("id")!;

  const result = await mediator.query(
    new GetOrderTimelineQuery(userId, roles, id)
  );

  return c.json(result);
});

// Vendedor/Admin marcam o pedido como enviado (com dados de rastreio)
orders.post("/:id/ship", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const id = c.req.param("id")!;
  const body = await c.req.json();
  const { carrierName, trackingCode, estimatedDelivery } = body;

  const result = await mediator.send(
    new ShipOrderCommand(userId, roles, id, {
      carrierName,
      trackingCode,
      estimatedDelivery,
    })
  );

  return c.json(result);
});

// Vendedor/Admin marcam o pedido como entregue
orders.put("/:id/delivered", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const id = c.req.param("id")!;
  const body = await c.req.json();
  const { note } = body;

  const result = await mediator.send(
    new MarkOrderDeliveredCommand(userId, roles, id, note)
  );

  return c.json(result);
});

// Cliente confirma a recepção — fecha o ciclo de vida do pedido
orders.put("/:id/received", authFilter, async (c) => {
  const userId = (c as any).get("userId") as string;
  const roles = (c as any).get("roles") as string[];
  const id = c.req.param("id")!;

  const result = await mediator.send(
    new ConfirmOrderReceiptCommand(userId, roles, id)
  );

  return c.json(result);
});

export default orders;