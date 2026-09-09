import { randomUUID } from "node:crypto";
import { UnitOfWork } from "../../shared/unit-of-work";
import {
  InvoiceRepository,
  InvoiceSeriesRepository,
  StoreFiscalProfileRepository,
  FiscalSettingsRepository,
} from "../../shared/repositories/invoice.repository";
import { OrderRepository } from "../../shared/repositories/order.repository";
import { AgtClient, AgtCommunication } from "./agt.client";
import { buildInvoicePayload } from "./payload";
import { computeFiscalHash } from "./hash";
import { buildQrPayload } from "./qr";
import { toCents, roundCents, sumCents } from "./money";
import {
  MAX_SERIES_PER_ESTABLISHMENT,
  DEFAULT_SERIES_PREFIX,
  INVOICE_DOCUMENT_TYPES,
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

function agtStatusFor(comm: AgtCommunication): string {
  if (comm.accepted) return "ACCEPTED";
  if (comm.httpStatus) return "REJECTED";
  return "FAILED";
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

    const taxRate = taxRateForRegime(profile.vatRegime);
    const reasonExempt = exemptionReasonForRegime(profile.vatRegime);

    const lines = order.items.map((item: any, index: number) => {
      const quantity = item.quantity || 0;
      const unitCents = toCents(item.price || 0);
      const discount = 0;
      const subtotal = roundCents(quantity * unitCents - discount);
      const tax = roundCents((subtotal * taxRate) / 100);
      return {
        position: index + 1,
        productId: item.productId ?? null,
        productName: (item.product?.name as string) || "Artigo",
        productSku: item.productId ?? null,
        quantity,
        unitPrice: unitCents,
        discountAmount: discount,
        taxRate,
        taxAmount: tax,
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

      let series = await seriesRepo.findOpen(
        storeId,
        INVOICE_DOCUMENT_TYPE,
        year
      );
      if (!series) {
        const openCount = await seriesRepo.countForYear(storeId, year);
        if (openCount >= MAX_SERIES_PER_ESTABLISHMENT) {
          throw new BadRequestError(
            `Limite de ${MAX_SERIES_PER_ESTABLISHMENT} séries por estabelecimento/ano atingido`
          );
        }
        series = await seriesRepo.create({
          storeId,
          documentType: INVOICE_DOCUMENT_TYPE,
          prefix: DEFAULT_SERIES_PREFIX,
          year,
          status: "OPEN",
          nextNumber: 1,
        });
      }

      const number = series.nextNumber;
      await seriesRepo.allocateNumber(series.id, number);

      const fullNumber = `${series.prefix}/${year}/${number}`;
      const invoiceId = randomUUID();

      const hash = computeFiscalHash({
        emitterNif: profile.nif,
        fullNumber,
        issueDate: issueDateStr,
        totalCents: total,
        taxTotalCents: taxTotal,
        secret: settings.hashSecret,
      });

      const qrData = buildQrPayload({
        emitterNif: profile.nif,
        fullNumber,
        issueDate: issueDateStr,
        totalCents: total,
        hash,
      });

      const payload = buildInvoicePayload({
        settings,
        emitter: JSON.parse(emitterSnapshot),
        customer: JSON.parse(customerSnapshot),
        documentType: INVOICE_DOCUMENT_TYPE as any,
        fullNumber,
        series: series.prefix,
        number,
        issueDate: now,
        lines,
        subtotal,
        discountTotal,
        taxTotal,
        total,
        taxSummary,
        hash,
      });

      created = await invoiceRepo.create({
        id: invoiceId,
        storeId,
        orderId,
        seriesId: series.id,
        fiscalProfileId: profile.id,
        documentType: INVOICE_DOCUMENT_TYPE,
        number,
        fullNumber,
        status: "ACTIVE",
        issueDate: now,
        emitterSnapshot,
        customerSnapshot,
        currency: "AOA",
        subtotal,
        discountTotal,
        taxTotal,
        total,
        taxSummary: JSON.stringify(taxSummary),
        hash,
        qrData,
        agtStatus: "PENDING",
        agtReference: null,
        issuedByUserId: issuedByUserId ?? null,
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

    const communication = await this.agtClient.communicate(
      settings,
      {
        documentNumber: created.fullNumber,
        documentType: created.documentType,
        totalCents: created.total,
        hash: created.hash,
      },
      created.id
    );

    const agtStatus = agtStatusFor(communication);

    await this.uow.run(async (tx) => {
      const invoiceRepo = tx.repository(this.invoices);
      await invoiceRepo.update(created.id, {
        agtStatus,
        agtReference: communication.reference ?? null,
        agtResponse: communication.response,
      });
      await invoiceRepo.addCommunicationLog(created.id, {
        attempt: 1,
        status: agtStatus,
        httpStatus: communication.httpStatus ?? null,
        responsePayload: communication.response,
        error: communication.accepted ? null : communication.response,
      });
    });

    const final = await this.invoices.findByIdWithLines(created.id);
    return { invoice: final ?? created, created: true };
  }
}

export function isInvoiceDocumentType(value: string): boolean {
  return (INVOICE_DOCUMENT_TYPES as readonly string[]).includes(value);
}