import { ICommand, ICommandHandler, IQuery, IQueryHandler } from "../shared/cqrs";
import { RoleRepository } from "../shared/repositories/role.repository";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../shared/errors";
import {
  SYSTEM_ROLE_KEYS,
  invalidatePermissionsCache,
} from "../lib/permissions";

export class ListRolesQuery implements IQuery {}
export class ListResponsibilitiesQuery implements IQuery {}

export class CreateRoleCommand implements ICommand {
  constructor(
    public readonly key: string,
    public readonly name: string,
    public readonly description?: string
  ) {}
}

export class UpdateRoleCommand implements ICommand {
  constructor(
    public readonly key: string,
    public readonly data: { name?: string; description?: string | null }
  ) {}
}

export class DeleteRoleCommand implements ICommand {
  constructor(public readonly key: string) {}
}

export class SetRoleResponsibilitiesCommand implements ICommand {
  constructor(
    public readonly key: string,
    public readonly responsibilityKeys: string[]
  ) {}
}

export class CreateResponsibilityCommand implements ICommand {
  constructor(
    public readonly key: string,
    public readonly name: string,
    public readonly description?: string
  ) {}
}

export class UpdateResponsibilityCommand implements ICommand {
  constructor(
    public readonly key: string,
    public readonly data: { name?: string; description?: string | null }
  ) {}
}

export class DeleteResponsibilityCommand implements ICommand {
  constructor(public readonly key: string) {}
}

const KEY_REGEX = /^[a-z0-9][a-z0-9._-]*$/;

function assertValidKey(key: string) {
  if (!KEY_REGEX.test(key)) {
    throw new BadRequestError(
      "Chave inválida: use apenas letras minúsculas, números, '.', '_' ou '-'"
    );
  }
}

export class ListRolesQueryHandler implements IQueryHandler<ListRolesQuery, any> {
  constructor(private readonly roles: RoleRepository) {}

  async handle() {
    const roles = await this.roles.findAllRoles();
    return {
      roles: roles.map((r) => ({
        key: r.key,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        users: r._count.users,
        responsibilities: r.responsibilities.map((x) => ({
          key: x.responsibility.key,
          name: x.responsibility.name,
        })),
      })),
    };
  }
}

export class ListResponsibilitiesQueryHandler
  implements IQueryHandler<ListResponsibilitiesQuery, any>
{
  constructor(private readonly roles: RoleRepository) {}

  async handle() {
    const responsibilities = await this.roles.findAllResponsibilities();
    return {
      responsibilities: responsibilities.map((r) => ({
        key: r.key,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
      })),
    };
  }
}

export class CreateRoleCommandHandler
  implements ICommandHandler<CreateRoleCommand, any>
{
  constructor(private readonly roles: RoleRepository) {}

  async handle(command: CreateRoleCommand) {
    assertValidKey(command.key);
    const existing = await this.roles.findRoleByKey(command.key);
    if (existing) {
      throw new ConflictError("Já existe uma role com esta chave");
    }

    const role = await this.roles.createRole({
      key: command.key,
      name: command.name,
      description: command.description,
    });

    return { role: await this.roles.findRoleByKey(role.key) };
  }
}

export class UpdateRoleCommandHandler
  implements ICommandHandler<UpdateRoleCommand, any>
{
  constructor(private readonly roles: RoleRepository) {}

  async handle(command: UpdateRoleCommand) {
    const existing = await this.roles.findRoleByKey(command.key);
    if (!existing) throw new NotFoundError("Role não encontrada");

    const role = await this.roles.updateRole(command.key, command.data);
    return { role };
  }
}

export class DeleteRoleCommandHandler
  implements ICommandHandler<DeleteRoleCommand, any>
{
  constructor(private readonly roles: RoleRepository) {}

  async handle(command: DeleteRoleCommand) {
    if (SYSTEM_ROLE_KEYS.includes(command.key)) {
      throw new BadRequestError("As roles de sistema não podem ser eliminadas");
    }

    const existing = await this.roles.findRoleByKey(command.key);
    if (!existing) throw new NotFoundError("Role não encontrada");

    const assigned = await this.roles.countUsersByRole(existing.id);
    if (assigned > 0) {
      throw new ConflictError(
        "Role em uso por utilizadores. Remova as atribuições antes de eliminar a role."
      );
    }

    await this.roles.deleteRoleByKey(command.key);
    invalidatePermissionsCache();
    return { deleted: true };
  }
}

export class SetRoleResponsibilitiesCommandHandler
  implements ICommandHandler<SetRoleResponsibilitiesCommand, any>
{
  constructor(private readonly roles: RoleRepository) {}

  async handle(command: SetRoleResponsibilitiesCommand) {
    const role = await this.roles.findRoleByKey(command.key);
    if (!role) throw new NotFoundError("Role não encontrada");

    const responsibilities = await this.roles.findAllResponsibilities();
    const known = new Set(responsibilities.map((r) => r.key));
    const unknown = command.responsibilityKeys.filter((k) => !known.has(k));
    if (unknown.length > 0) {
      throw new BadRequestError(
        `Responsabilidades inexistentes: ${unknown.join(", ")}`
      );
    }

    await this.roles.setRoleResponsibilities(
      role.id,
      command.responsibilityKeys
    );
    invalidatePermissionsCache();

    return { role: await this.roles.findRoleByKey(role.key), responsibilities: command.responsibilityKeys };
  }
}

export class CreateResponsibilityCommandHandler
  implements ICommandHandler<CreateResponsibilityCommand, any>
{
  constructor(private readonly roles: RoleRepository) {}

  async handle(command: CreateResponsibilityCommand) {
    assertValidKey(command.key);
    const existing = await this.roles.findResponsibilityByKey(command.key);
    if (existing) {
      throw new ConflictError("Já existe uma responsabilidade com esta chave");
    }

    const responsibility = await this.roles.createResponsibility({
      key: command.key,
      name: command.name,
      description: command.description,
    });

    return { responsibility };
  }
}

export class UpdateResponsibilityCommandHandler
  implements ICommandHandler<UpdateResponsibilityCommand, any>
{
  constructor(private readonly roles: RoleRepository) {}

  async handle(command: UpdateResponsibilityCommand) {
    const existing = await this.roles.findResponsibilityByKey(command.key);
    if (!existing) throw new NotFoundError("Responsabilidade não encontrada");

    const responsibility = await this.roles.updateResponsibility(
      command.key,
      command.data
    );
    return { responsibility };
  }
}

export class DeleteResponsibilityCommandHandler
  implements ICommandHandler<DeleteResponsibilityCommand, any>
{
  constructor(private readonly roles: RoleRepository) {}

  async handle(command: DeleteResponsibilityCommand) {
    const existing = await this.roles.findResponsibilityByKey(command.key);
    if (!existing) throw new NotFoundError("Responsabilidade não encontrada");
    if (existing.isSystem) {
      throw new BadRequestError(
        "As responsabilidades de sistema não podem ser eliminadas"
      );
    }

    await this.roles.deleteResponsibilityByKey(command.key);
    invalidatePermissionsCache();
    return { deleted: true };
  }
}