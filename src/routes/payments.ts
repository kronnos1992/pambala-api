import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../lib/auth";
import {
  createCharge,
  getChargeStatus,
  verifyWebhookSignature,
  isAppyPayConfigured,
  APPYPAY_METHODS,
} from "../lib/appypay";

const payments = new Hono();

payments.post("/appypay/create", authMiddleware, async (c) => {
  const userId = (c as any).get("userId") as string;

  if (!isAppyPayConfigured()) {
    return c.json(
      { error: "Pagamento AppyPay nao configurado no servidor" },
      503
    );
  }

  const body = await c.req.json();
  const { orderId, phoneNumber } = body;

  if (!orderId) {
    return c.json({ error: "orderId e obrigatorio" }, 400);
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: { select: { name: true } },
        },
      },
    },
  });

  if (!order) {
    return c.json({ error: "Pedido nao encontrado" }, 404);
  }

  if (order.userId !== userId) {
    return c.json({ error: "Nao autorizado" }, 403);
  }

  if (order.paymentStatus !== "PENDING") {
    return c.json({ error: "Pedido ja foi pago ou processado" }, 400);
  }

  const isGpo =
    order.paymentMethod === "APPY_PAY_GPO";

  if (isGpo && !phoneNumber) {
    return c.json(
      { error: "Telefone e obrigatorio para pagamento Multicaixa Express" },
      400
    );
  }

  const productNames = order.items
    .map((i) => i.product.name)
    .join(", ");
  const description =
    productNames.length > 60
      ? productNames.substring(0, 57) + "..."
      : productNames;

  const paymentMethodId = isGpo
    ? APPYPAY_METHODS.GPO_EXPRESS
    : APPYPAY_METHODS.REFERENCE;

  try {
    const charge = await createCharge({
      amount: order.total,
      currency: "AOA",
      description: `Pambala #${order.orderNumber} - ${description}`,
      merchantTransactionId: order.orderNumber,
      phoneNumber: isGpo ? phoneNumber : undefined,
      paymentMethodId: paymentMethodId || undefined,
      notify: {
        name: order.shippingName,
        telephone: order.shippingPhone,
        email: undefined,
        smsNotification: true,
        emailNotification: false,
      },
      callbackUrl: `${process.env.APPYPAY_CALLBACK_URL || ""}`,
      returnUrl: `${process.env.APP_RETURN_URL || "http://localhost:3000"}/pedidos/${order.orderNumber}`,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentRef: charge.chargeId,
        paymentStatus: "PROCESSING",
      },
    });

    return c.json({
      chargeId: charge.chargeId,
      status: charge.status,
      referenceNumber: charge.referenceNumber,
      ussdCode: charge.ussdCode,
      amount: order.total,
      currency: "AOA",
      expiresAt: charge.expiresAt,
      orderNumber: order.orderNumber,
    });
  } catch (err: any) {
    console.error("AppyPay create charge error:", err);
    return c.json(
      { error: err.message || "Erro ao criar cobranca AppyPay" },
      500
    );
  }
});

payments.get("/appypay/status/:orderNumber", authMiddleware, async (c) => {
  const userId = (c as any).get("userId") as string;
  const orderNumber = c.req.param("orderNumber");

  const order = await prisma.order.findUnique({
    where: { orderNumber },
  });

  if (!order) {
    return c.json({ error: "Pedido nao encontrado" }, 404);
  }

  if (order.userId !== userId) {
    return c.json({ error: "Nao autorizado" }, 403);
  }

  if (!order.paymentRef) {
    return c.json({
      paymentStatus: order.paymentStatus,
      chargeId: null,
    });
  }

  try {
    const charge = await getChargeStatus(order.paymentRef);

    let newPaymentStatus = order.paymentStatus;
    if (charge.status === "Paid" || charge.status === "COMPLETED") {
      newPaymentStatus = "CONFIRMED";
    } else if (
      charge.status === "Failed" ||
      charge.status === "FAILED" ||
      charge.status === "Canceled" ||
      charge.status === "CANCELLED"
    ) {
      newPaymentStatus = "FAILED";
    } else if (charge.status === "Expired") {
      newPaymentStatus = "EXPIRED";
    }

    if (newPaymentStatus !== order.paymentStatus) {
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: newPaymentStatus },
      });
    }

    return c.json({
      paymentStatus: newPaymentStatus,
      chargeStatus: charge.status,
      referenceNumber: charge.referenceNumber,
      ussdCode: charge.ussdCode,
    });
  } catch (err: any) {
    console.error("AppyPay status check error:", err);
    return c.json({
      paymentStatus: order.paymentStatus,
      chargeId: order.paymentRef,
      error: "Erro ao verificar estado do pagamento",
    });
  }
});

payments.post("/appypay/webhook", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("X-Appypay-Signature") || "";

  if (APPYPAY_WEBHOOK_SECRET && !verifyWebhookSignature(rawBody, signature)) {
    console.warn("AppyPay webhook signature verification failed");
    return c.json({ error: "Invalid signature" }, 401);
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const eventType = body.eventType || body.type || "";
  const data = body.data || body;

  console.log("AppyPay webhook received:", eventType, data);

  const merchantTransactionId =
    data.merchantTransactionId || data.orderNumber || "";
  const chargeId = data.chargeId || data.id || "";

  if (!merchantTransactionId && !chargeId) {
    return c.json({ status: "ignored" });
  }

  let order = null;
  if (merchantTransactionId) {
    order = await prisma.order.findUnique({
      where: { orderNumber: merchantTransactionId },
    });
  }

  if (!order && chargeId) {
    order = await prisma.order.findFirst({
      where: { paymentRef: chargeId },
    });
  }

  if (!order) {
    console.warn("AppyPay webhook: order not found for", merchantTransactionId, chargeId);
    return c.json({ status: "order_not_found" });
  }

  let newPaymentStatus = order.paymentStatus;
  const statusLower = (data.status || eventType || "").toLowerCase();

  if (
    statusLower.includes("paid") ||
    statusLower.includes("completed") ||
    statusLower.includes("charge.completed")
  ) {
    newPaymentStatus = "CONFIRMED";
  } else if (
    statusLower.includes("failed") ||
    statusLower.includes("charge.failed")
  ) {
    newPaymentStatus = "FAILED";
  } else if (
    statusLower.includes("canceled") ||
    statusLower.includes("cancelled") ||
    statusLower.includes("charge.canceled")
  ) {
    newPaymentStatus = "CANCELLED";
  } else if (
    statusLower.includes("expired") ||
    statusLower.includes("charge.expired")
  ) {
    newPaymentStatus = "EXPIRED";
  }

  if (newPaymentStatus !== order.paymentStatus) {
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: newPaymentStatus },
    });

    if (newPaymentStatus === "CONFIRMED") {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "CONFIRMED" },
      });
    }
  }

  return c.json({ status: "ok" });
});

export default payments;
