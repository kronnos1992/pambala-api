import { randomUUID } from "node:crypto";
import { UnitOfWork } from "../../shared/unit-of-work";
import {
  InvoiceRepository,
  InvoiceSeriesRepository,
  StoreFiscalProfileRepository,
  FiscalSettingsRepository,
} from "../../shared/repositories/invoice.repository";
import { OrderRepository } from "../../shared/repositories/order.repository";
import { AgtClient } from "./agt.client";
import {
  buildRegistarFacturaPayload,
  buildDocumentSignatureClaim,
} from "./payload";
import { buildDocumentNo } from "./constants";
import { buildAgtQrUrl } from "./qr";
import { signJws, generateRsaKeyPair } from "./signing";
import { toCents, roundCents, roundUpCents, sumCents } from "./money";
import {
  MAX_SERIES_PER_ESTABLISHMENT,
  INVOICE_DOCUMENT_TYPES,
  IVA_TAX_CODE_BY_RATE,
  UNKNOWN_CUSTOMER_TAX_ID,
  DOMESTIC_COUNTRY,
  type InvoiceDocumentType,
} from "./constants";
import { BadRequestError, NotFoundError, InternalError } from "../../shared/errors";

export const INVOICE_DOCUMENT_TYPE = "FT";

function taxRateForRegime(regime: string): number {
  switch (regime) {
    case "SIMPLIFICADO":
      return 7;
    case "EXCLUIDO":
    case "ISENTO":
      return 0;
    case "GERAL":
    default:
      return 14;
  }
}

function exemptionReasonForRegime(regime: string): string | null {
  switch (regime) {
    case "EXCLUIDO":
      return "Operação não sujeita a IVA (regime de exclusão)";
    case "ISENTO":
      return "Operação isenta de IVA";
    default:
      return null;
  }
}

function formatLocalDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function ensureSoftwareKey(settings: any, repo: FiscalSettingsRepository) {
  if (!settings.signatureKeyPem) {
    const pair = generateRsaKeyPair();
    await repo.upsert({ signatureKeyPem: pair.privateKeyPem });
    settings.signatureKeyPem = pair.privateKeyPem;
  }
  return settings;
}

async function ensureIssuerKey(profile: any, repo: StoreFiscalProfileRepository) {
  if (!profile.signatureKeyPem) {
    const pair = generateRsaKeyPair();
    const updated = await repo.upsert(profile.storeId, {
      signatureKeyPem: pair.privateKeyPem,
    });
    profile.signatureKeyPem = updated.signatureKeyPem || pair.privateKeyPem;
  }
  return profile;
}

function agtStatusForCommunication(communication: { submitted: boolean; offline: boolean }): string {
  if (!communication.submitted) return "REJECTED";
  return communication.offline ? "VALID" : "SUBMITTED";
}

