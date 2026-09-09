import { createHash } from "node:crypto";

export interface FiscalHashInput {
  emitterNif: string;
  fullNumber: string;
  issueDate: string;
  totalCents: number;
  taxTotalCents: number;
  secret: string;
}

export function computeFiscalHash(input: FiscalHashInput): string {
  const payload = [
    input.emitterNif,
    input.fullNumber,
    input.issueDate,
    input.totalCents,
    input.taxTotalCents,
    input.secret,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").toUpperCase();
}

export function verifyFiscalHash(input: FiscalHashInput, hash: string): boolean {
  return computeFiscalHash(input) === hash;
}