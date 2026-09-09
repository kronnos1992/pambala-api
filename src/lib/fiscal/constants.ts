export const VAT_REGIMES = [
  "GERAL",
  "SIMPLIFICADO",
  "EXCLUIDO",
  "ISENTO",
] as const;

export const INVOICE_DOCUMENT_TYPES = ["FT", "NC", "ND"] as const;

export const INVOICE_STATUSES = ["ACTIVE", "VOID"] as const;

export const SERIES_STATUSES = ["OPEN", "CLOSED", "CANCELLED"] as const;

export const AGT_STATUSES = [
  "PENDING",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "FAILED",
] as const;

export const VALID_TAX_RATES = [0, 5, 7, 14] as const;

export const MAX_SERIES_PER_ESTABLISHMENT = 50;

export const DEFAULT_SERIES_PREFIX = "A";

export const FISCAL_SETTINGS_ID = "global";

export type VatRegime = (typeof VAT_REGIMES)[number];
export type InvoiceDocumentType = (typeof INVOICE_DOCUMENT_TYPES)[number];