import { Hono } from "hono";
import { prisma } from "../../lib/prisma";
import { paymentHistoryPush } from "../../shared/mappers";

/**
 * Bridge interno para o agente Python de comprovativos (`receipt_agent`).
 *
 * O agente corre fora do Worker (VPS/cron) e precisa de aceder à fila que a
 * API escreve na D1. Estes endpoints espelham a interface de `ReceiptDatabase`
 * (receipt_agent/db.py): pending/claim/complete/fail/duplicates/stats/validation.
 *
 * Autenticação: header `X-Agent-Key` (env secret `RECEIPT_AGENT_KEY`).
 */

const agent = new Hono();

function authorized(c: any): boolean {
  const expected = ((c as any).env?.RECEIPT_AGENT_KEY as string) || "";
  if (!expected) return false;
  const provided = c.req.header("x-agent-key") || "";
  const key = (provided.startsWith("Bearer ") ? provided.slice(7) : provided).trim();
  return key.length > 0 && expected === key;
}

agent.use("*", async (c, next) => {
  if (!authorized(c)) {
    return c.json({ error: "Acesso negado" }, 401);
  }
  return next();
});

function parseJson(raw: string | null, fallback: any): any {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function toItem(row: any, job: any, consent: boolean): any {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    total: row.total,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    paymentDetails: parseJson(row.paymentDetails ?? null, {}),
    paymentHistory: row.paymentHistory || "[]",
    validationStatus: row.validationStatus,
    validationResult: parseJson(row.validationResult ?? null, {}),
    receiptImage: row.receiptImage,
    jobId: job?.id ?? null,
    attempts: job?.attempts ?? 0,
    maxAttempts: job?.maxAttempts ?? 3,
    aiValidationConsent: Boolean(consent),
    paymentCode: row.paymentCode ?? null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  };
}

