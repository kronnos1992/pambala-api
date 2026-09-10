import {
  ICommand,
  ICommandHandler,
  IQuery,
  IQueryHandler,
} from "../shared/cqrs";
import {
  InvoiceRepository,
  InvoiceSeriesRepository,
  StoreFiscalProfileRepository,
  FiscalSettingsRepository,
} from "../shared/repositories/invoice.repository";
import { StoreRepository } from "../shared/repositories/store.repository";
import { OrderRepository, OrderItemRepository } from "../shared/repositories/order.repository";
import { InvoiceEmitter } from "../lib/fiscal/emitter";
import { AgtClient } from "../lib/fiscal/agt.client";
import { MAX_SERIES_PER_ESTABLISHMENT } from "../lib/fiscal/constants";
import { UnitOfWork } from "../shared/unit-of-work";
import {
  assertPermission,
  hasAnyRole,
  resolvePermissions,
  PERMISSIONS,
} from "../lib/permissions";
import { BadRequestError, ForbiddenError, NotFoundError } from "../shared/errors";
import { fiscalProfileSchema, fiscalSeriesSchema, fiscalSettingsSchema } from "../lib/validators";
import { buildInvoicePdf } from "../lib/fiscal/pdf";

export class GetFiscalSettingsQuery implements IQuery {
  constructor(public readonly roles: string[]) {}
}

export class UpsertFiscalSettingsCommand implements ICommand {
  constructor(
    public readonly roles: string[],
    public readonly data: any
  ) {}
}

export class GetStoreFiscalProfileQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly roles: string[],
    public readonly storeId: string
  ) {}
}

export class UpsertStoreFiscalProfileCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly roles: string[],
    public readonly storeId: string,
    public readonly data: any
  ) {}
}

export class ListStoreSeriesQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly roles: string[],
    public readonly storeId: string
  ) {}
}

export class OpenInvoiceSeriesCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly roles: string[],
    public readonly storeId: string,
    public readonly data: any
  ) {}
}

export class GetOrderInvoiceQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly roles: string[],
    public readonly orderId: string
  ) {}
}

export class GetInvoiceQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly roles: string[],
    public readonly id: string
  ) {}
}

export class GetInvoicePdfQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly roles: string[],
    public readonly invoiceId: string
  ) {}
}

export class EmitOrderInvoiceCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly roles: string[],
    public readonly orderId: string
  ) {}
}

export class RefreshInvoiceAgtStatusCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly roles: string[],
    public readonly invoiceId: string
  ) {}
}

async function isAdmin(roles: string[]): Promise<boolean> {
  const effective = await resolvePermissions(roles);
  return (
    effective.has(PERMISSIONS.adminAccess) || hasAnyRole(roles, ["ADMIN"])
  );
}

async function assertStoreAccess(
  roles: string[],
  userId: string,
  stores: StoreRepository,
  storeId: string
): Promise<void> {
  if (await isAdmin(roles)) return;
  const store = await stores.findByUserId(userId);
  if (!store || store.id !== storeId) {
    throw new ForbiddenError("Não autorizado");
  }
}

export class GetFiscalSettingsQueryHandler
  implements IQueryHandler<GetFiscalSettingsQuery, any>
{
  constructor(private readonly settings: FiscalSettingsRepository) {}

  async handle(query: GetFiscalSettingsQuery) {
    await assertPermission(query.roles, PERMISSIONS.fiscalSettingsManage);
    return { settings: await this.settings.getOrCreate() };
  }
}

export class UpsertFiscalSettingsCommandHandler
  implements ICommandHandler<UpsertFiscalSettingsCommand, any>
{
  constructor(private readonly settings: FiscalSettingsRepository) {}

  async handle(command: UpsertFiscalSettingsCommand) {
    await assertPermission(command.roles, PERMISSIONS.fiscalSettingsManage);
    const data = fiscalSettingsSchema.parse(command.data);
    const clean: any = { ...data };
    if (clean.certificationDate) {
      clean.certificationDate = new Date(clean.certificationDate);
    } else {
      delete clean.certificationDate;
    }
    const settings = await this.settings.upsert(clean);
    return { settings };
  }
}

