import { randomUUID } from "node:crypto";
import { fromCents } from "./money";
import {
  IVA_TAX_CODE_BY_RATE,
  UNKNOWN_CUSTOMER_TAX_ID,
  DOMESTIC_COUNTRY,
  type InvoiceDocumentType,
} from "./constants";
import { signJws } from "./signing";

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
  customerCountry?: string;
}

export interface TaxBucket {
  rate: number;
  baseCents: number;
  taxCents: number;
}

export interface FiscalLineInput {
  position: number;
  productId?: string | null;
  productName: string;
  productSku?: string | null;
  operationType: string;
  quantity: number;
  unitOfMeasure: string;
  unitPrice: number; // cêntimos
  unitPriceBase: number; // cêntimos
  discountAmount: number;
  settlementAmount: number;
  taxRate: number;
  taxCode?: string | null;
  taxAmount: number; // cêntimos
  taxExemptionCode?: string | null;
  lineSubtotal: number; // debitAmount (cêntimos, sem imposto)
}

export function buildSoftwareInfoClaim(settings: any) {
  const claim = {
    productId: settings.productId || "Pambala",
    productVersion: settings.productVersion || "1.0.0",
    softwareValidationNumber: settings.softwareValidationNumber || "",
  };
  return signJws(claim, settings.signatureKeyPem || "");
}

export function buildSoftwareInfo(settings: any) {
  return {
    softwareInfoDetail: {
      productId: settings.productId || "Pambala",
      productVersion: settings.productVersion || "1.0.0",
      softwareValidationNumber: settings.softwareValidationNumber || "",
      signatureVersion: settings.signatureVersion ?? 1,
    },
    jwsSoftwareSignature: buildSoftwareInfoClaim(settings),
  };
}

// Claim assinado pela chave privada do CONTRIBUINTE (jwsDocumentSignature).
// Conforme a "Estrutura das Assinaturas Digitais (JWS)" — assina-se o OBJETO completo.
export function buildDocumentSignatureClaim(params: {
  documentNo: string;
  taxRegistrationNumber: string;
  documentType: string;
  documentDate: string; // YYYY-MM-DD
  customerTaxID: string;
  customerCountry: string;
  companyName: string;
  documentTotals: { taxPayable: number; netTotal: number; grossTotal: number };
}): Record<string, unknown> {
  return {
    documentNo: params.documentNo,
    taxRegistrationNumber: params.taxRegistrationNumber,
    documentType: params.documentType,
    documentDate: params.documentDate,
    customerTaxID: params.customerTaxID,
    customerCountry: params.customerCountry,
    companyName: params.companyName,
    documentTotals: params.documentTotals,
  };
}

function buildTax(
  taxRate: number,
  taxContributionCents: number,
  vatRegime: string,
  taxExemptionCode?: string | null,
  production: boolean = false
) {
  const taxExemptionRequired = Boolean(taxExemptionCode);
  if (taxRate === 0) {
    if (vatRegime === "EXCLUIDO") {
      // Operação não sujeita a IVA — taxType NS + código de isenção (anexo 6.4)
      if (production && !taxExemptionRequired) {
        throw new Error(
          "Perfil fiscal em regime EXCLUIDO exige vatExemptionCode (anexo 6.4 do DE 683/25)"
        );
      }
      return {
        taxType: "NS",
        taxCountryRegion: DOMESTIC_COUNTRY,
        taxPercentage: 0,
        taxContribution: fromCents(taxContributionCents),
        taxExemptionCode: taxExemptionCode || (production ? undefined : "DEV"),
      };
    }
    // ISENTO: IVA com taxCode ISE
    if (production && !taxExemptionRequired) {
      throw new Error(
        "Perfil fiscal em regime ISENTO exige vatExemptionCode (anexo 6.4 do DE 683/25)"
      );
    }
    return {
      taxType: "IVA",
      taxCountryRegion: DOMESTIC_COUNTRY,
      taxCode: "ISE",
      taxPercentage: 0,
      taxContribution: fromCents(taxContributionCents),
      taxExemptionCode: taxExemptionCode || (production ? undefined : "DEV"),
    };
  }
  return {
    taxType: "IVA",
    taxCountryRegion: DOMESTIC_COUNTRY,
    taxCode: IVA_TAX_CODE_BY_RATE[taxRate] ?? "OUT",
    taxPercentage: taxRate,
    taxContribution: fromCents(taxContributionCents),
  };
}

// Criação do payload de registo de uma factura electrónica (registarFactura).
export function buildRegistarFacturaPayload(params: {
  settings: any;
  emitter: EmitterSnapshot;
  customer: CustomerSnapshot;
  documentType: InvoiceDocumentType;
  documentNo: string;
  issueDate: string; // YYYY-MM-DD
  systemEntryDate: Date;
  lines: FiscalLineInput[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  taxSummary: TaxBucket[];
  signature: string;
  production: boolean;
}): any {
  const {
    settings,
    emitter,
    customer,
    documentType,
    documentNo,
    issueDate,
    systemEntryDate,
    lines,
    subtotal,
    discountTotal,
    taxTotal,
    total,
    signature,
    production,
  } = params;

  const customerTaxID = customer.nif || UNKNOWN_CUSTOMER_TAX_ID;
  const customerCountry = customer.customerCountry || DOMESTIC_COUNTRY;

  const payloadLines = lines.map((l) => ({
    lineNumber: l.position,
    operationType: l.operationType,
    productCode: l.productSku || l.productId || "ART",
    productDescription: l.productName,
    quantity: l.quantity,
    unitOfMeasure: l.unitOfMeasure,
    unitPriceBase: fromCents(l.unitPriceBase),
    unitPrice: fromCents(l.unitPrice),
    debitAmount: fromCents(l.lineSubtotal),
    taxes: [
      buildTax(
        l.taxRate,
        l.taxAmount,
        emitter.vatRegime,
        l.taxExemptionCode,
        production
      ),
    ],
    settlementAmount: fromCents(l.settlementAmount + l.discountAmount),
  }));

  return {
    schemaVersion: settings.schemaVersion || "2.0",
    submissionUUID: randomUUID(),
    taxRegistrationNumber: emitter.nif,
    submissionTimeStamp: new Date().toISOString(),
    softwareInfo: buildSoftwareInfo(settings),
    numberOfEntries: 1,
    documents: [
      {
        documentNo,
        documentStatus: "N",
        jwsDocumentSignature: signature,
        documentDate: issueDate,
        documentType,
        systemEntryDate: systemEntryDate.toISOString(),
        customerCountry,
        customerTaxID,
        companyName: emitter.legalName,
        lines: payloadLines,
        documentTotals: {
          taxPayable: fromCents(taxTotal),
          netTotal: fromCents(subtotal),
          grossTotal: fromCents(total),
        },
        withholdingTaxList: [],
      },
    ],
  };
}