// GET /api/agent/receipts/pending?limit=N&only=ID — espelha db.pending()
agent.get("/receipts/pending", async (c) => {
  const limit = parseInt(c.req.query("limit") || "0") || 0;
  const only = c.req.query("only") || "";

  let jobs: any[] = [];
  let legacy: any[] = [];

  if (only) {
    const order = await prisma.order.findFirst({
      where: { OR: [{ id: only }, { orderNumber: only }] },
      include: { user: { select: { aiValidationConsent: true } } },
    });
    if (order) {
      const job = await prisma.receiptQueue.findUnique({
        where: { orderId: order.id },
      });
      jobs = [
        {
          ...job,
          order,
        },
      ].filter((j) => j && j.status === "PENDING");
    }
  } else {
    jobs = await prisma.receiptQueue.findMany({
      where: { status: "PENDING" },
      orderBy: { enqueuedAt: "asc" },
      include: {
        order: { include: { user: { select: { aiValidationConsent: true } } } },
      },
    });

    legacy = await prisma.order.findMany({
      where: {
        paymentMethod: { not: "CASH_ON_DELIVERY" },
        receiptJob: { is: null },
        NOT: [{ receiptImage: null }, { receiptImage: "" }],
      },
      include: { user: { select: { aiValidationConsent: true } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  const items: any[] = [];

  for (const j of jobs) {
    if (!j.order) continue;
    if (j.attempts >= j.maxAttempts) continue;
    items.push(
      toItem(j.order, j, j.order.user?.aiValidationConsent ?? false)
    );
  }

  for (const o of legacy) {
    if (o.receiptImage !== "" && !o.receiptImage) continue;
    const vr = parseJson(o.validationResult ?? null, {});
    if (vr && vr.agentProcessedAt) continue;
    items.push(toItem(o, null, o.user?.aiValidationConsent ?? false));
  }

  const out = only ? items : items.slice(0, limit || items.length);
  return c.json(out);
});

// POST /api/agent/receipts/:orderId/claim — espelha db.claim()
agent.post("/receipts/:orderId/claim", async (c) => {
  const orderId = c.req.param("orderId")!;
  const now = new Date().toISOString();
  const current = await prisma.receiptQueue.findUnique({ where: { orderId } });
  if (!current) {
    return c.json({ error: "Pedido fora da fila" }, 404);
  }
  await prisma.receiptQueue.update({
    where: { orderId },
    data: {
      status: "PROCESSING",
      attempts: current.attempts + 1,
      startedAt: now,
      updatedAt: now,
    },
  });
  return c.json({ ok: true });
});

// POST /api/agent/receipts/:orderId/complete — espelha db.complete()
agent.post("/receipts/:orderId/complete", async (c) => {
  const orderId = c.req.param("orderId")!;
  let result: any;
  try {
    result = await c.req.json();
  } catch {
    return c.json({ error: "Body JSON inválido" }, 400);
  }
  if (!result || typeof result !== "object") {
    return c.json({ error: "Resultado obrigatório" }, 400);
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    return c.json({ error: "Pedido não encontrado" }, 404);
  }

  const status = result.status || "REVIEW";
  const score = Number.isFinite(result.score) ? result.score : 0;
  const flags = Array.isArray(result.flags)
    ? result.flags.map(String)
    : [];

  const history = paymentHistoryPush(order.paymentHistory, {
    at: new Date().toISOString(),
    by: "receipt_agent",
    role: "AGENT",
    action: "AGENT_REVIEW",
    status: "AWAITING_PAYMENT",
    validationStatus: status,
    score,
    flags,
  });

  const fingerprint = result.transaction?.fingerprint ?? null;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      validationStatus: status,
      validationResult: JSON.stringify(result),
      paymentHistory: JSON.stringify(history),
      transactionFingerprint: fingerprint || undefined,
    },
  });

  const payload = JSON.stringify(result);
  const now = new Date().toISOString();
  const exists = await prisma.receiptQueue.findUnique({
    where: { orderId },
  });
  if (!exists) {
    await prisma.receiptQueue.create({
      data: {
        orderId,
        status: "DONE",
        attempts: 1,
        result: payload,
        enqueuedAt: now,
        completedAt: now,
      },
    });
  } else {
    await prisma.receiptQueue.update({
      where: { orderId },
      data: {
        status: "DONE",
        result: payload,
        completedAt: now,
        updatedAt: now,
      },
    });
  }

  return c.json({ ok: true });
});

// POST /api/agent/receipts/:orderId/fail — espelha db.fail()
agent.post("/receipts/:orderId/fail", async (c) => {
  const orderId = c.req.param("orderId")!;
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    // noop — erro vazio
  }
  const current = await prisma.receiptQueue.findUnique({
    where: { orderId },
  });
  if (!current) {
    return c.json({ error: "Pedido fora da fila" }, 404);
  }
  const requeue = current.attempts < current.maxAttempts;
  await prisma.receiptQueue.update({
    where: { orderId },
    data: {
      status: requeue ? "PENDING" : "FAILED",
      lastError: String((body as any).error || "").slice(0, 2000),
      updatedAt: new Date().toISOString(),
    },
  });
  return c.json({ ok: true });
});

// GET /api/agent/receipts/:identifier/validation — espelha db.get_validation()
agent.get("/receipts/:identifier/validation", async (c) => {
  const identifier = c.req.param("identifier")!;
  const order = await prisma.order.findFirst({
    where: { OR: [{ id: identifier }, { orderNumber: identifier }] },
  });
  if (!order) {
    return c.json({ error: "Pedido não encontrado" }, 404);
  }
  return c.json({
    paymentHistory: order.paymentHistory || "[]",
    validationStatus: order.validationStatus,
    validationResult: parseJson(order.validationResult ?? null, {}),
    orderNumber: order.orderNumber,
  });
});

// GET /api/agent/receipts/duplicates/hash?orderId=&hash= — espelha db.find_duplicate_receipt()
agent.get("/receipts/duplicates/hash", async (c) => {
  const orderId = c.req.query("orderId") || "";
  const hash = c.req.query("hash") || "";
  if (!hash) return c.json(null);

  const orders = await prisma.order.findMany({
    where: {
      id: { not: orderId },
      validationResult: { not: null },
    },
    select: {
      id: true,
      orderNumber: true,
      paymentStatus: true,
      validationStatus: true,
      validationResult: true,
    },
  });
  for (const o of orders) {
    const vr = parseJson(o.validationResult, {});
    const f = vr?.forensics;
    const signals = typeof f?.signals === "object" ? f.signals : {};
    if (signals.hash === hash || f?.hash === hash) {
      return c.json({
        id: o.id,
        orderNumber: o.orderNumber,
        paymentStatus: o.paymentStatus,
        validationStatus: o.validationStatus,
      });
    }
  }
  return c.json(null);
});

// GET /api/agent/receipts/duplicates/fingerprint?orderId=&fingerprint=
//   — espelha db.find_duplicate_fingerprint()
agent.get("/receipts/duplicates/fingerprint", async (c) => {
  const orderId = c.req.query("orderId") || "";
  const fingerprint = c.req.query("fingerprint") || "";
  if (!fingerprint) return c.json(null);

  const byColumn = await prisma.order.findFirst({
    where: {
      id: { not: orderId },
      transactionFingerprint: fingerprint,
    },
    select: {
      id: true,
      orderNumber: true,
      paymentStatus: true,
      validationStatus: true,
    },
  });
  if (byColumn) return c.json(byColumn);

  const orders = await prisma.order.findMany({
    where: {
      id: { not: orderId },
      validationResult: { not: null },
    },
    select: {
      id: true,
      orderNumber: true,
      paymentStatus: true,
      validationStatus: true,
      validationResult: true,
    },
  });
  for (const o of orders) {
    const vr = parseJson(o.validationResult, {});
    if (vr?.transaction?.fingerprint === fingerprint) {
      return c.json({
        id: o.id,
        orderNumber: o.orderNumber,
        paymentStatus: o.paymentStatus,
        validationStatus: o.validationStatus,
      });
    }
  }
  return c.json(null);
});

// GET /api/agent/stats — espelha db.stats() + db.queue_stats()
agent.get("/stats", async (c) => {
  const [uploaded, queueRows, rows] = await Promise.all([
    prisma.order.count({
      where: {
        NOT: [{ receiptImage: null }, { receiptImage: "" }],
      },
    }),
    prisma.receiptQueue.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.order.findMany({
      where: { validationResult: { not: null } },
      select: { validationStatus: true, validationResult: true },
    }),
  ]);

  const statuses = [
    "AQUEUE",
    "PROOF_ACCEPTED",
    "MANUAL_REVIEW",
    "PROOF_REJECTED",
    "PASS",
    "REVIEW",
    "FAIL",
  ];
  const counts: Record<string, number> = {};
  for (const s of statuses) counts[s.toLowerCase()] = 0;
  for (const r of rows) {
    if (r.validationStatus) {
      const key = r.validationStatus.toLowerCase();
      if (key in counts) counts[key] += 1;
    }
  }
  let agentReviewed = 0;
  for (const r of rows) {
    const vr = parseJson(r.validationResult, {});
    if (vr?.agentProcessedAt) agentReviewed += 1;
  }

  const queue: Record<string, number> = {
    pending: 0,
    processing: 0,
    done: 0,
    failed: 0,
  };
  for (const r of queueRows) queue[r.status.toLowerCase()] = r._count.id;

  return c.json({
    ...counts,
    receipts_uploaded: uploaded,
    agent_reviewed: agentReviewed,
    pending: queue.pending,
    processing: queue.processing,
    done: queue.done,
    failed: queue.failed,
  });
});

export default agent;