export class GetStoreFiscalProfileQueryHandler
  implements IQueryHandler<GetStoreFiscalProfileQuery, any>
{
  constructor(
    private readonly profiles: StoreFiscalProfileRepository,
    private readonly stores: StoreRepository
  ) {}

  async handle(query: GetStoreFiscalProfileQuery) {
    await assertPermission(query.roles, PERMISSIONS.fiscalProfileManage);
    await assertStoreAccess(
      query.roles,
      query.userId,
      this.stores,
      query.storeId
    );
    const profile = await this.profiles.findByStoreIdWithStore(query.storeId);
    return { profile };
  }
}

export class UpsertStoreFiscalProfileCommandHandler
  implements ICommandHandler<UpsertStoreFiscalProfileCommand, any>
{
  constructor(
    private readonly profiles: StoreFiscalProfileRepository,
    private readonly stores: StoreRepository
  ) {}

  async handle(command: UpsertStoreFiscalProfileCommand) {
    await assertPermission(command.roles, PERMISSIONS.fiscalProfileManage);
    await assertStoreAccess(
      command.roles,
      command.userId,
      this.stores,
      command.storeId
    );
    const data = fiscalProfileSchema.parse(command.data);
    const profile = await this.profiles.upsert(command.storeId, data);
    return { profile };
  }
}

export class ListStoreSeriesQueryHandler
  implements IQueryHandler<ListStoreSeriesQuery, any>
{
  constructor(
    private readonly series: InvoiceSeriesRepository,
    private readonly stores: StoreRepository
  ) {}

  async handle(query: ListStoreSeriesQuery) {
    await assertPermission(query.roles, PERMISSIONS.fiscalSeriesManage);
    await assertStoreAccess(
      query.roles,
      query.userId,
      this.stores,
      query.storeId
    );
    return { series: await this.series.findForStore(query.storeId) };
  }
}

export class OpenInvoiceSeriesCommandHandler
  implements ICommandHandler<OpenInvoiceSeriesCommand, any>
{
  constructor(
    private readonly series: InvoiceSeriesRepository,
    private readonly profiles: StoreFiscalProfileRepository,
    private readonly settings: FiscalSettingsRepository,
    private readonly stores: StoreRepository,
    private readonly agtClient: AgtClient,
    private readonly generateKey: () => { privateKeyPem: string }
  ) {}

  async handle(command: OpenInvoiceSeriesCommand) {
    await assertPermission(command.roles, PERMISSIONS.fiscalSeriesManage);
    await assertStoreAccess(
      command.roles,
      command.userId,
      this.stores,
      command.storeId
    );

    const data = fiscalSeriesSchema.parse(command.data);
    const year = data.year ?? new Date().getFullYear();

    const existing = await this.series.findOpen(
      command.storeId,
      data.documentType,
      year
    );
    if (existing) {
      throw new BadRequestError(
        `Já existe uma série aberta (${existing.agtSeriesCode ?? "sem código"}) para ${data.documentType}/${year}`
      );
    }

    const profile = await this.profiles.findByStoreId(command.storeId);
    if (!profile || !profile.isActive) {
      throw new BadRequestError(
        "Perfil fiscal da loja não configurado ou inactivo"
      );
    }

    const settings = await this.settings.getOrCreate();
    if (!settings.signatureKeyPem) {
      const pair = this.generateKey();
      await this.settings.upsert({ signatureKeyPem: pair.privateKeyPem });
      settings.signatureKeyPem = pair.privateKeyPem;
    }
    if (!profile.signatureKeyPem) {
      const pair = this.generateKey();
      await this.profiles.update(command.storeId, {
        signatureKeyPem: pair.privateKeyPem,
      });
      profile.signatureKeyPem = pair.privateKeyPem;
    }

    const openCount = await this.series.countForYear(command.storeId, year);
    if (openCount >= MAX_SERIES_PER_ESTABLISHMENT) {
      throw new BadRequestError(
        `Limite de ${MAX_SERIES_PER_ESTABLISHMENT} séries por estabelecimento/ano atingido`
      );
    }

    const result = await this.agtClient.requestSeries(settings, {
      taxRegistrationNumber: profile.nif,
      seriesYear: year,
      documentType: data.documentType,
      establishmentNumber: data.establishmentNumber,
      seriesContingencyIndicator: "N",
      issuerPrivateKeyPem: profile.signatureKeyPem,
    });

    if (!result.seriesCode) {
      throw new BadRequestError(
        `Série rejeitada pela AGT: ${
          result.errorList
            ?.map((e) => `${e.idError} ${e.descriptionError}`)
            .join("; ") || result.response
        }`
      );
    }

    const created = await this.series.create({
      storeId: command.storeId,
      documentType: data.documentType,
      agtSeriesCode: result.seriesCode,
      establishmentNumber: data.establishmentNumber,
      year,
      status: "OPEN",
      nextNumber: 1,
      authorizedQuantity: result.authorizedQuantity ?? null,
      firstDocumentNo: result.firstDocumentNo ?? null,
      lastDocumentNo: result.lastDocumentNo ?? null,
    });

    return { series: created };
  }
}

