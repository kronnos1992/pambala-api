export interface FiscalQrInput {
  emitterNif: string;
  fullNumber: string;
  issueDate: string;
  totalCents: number;
  hash: string;
}

export function buildQrPayload(input: FiscalQrInput): string {
  return [
    "PAMBALA",
    input.emitterNif,
    input.fullNumber,
    input.issueDate,
    input.totalCents,
    input.hash,
  ].join("|");
}