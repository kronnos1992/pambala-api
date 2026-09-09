import { BaseRepository } from "./base.repository";

export class InvoiceRepository extends BaseRepository {
  findByOrderAndType(orderId: string, documentType: string) {
    return this.client.invoice.findFirst({ where: { orderId, documentType } });
  }

  findById(id: string) {
    return this.client.invoice.findUnique({ where: { id } });
  }

  findByIdWithLines(id: string) {
    return this.client.invoice.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { position: "asc" } },
        series: true,
      },
    });
  }

  findByOrder(orderId: string) {
    return this.client.invoice.findMany({
      where: { orderId },
      include: { lines: { orderBy: { position: "asc" } } },
      orderBy: { issueDate: "asc" },
    });
  }

  findForStore(storeId: string, skip: number, limit: number) {
    return this.client.invoice.findMany({
      where: { storeId },
      skip,
      take: limit,
      orderBy: { issueDate: "desc" },
      include: { lines: { orderBy: { position: "asc" } } },
    });
  }

  countForStore(storeId: string) {
    return this.client.invoice.count({ where: { storeId } });
  }

  create(data: any) {
    return this.client.invoice.create({
      data,
      include: { lines: { orderBy: { position: "asc" } } },
    });
  }

  update(id: string, data: any) {
    return this.client.invoice.update({ where: { id }, data });
  }

  addCommunicationLog(invoiceId: string, data: any) {
    return this.client.invoiceCommunicationLog.create({
      data: { invoiceId, ...data },
    });
  }

  findByAgtStatus(statuses: string[]) {
    return this.client.invoice.findMany({
      where: { agtStatus: { in: statuses } },
      include: { lines: true },
    });
  }
}

export class InvoiceSeriesRepository extends BaseRepository {
  findOpen(storeId: string, documentType: string, year: number) {
    return this.client.invoiceSeries.findFirst({
      where: { storeId, documentType, year, status: "OPEN" },
    });
  }

  findById(id: string) {
    return this.client.invoiceSeries.findUnique({ where: { id } });
  }

  findForStore(storeId: string) {
    return this.client.invoiceSeries.findMany({
      where: { storeId },
      orderBy: [{ year: "desc" }, { documentType: "asc" }],
    });
  }

  countForYear(storeId: string, year: number) {
    return this.client.invoiceSeries.count({ where: { storeId, year } });
  }

  create(data: any) {
    return this.client.invoiceSeries.create({ data });
  }

  allocateNumber(id: string, usedNumber: number) {
    return this.client.invoiceSeries.update({
      where: { id },
      data: {
        nextNumber: { increment: 1 },
        lastNumberUsed: usedNumber,
      },
    });
  }

  setStatus(id: string, status: string) {
    return this.client.invoiceSeries.update({
      where: { id },
      data: { status },
    });
  }
}

export class StoreFiscalProfileRepository extends BaseRepository {
  findByStoreId(storeId: string) {
    return this.client.storeFiscalProfile.findUnique({ where: { storeId } });
  }

  findByStoreIdWithStore(storeId: string) {
    return this.client.storeFiscalProfile.findUnique({
      where: { storeId },
      include: { store: { select: { id: true, name: true, slug: true } } },
    });
  }

  upsert(storeId: string, data: any) {
    return this.client.storeFiscalProfile.upsert({
      where: { storeId },
      update: data,
      create: { storeId, ...data },
    });
  }

  update(storeId: string, data: any) {
    return this.client.storeFiscalProfile.update({
      where: { storeId },
      data,
    });
  }

  setActive(storeId: string, isActive: boolean) {
    return this.client.storeFiscalProfile.update({
      where: { storeId },
      data: { isActive },
    });
  }
}

export class FiscalSettingsRepository extends BaseRepository {
  async getOrCreate() {
    const existing = await this.client.fiscalSettings.findUnique({
      where: { id: "global" },
    });
    if (existing) return existing;
    return this.client.fiscalSettings.create({ data: {} });
  }

  get() {
    return this.client.fiscalSettings.findUnique({ where: { id: "global" } });
  }

  upsert(data: any) {
    return this.client.fiscalSettings.upsert({
      where: { id: "global" },
      update: data,
      create: { ...data },
    });
  }
}