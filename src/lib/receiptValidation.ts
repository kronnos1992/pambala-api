import { createWorker } from "tesseract.js";
import { join } from "path";
import { existsSync } from "fs";

const LANGDATA_DIR = join(process.cwd(), "langdata");

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function stripAccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function cleanNumber(s: string): string {
  return s.replace(/[^0-9]/g, "");
}

function searchToken(ocrText: string, needle: string): boolean {
  const n = normalize(needle);
  if (n.length < 2) return false;
  return normalize(ocrText).includes(n);
}

function matchReference(ocrText: string, reference: string): boolean {
  const clean = cleanNumber(reference);
  if (clean.length < 3) return true;
  const textDigits = cleanNumber(ocrText);
  return textDigits.includes(clean);
}

function matchAmount(ocrText: string, amount: number): boolean {
  const digits = cleanNumber(String(Math.round(amount)));
  if (!digits) return true;
  const textDigits = cleanNumber(ocrText);
  return textDigits.includes(digits) || existsNearAmount(textDigits, digits);
}

function existsNearAmount(textDigits: string, digits: string): boolean {
  const idx = textDigits.indexOf(digits);
  if (idx === -1) return false;
  const around = textDigits.slice(Math.max(0, idx - 3), idx + digits.length + 3);
  return around === digits || /k?z/.test(around);
}

export interface ValidationOutcome {
  status: "PASS" | "REVIEW" | "FAIL" | "ERROR";
  score: number;
  flags: string[];
  extracted: { text: string };
  matched: string[];
  missing: string[];
  reasons: string[];
}

interface CheckContext {
  amount: number;
  phone?: string;
  entity?: string;
  reference?: string;
  bankName?: string;
  ownerName?: string;
}

async function runOcr(filePath: string): Promise<string> {
  let worker: any = null;
  try {
    worker = await createWorker("por", 1, {
      langPath: LANGDATA_DIR,
      gzip: true,
      logger: () => {},
    });
    const { data } = await worker.recognize(filePath);
    return (data?.text as string) || "";
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch {}
    }
  }
}

const OCR_FAILURE_LIMIT = 200;

export async function validateReceipt(
  filePath: string,
  ctx: Partial<CheckContext> = {}
): Promise<ValidationOutcome> {
  const flags: string[] = [];
  const matched: string[] = [];
  const missing: string[] = [];
  const reasons: string[] = [];

  if (!existsSync(filePath)) {
    return {
      status: "ERROR",
      score: 0,
      flags: ["FILE_NOT_FOUND"],
      extracted: { text: "" },
      matched,
      missing: [],
      reasons: ["Ficheiro do comprovativo não encontrado no servidor."],
    };
  }

  let text = "";
  try {
    text = await runOcr(filePath);
  } catch (e: any) {
    return {
      status: "ERROR",
      score: 0,
      flags: ["OCR_FAILED"],
      extracted: { text: "" },
      matched,
      missing: [],
      reasons: ["Não foi possível processar a imagem do comprovativo. " + (e?.message || "")],
    };
  }

  const normalizedLength = normalize(text).length;
  if (normalizedLength < OCR_FAILURE_LIMIT) {
    flags.push("LOW_TEXT");
    reasons.push("Pouco texto detetado na imagem — pode ser imagem de baixa qualidade ou não ser um comprovativo real.");
  }

  let score = 50;

  if (ctx.amount) {
    if (matchAmount(text, ctx.amount)) {
      score += 20;
      matched.push("valor");
    } else {
      score -= 10;
      missing.push("valor_conferido");
      flags.push("AMOUNT_MISMATCH");
      reasons.push("Valor pedido não encontrado no comprovativo.");
    }
  }

  if (ctx.entity) {
    if (searchToken(text, ctx.entity)) {
      score += 12;
      matched.push("entidade");
    } else {
      missing.push("entidade");
    }
  }

  if (ctx.reference) {
    if (matchReference(text, ctx.reference)) {
      score += 12;
      matched.push("referencia");
    } else {
      missing.push("referencia");
      flags.push("REFERENCE_MISMATCH");
      reasons.push("Referência do pedido não encontrada na imagem.");
    }
  }

  if (ctx.bankName) {
    const bn = stripAccent(ctx.bankName).toLowerCase();
    const found = stripAccent(text).toLowerCase().includes(bn);
    if (found) {
      score += 6;
      matched.push("banco");
    }
  }

  if (ctx.ownerName && ctx.ownerName.length > 2) {
    const first = ctx.ownerName.split(" ")[0];
    if (first && searchToken(text, first)) {
      score += 4;
      matched.push("titular");
    }
  }

  let status: ValidationOutcome["status"] = "REVIEW";
  if (score >= 80) status = "PASS";
  else if (score <= 35) status = "FAIL";

  if (flags.length === 0 && status === "REVIEW" && score >= 60) {
    status = "PASS";
  }

  return {
    status,
    score: Math.max(0, Math.min(100, Math.round(score))),
    flags,
    extracted: { text },
    matched,
    missing,
    reasons,
  };
}