export class InvoiceEmitter {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly invoices: InvoiceRepository,
    private readonly series: InvoiceSeriesRepository,
    private readonly profiles: StoreFiscalProfileRepository,
    private readonly settings: FiscalSettingsRepository,
    private readonly orders: OrderRepository,
    private readonly agtClient: AgtClient
  ) {}

  async emitForOrder(
    orderId: string,
    issuedByUserId?: string | null
  ): Promise<{ invoice: any; created: boolean }> {
    const duplicate = await this.invoices.findByOrderAndType(
      orderId,
      INVOICE_DOCUMENT_TYPE
    );
    if (duplicate) return { invoice: duplicate, created: false };

    const order = await this.orders.findByIdentifierWithDetails(orderId);

    if (!order || !order.id) {
      throw new NotFoundError("Pedido não encontrado");
    }

    if (!order.items || order.items.length === 0) {
      throw new BadRequestError("Pedido sem itens: impossível emitir factura");
    }

    const storeId = order.items[0].storeId;

    const profile = await this.profiles.findByStoreId(storeId);
    if (!profile || !profile.isActive) {
      throw new BadRequestError(
        "Perfil fiscal da loja não configurado ou inactivo"
      );
    }

    const settings = await this.settings.getOrCreate();
    const now = new Date();
    const year = now.getFullYear();
    const timezone = settings.timezone || "Africa/Luanda";
    const issueDateStr = formatLocalDate(now, timezone);

    // Garantir chaves de assinatura (software/produtor + contribuinte/loja).
    await ensureSoftwareKey(settings, this.settings);
    const issuerKey = await this.ensureIssuerKeyFromProfile(profile);

    const taxRate = taxRateForRegime(profile.vatRegime);
    const reasonExempt = exemptionReasonForRegime(profile.vatRegime);

    const lines = order.items.map((item: any, index: number) => {
      const quantity = item.quantity || 0;
      const unitCents = toCents(item.price || 0);
      const discount = 0;
      const subtotal = roundCents(quantity * unitCents - discount);
      const tax = roundUpCents((subtotal * taxRate) / 100);
      return {
        position: index + 1,
        productId: item.productId ?? null,
        productName: (item.product?.name as string) || "Artigo",
        productSku: item.productId ?? null,
        operationType: "TB",
        quantity,
        unitOfMeasure: "UN",
        unitPrice: unitCents,
        unitPriceBase: unitCents,
        discountAmount: discount,
        settlementAmount: 0,
        taxRate,
        taxCode:
          taxRate === 0 ? null : IVA_TAX_CODE_BY_RATE[taxRate] ?? "OUT",
        taxAmount: tax,
        taxExemptionCode:
          taxRate === 0 ? profile.vatExemptionCode || null : null,
        lineSubtotal: subtotal,
        lineTotal: subtotal + tax,
        reasonExempt: taxRate === 0 ? reasonExempt : null,
      };
    });

    const subtotal = sumCents(lines.map((l) => l.lineSubtotal));
    const discountTotal = sumCents(lines.map((l) => l.discountAmount));
    const taxTotal = sumCents(lines.map((l) => l.taxAmount));
    const total = subtotal - discountTotal + taxTotal;

    const taxAccumulator = new Map<number, { base: number; tax: number }>();
    for (const line of lines) {
      const bucket = taxAccumulator.get(line.taxRate) || { base: 0, tax: 0 };
      bucket.base += line.lineSubtotal;
      bucket.tax += line.taxAmount;
      taxAccumulator.set(line.taxRate, bucket);
    }
    const taxSummary = Array.from(taxAccumulator.entries()).map(
      ([rate, b]) => ({ rate, baseCents: b.base, taxCents: b.tax })
    );

    const customerName =
      (order.user?.name as string) || (order.shippingName as string);
    const customerAddress = [
      order.shippingAddress,
      order.shippingProvince,
      order.shippingDistrict || null,
    ]
      .filter(Boolean)
      .join(", ");

    const emitterSnapshot = JSON.stringify({
      nif: profile.nif,
      legalName: profile.legalName,
      address: profile.address,
      province: profile.province,
      district: profile.district || null,
      vatRegime: profile.vatRegime,
    });

    const customerSnapshot = JSON.stringify({
      name: customerName,
      nif: null,
      address: customerAddress || null,
    });

    // ---------- Série (solicitarSerie) fora da transação ----------
    let series = await this.series.findOpen(storeId, INVOICE_DOCUMENT_TYPE, year);
    if (!series) {
      const openCount = await this.series.countForYear(storeId, year);
      if (openCount >= MAX_SERIES_PER_ESTABLISHMENT) {
        throw new BadRequestError(
          `Limite de ${MAX_SERIES_PER_ESTABLISHMENT} séries por estabelecimento/ano atingido`
        );
      }
      series = await this.requestOrCreateSeries(
        settings,
        profile,
        year,
        issuerKey
      );
    }
    if (!series.agtSeriesCode) {
      throw new InternalError("Série sem código AGT: impossível emitir factura");
    }
    const seriesId = series.id;
    const agtSeriesCode = series.agtSeriesCode;
    const nextNumber = series.nextNumber;
    const maxDocumentNumber = series.lastDocumentNo
      ? parseInt(String(series.lastDocumentNo), 10)
      : Infinity;

    let created: any = null;
    let isNew = false;

    await this.uow.run(async (tx) => {
      const invoiceRepo = tx.repository(this.invoices);
      const seriesRepo = tx.repository(this.series);

      const inTxDuplicate = await invoiceRepo.findByOrderAndType(
        orderId,
        INVOICE_DOCUMENT_TYPE
      );
      if (inTxDuplicate) {
        created = inTxDuplicate;
        return;
      }
      isNew = true;

      const allocatedNumber = nextNumber;
      if (allocatedNumber > maxDocumentNumber) {
        throw new BadRequestError(
          `Série ${agtSeriesCode} esgotada (limite ${series.lastDocumentNo}) — solicite extensão`
        );
      }
      await seriesRepo.allocateNumber(seriesId, allocatedNumber);

      const documentNo = buildDocumentNo(
        INVOICE_DOCUMENT_TYPE,
        agtSeriesCode,
        allocatedNumber
      );

      const customerTaxId = UNKNOWN_CUSTOMER_TAX_ID;
      const customerCountry = DOMESTIC_COUNTRY;

      const signature = signJws(
        buildDocumentSignatureClaim({
          documentNo,
          taxRegistrationNumber: profile.nif,
          documentType: INVOICE_DOCUMENT_TYPE,
          documentDate: issueDateStr,
          customerTaxID: customerTaxId,
          customerCountry,
          companyName: profile.legalName,
          documentTotals: {
            taxPayable: fromCentsForSignature(taxTotal),
            netTotal: fromCentsForSignature(subtotal),
            grossTotal: fromCentsForSignature(total),
          },
        }),
        issuerKey
      );

      const qrUrl = buildAgtQrUrl(profile.nif, documentNo);

      const payload = buildRegistarFacturaPayload({
        settings,
        emitter: JSON.parse(emitterSnapshot),
        customer: JSON.parse(customerSnapshot),
        documentType: INVOICE_DOCUMENT_TYPE as InvoiceDocumentType,
        documentNo,
        issueDate: issueDateStr,
        systemEntryDate: now,
        lines,
        subtotal,
        discountTotal,
        taxTotal,
        total,
        taxSummary,
        signature,
        production: this.agtClient.isConfigured(settings),
      });

      const invoiceId = randomUUID();

      created = await invoiceRepo.create({
        id: invoiceId,
        storeId,
        orderId,
        seriesId,
        fiscalProfileId: profile.id,
        documentType: INVOICE_DOCUMENT_TYPE,
        number: allocatedNumber,
        documentNo,
        status: "ACTIVE",
        issueDate: now,
        systemEntryDate: now,
        emitterSnapshot,
        customerSnapshot,
        customerTaxId,
        customerCountry,
        currency: "AOA",
        subtotal,
        discountTotal,
        taxTotal,
        total,
        taxSummary: JSON.stringify(taxSummary),
        signature,
        qrUrl,
        agtStatus: "PENDING",
        lines: { create: lines },
        syncLogs: {
          create: [
            {
              attempt: 1,
              status: "PENDING",
              requestPayload: JSON.stringify(payload),
            },
          ],
        },
      });
    });

    if (created === null) {
      throw new InternalError("Não foi possível registar a factura");
    }

    if (!isNew) {
      return { invoice: created, created: false };
    }

    // ---------- Comunicação com a AGT (fora da transação) ----------
    const payload = buildRegistarFacturaPayload({
      settings,
      emitter: JSON.parse(emitterSnapshot),
      customer: JSON.parse(customerSnapshot),
      documentType: INVOICE_DOCUMENT_TYPE as InvoiceDocumentType,
      documentNo: created.documentNo,
      issueDate: issueDateStr,
      systemEntryDate: new Date(created.systemEntryDate),
      lines,
      subtotal,
      discountTotal,
      taxTotal,
      total,
      taxSummary,
      signature: created.signature,
      production: this.agtClient.isConfigured(settings),
    });

    const communication = await this.agtClient.registerInvoice(settings, payload);
    const agtStatus = agtStatusForCommunication(communication);

    await this.uow.run(async (tx) => {
      const invoiceRepo = tx.repository(this.invoices);
      await invoiceRepo.update(created.id, {
        agtStatus,
        agtRequestId: communication.requestId ?? null,
        agtReference: communication.offline
          ? "dev-offline"
          : communication.requestId ?? null,
        agtResponse: communication.response,
        agtValidatedAt: communication.offline ? new Date() : null,
      });
      await invoiceRepo.addCommunicationLog(created.id, {
        attempt: 1,
        status: agtStatus,
        httpStatus: communication.httpStatus ?? null,
        responsePayload: communication.response,
        error: communication.submitted ? null : communication.response,
      });
    });

    const final = await this.invoices.findByIdWithLines(created.id);
    return { invoice: final ?? created, created: true };
  }

  private async ensureIssuerKeyFromProfile(profile: any): Promise<string> {
    if (profile.signatureKeyPem) return profile.signatureKeyPem;
    const pair = generateRsaKeyPair();
    const updated = await this.profiles.update(profile.storeId, {
      signatureKeyPem: pair.privateKeyPem,
    });
    return updated.signatureKeyPem || pair.privateKeyPem;
  }

  private async requestOrCreateSeries(
    settings: any,
    profile: any,
    year: number,
    issuerKey: string
  ) {
    const result = await this.agtClient.requestSeries(settings, {
      taxRegistrationNumber: profile.nif,
      seriesYear: year,
      documentType: INVOICE_DOCUMENT_TYPE,
      establishmentNumber: profile.establishmentNumber || "SEDE",
      seriesContingencyIndicator: "N",
      issuerPrivateKeyPem: issuerKey,
    });

    if (!result.seriesCode) {
      throw new InternalError(
        `Não foi possível obter série junto da AGT: ${
          result.errorList?.map((e) => `${e.idError} ${e.descriptionError}`).join("; ") ||
          result.response
        }`
      );
    }

    return this.series.create({
      storeId: profile.storeId,
      documentType: INVOICE_DOCUMENT_TYPE,
      agtSeriesCode: result.seriesCode,
      establishmentNumber: profile.establishmentNumber || "SEDE",
      year,
      status: "OPEN",
      nextNumber: 1,
      lastNumberUsed: null,
      authorizedQuantity: result.authorizedQuantity ?? null,
      firstDocumentNo: result.firstDocumentNo ?? null,
      lastDocumentNo: result.lastDocumentNo ?? null,
    });
  }
}

// Converte cêntimos em unidades com 2 casas decimais para a assinatura JWS.
function fromCentsForSignature(cents: number): number {
  return (cents || 0) / 100;
}

export function isInvoiceDocumentType(value: string): boolean {
  return (INVOICE_DOCUMENT_TYPES as readonly string[]).includes(value);
}