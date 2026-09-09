import { fromCents } from "./money";
import type { InvoiceDocumentType } from "./constants";

export interface EmitterSnapshot {
  nif: string;
  legalName: string;
  address: string;
  province?: string;
  district?: string;
  vatRegime: string;
}

export interface CustomerSnapshot {
  name: string;
  nif?: string | null;
  address?: string | null;
}

export interface TaxBucket {
  rate: number;
  baseCents: number;
  taxCents: number;
}

export function buildInvoicePayload(params: {
  settings: any;
  emitter: EmitterSnapshot;
  customer: CustomerSnapshot;
  documentType: InvoiceDocumentType;
  fullNumber: string;
  series: string;
  number: number;
  issueDate: Date;
  lines: any[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  taxSummary: TaxBucket[];
  hash: string;
}) {
  const {
    settings,
    emitter,
    customer,
    documentType,
    fullNumber,
    series,
    number,
    issueDate,
    lines,
    subtotal,
    discountTotal,
    taxTotal,
    total,
    taxSummary,
    hash,
  } = params;

  return {
    ATCUD: hash,
    Hash: hash,
    Customer: {
      Name: customer.name,
      TaxID: customer.nif || null,
      Address: customer.address || null,
    },
    DocumentNumber: fullNumber,
    DocumentType: documentType,
    IssueDate: issueDate.toISOString(),
    Line: lines.map((l) => ({
      LineNumber: l.position,
      ProductCode: l.productSku || l.productId || null,
      ProductDescription: l.productName,
      Quantity: l.quantity,
      UnitPrice: fromCents(l.unitPrice),
      DiscountAmount: fromCents(l.discountAmount),
      TaxRate: l.taxRate,
      TaxAmount: fromCents(l.taxAmount),
      NetAmount: fromCents(l.lineSubtotal),
      GrossAmount: fromCents(l.lineTotal),
      TaxExemptionReason: l.reasonExempt || null,
    })),
    Number: number,
    Series: series,
    Software: {
      CertificationNumber: settings.certificationNumber || null,
      Name: settings.softwareName,
      Version: settings.softwareVersion,
    },
    TaxPayable: fromCents(taxTotal),
    TaxSummary: taxSummary.map((t) => ({
      TaxRate: t.rate,
      TaxableBasis: fromCents(t.baseCents),
      TaxAmount: fromCents(t.taxCents),
    })),
    Taxpayer: {
      Name: emitter.legalName,
      TaxID: emitter.nif,
      Address: emitter.address,
      VatRegime: emitter.vatRegime,
    },
    TotalDiscount: fromCents(discountTotal),
    TotalGross: fromCents(total),
    TotalNet: fromCents(subtotal),
  };
}