import crypto from "crypto";

const APPYPAY_BASE_URL =
  process.env.APPYPAY_BASE_URL || "https://gwy-api.appypay.co.ao/v2.0";
const APPYPAY_TOKEN_URL =
  process.env.APPYPAY_TOKEN_URL || "https://auth.appypay.co.ao/connect/token";
const APPYPAY_CLIENT_ID = process.env.APPYPAY_CLIENT_ID || "";
const APPYPAY_CLIENT_SECRET = process.env.APPYPAY_CLIENT_SECRET || "";
const APPYPAY_MERCHANT_ID = process.env.APPYPAY_MERCHANT_ID || "";
const APPYPAY_WEBHOOK_SECRET = process.env.APPYPAY_WEBHOOK_SECRET || "";
const APPYPAY_RESOURCE = process.env.APPYPAY_RESOURCE || "";
const APPYPAY_PAYMENT_METHOD_GPO_EXPRESS =
  process.env.APPYPAY_PAYMENT_METHOD_GPO_EXPRESS || "";
const APPYPAY_PAYMENT_METHOD_REFERENCE =
  process.env.APPYPAY_PAYMENT_METHOD_REFERENCE || "";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: APPYPAY_CLIENT_ID,
    client_secret: APPYPAY_CLIENT_SECRET,
    resource: APPYPAY_RESOURCE,
  });

  const res = await fetch(APPYPAY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AppyPay auth failed (${res.status}): ${text}`);
  }

  const data: any = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken!;
}

async function appypayApiCall(
  method: string,
  path: string,
  body?: any
): Promise<any> {
  const token = await getAccessToken();
  const url = `${APPYPAY_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    console.error(`AppyPay API error: ${method} ${path} -> ${res.status}`, data);
    throw new Error(
      data?.message || data?.error || `AppyPay API error (${res.status})`
    );
  }

  return data;
}

export interface CreateChargeInput {
  amount: number;
  currency: string;
  description: string;
  merchantTransactionId: string;
  phoneNumber?: string;
  paymentMethodId?: string;
  notify?: {
    name?: string;
    telephone?: string;
    email?: string;
    smsNotification?: boolean;
    emailNotification?: boolean;
  };
  callbackUrl?: string;
  returnUrl?: string;
}

export interface ChargeResponse {
  chargeId: string;
  status: string;
  amount: number;
  currency: string;
  referenceNumber?: string;
  ussdCode?: string;
  createdAt: string;
  expiresAt?: string;
  raw: any;
}

export async function createCharge(
  input: CreateChargeInput
): Promise<ChargeResponse> {
  const amountSentimos = Math.round(input.amount * 100);

  const payload: any = {
    amount: amountSentimos,
    currency: input.currency || "AOA",
    merchantTransactionId: input.merchantTransactionId,
    description: input.description,
  };

  if (input.paymentMethodId) {
    payload.paymentMethodId = input.paymentMethodId;
  }

  if (input.phoneNumber) {
    payload.phoneNumber = input.phoneNumber.replace(/\s/g, "");
  }

  if (input.notify) {
    payload.notify = input.notify;
  }

  if (input.callbackUrl) {
    payload.callbackUrl = input.callbackUrl;
  }
  if (input.returnUrl) {
    payload.returnUrl = input.returnUrl;
  }

  const data = await appypayApiCall("POST", "/charges", payload);

  const ref = data.reference;
  return {
    chargeId: data.chargeId || data.id || "",
    status: data.responseStatus?.status || data.status || "Pending",
    amount: amountSentimos,
    currency: payload.currency,
    referenceNumber: ref?.referenceNumber,
    ussdCode: ref?.ussdCode,
    createdAt: data.creationDate || new Date().toISOString(),
    expiresAt: data.expirationDate,
    raw: data,
  };
}

export async function getChargeStatus(
  chargeId: string
): Promise<ChargeResponse> {
  const data = await appypayApiCall("GET", `/charges/${chargeId}`);
  const ref = data.reference;
  return {
    chargeId: data.chargeId || data.id || chargeId,
    status: data.responseStatus?.status || data.status || "Unknown",
    amount: data.amount || 0,
    currency: data.currency || "AOA",
    referenceNumber: ref?.referenceNumber,
    ussdCode: ref?.ussdCode,
    createdAt: data.creationDate || "",
    expiresAt: data.expirationDate,
    raw: data,
  };
}

export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  if (!APPYPAY_WEBHOOK_SECRET) {
    console.warn("APPYPAY_WEBHOOK_SECRET not set - skipping verification");
    return true;
  }

  const expected = crypto
    .createHmac("sha256", APPYPAY_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");

  return expected === signature;
}

export const APPYPAY_METHODS = {
  GPO_EXPRESS: APPYPAY_PAYMENT_METHOD_GPO_EXPRESS,
  REFERENCE: APPYPAY_PAYMENT_METHOD_REFERENCE,
};

export function isAppyPayConfigured(): boolean {
  return !!(APPYPAY_CLIENT_ID && APPYPAY_CLIENT_SECRET && APPYPAY_MERCHANT_ID);
}
