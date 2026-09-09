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

export class EmitOrderInvoiceCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly roles: string[],
    public readonly orderId: string
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
    private readonly stores: StoreRepository
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

    const openCount = await this.series.countForYear(command.storeId, year);
    if (openCount >= MAX_SERIES_PER_ESTABLISHMENT) {
      throw new BadRequestError(
        `Limite de ${MAX_SERIES_PER_ESTABLISHMENT} séries por estabelecimento/ano atingido`
      );
    }

    const existing = await this.series.findOpen(
      command.storeId,
      data.documentType,
      year
    );
    if (existing) {
      throw new BadRequestError(
        `Já existe uma série aberta (${existing.prefix}) para ${data.documentType}/${year}`
      );
    }

    const created = await this.series.create({
      storeId: command.storeId,
      documentType: data.documentType,
      prefix: data.prefix,
      year,
      status: "OPEN",
      nextNumber: 1,
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
    await assertPermission(query.roles, PERMISSIONS.fiscalInvoicesView);
    const order = await this.orders.findByIdentifierWithDetails(query.orderId);
    if (!order) {
      throw new NotFoundError("Pedido não encontrado");
    }

    const admin = await isAdmin(query.roles);
    if (!admin && order.userId !== query.userId) {
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