export class GetOrderInvoiceQueryHandler
  implements IQueryHandler<GetOrderInvoiceQuery, any>
{
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly orders: OrderRepository,
    private readonly stores: StoreRepository
  ) {}

  async handle(query: GetOrderInvoiceQuery) {
    const order = await this.orders.findByIdentifierWithDetails(query.orderId);
    if (!order) {
      throw new NotFoundError("Pedido não encontrado");
    }

    const admin = await isAdmin(query.roles);
    const isBuyer = order.userId === query.userId;
    if (!admin && !isBuyer) {
      // Vendedor/gestor: exige permissão de consulta + acesso à loja do pedido.
      await assertPermission(query.roles, PERMISSIONS.fiscalInvoicesView);
      await assertStoreAccess(
        query.roles,
        query.userId,
        this.stores,
        order.items[0]?.storeId ?? null
      );
    }

    const invoices = await this.invoices.findByOrder(order.id);
    return { orderId: order.id, invoices };
  }
}

export class GetInvoiceQueryHandler
  implements IQueryHandler<GetInvoiceQuery, any>
{
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly stores: StoreRepository
  ) {}

  async handle(query: GetInvoiceQuery) {
    await assertPermission(query.roles, PERMISSIONS.fiscalInvoicesView);
    const invoice = await this.invoices.findByIdWithLines(query.id);
    if (!invoice) {
      throw new NotFoundError("Factura não encontrada");
    }
    await assertStoreAccess(
      query.roles,
      query.userId,
      this.stores,
      invoice.storeId
    );
    return { invoice };
  }
}

export class GetInvoicePdfQueryHandler
  implements IQueryHandler<GetInvoicePdfQuery, any>
{
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly orders: OrderRepository,
    private readonly stores: StoreRepository
  ) {}

  async handle(query: GetInvoicePdfQuery) {
    const invoice = await this.invoices.findByIdWithLines(query.invoiceId);
    if (!invoice) {
      throw new NotFoundError("Factura não encontrada");
    }

    // Direito de consulta: admin, vendedor da loja emitente, ou comprador do pedido.
    const admin = await isAdmin(query.roles);
    let buyer = false;
    if (!admin && invoice.orderId) {
      const order = await this.orders.findById(invoice.orderId);
      buyer = Boolean(order && order.userId === query.userId);
    }
    if (!admin && !buyer) {
      await assertPermission(query.roles, PERMISSIONS.fiscalInvoicesView);
      await assertStoreAccess(
        query.roles,
        query.userId,
        this.stores,
        invoice.storeId
      );
    }

    const pdf = await buildInvoicePdf(invoice);
    const filename = `fatura-${String(invoice.documentNo || "documento")
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "documento"}.pdf`;

    return { pdf, filename };
  }
}

export class EmitOrderInvoiceCommandHandler
  implements ICommandHandler<EmitOrderInvoiceCommand, any>
{
  constructor(
    private readonly emitter: InvoiceEmitter,
    private readonly orders: OrderRepository,
    private readonly orderItems: OrderItemRepository,
    private readonly stores: StoreRepository
  ) {}

  async handle(command: EmitOrderInvoiceCommand) {
    await assertPermission(command.roles, PERMISSIONS.fiscalInvoicesManage);
    if (!(await isAdmin(command.roles))) {
      const store = await this.stores.findByUserId(command.userId);
      const belongs = store
        ? await this.orderItems.findByOrderAndStore(command.orderId, store.id)
        : null;
      if (!store || !belongs) {
        throw new ForbiddenError("Não autorizado");
      }
    }

    const { invoice, created } = await this.emitter.emitForOrder(
      command.orderId,
      command.userId
    );

    return { invoice, created };
  }
}

export class RefreshInvoiceAgtStatusCommandHandler
  implements ICommandHandler<RefreshInvoiceAgtStatusCommand, any>
{
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly profiles: StoreFiscalProfileRepository,
    private readonly settings: FiscalSettingsRepository,
    private readonly stores: StoreRepository,
    private readonly agtClient: AgtClient
  ) {}

  async handle(command: RefreshInvoiceAgtStatusCommand) {
    await assertPermission(command.roles, PERMISSIONS.fiscalInvoicesManage);
    const invoice = await this.invoices.findByIdWithLines(command.invoiceId);
    if (!invoice) {
      throw new NotFoundError("Factura não encontrada");
    }
    await assertStoreAccess(
      command.roles,
      command.userId,
      this.stores,
      invoice.storeId
    );

    if (!invoice.agtRequestId || invoice.agtRequestId === "dev-offline") {
      return {
        invoice,
        refreshed: false,
        message: "Documento em modo de desenvolvimento — sem estado remoto para consultar.",
      };
    }

    const profile = await this.profiles.findByStoreId(invoice.storeId);
    const settings = await this.settings.getOrCreate();
    if (!profile || !profile.nif || !profile.signatureKeyPem) {
      throw new BadRequestError(
        "Perfil fiscal da loja incompleto para consulta de estado"
      );
    }

    const status = await this.agtClient.getInvoiceStatus({
      settings,
      taxRegistrationNumber: profile.nif,
      requestID: invoice.agtRequestId,
      issuerPrivateKeyPem: profile.signatureKeyPem,
    });

    // Mapeia o estado assíncrono da AGT para agtStatus do documento.
    let agtStatus = invoice.agtStatus;
    const list = status.documentStatusList ?? [];
    if (status.error) {
      agtStatus = "FAILED";
    } else if (status.resultCode === "0") {
      agtStatus = "VALID";
    } else if (status.resultCode === "1") {
      agtStatus = list.some((d) => d.documentStatus === "I") ? "INVALID" : "VALID";
    } else if (status.resultCode === "2") {
      agtStatus = "INVALID";
    } else if (status.resultCode === "9") {
      agtStatus = "FAILED";
    } else if (status.resultCode === "7" || status.resultCode === "8") {
      agtStatus = "SUBMITTED"; // ainda em processamento
    }

    const responseData = JSON.stringify({
      resultCode: status.resultCode,
      documentStatusList: list,
      raw: status.response,
    });

    await this.invoices.update(invoice.id, {
      agtStatus,
      agtResponse: responseData,
      agtValidatedAt:
        agtStatus === "VALID" || agtStatus === "INVALID" ? new Date() : (invoice.agtValidatedAt ?? null),
    });
    await this.invoices.addCommunicationLog(invoice.id, {
      attempt: 2,
      status: agtStatus,
      httpStatus: status.httpStatus ?? null,
      responsePayload: status.response,
      error: agtStatus === "FAILED" ? status.error : null,
    });

    return { invoice: { ...invoice, agtStatus, agtResponse: responseData }, refreshed: true };
  }
}