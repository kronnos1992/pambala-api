import { BaseRepository } from "./base.repository";

export class RoleRepository extends BaseRepository {
  findAllRoles() {
    return this.client.role.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        isSystem: true,
        createdAt: true,
        responsibilities: {
          select: { responsibility: { select: { key: true, name: true } } },
        },
        _count: { select: { users: true } },
      },
    });
  }

  findRoleByKey(key: string) {
    return this.client.role.findUnique({ where: { key } });
  }

  findAllResponsibilities() {
    return this.client.responsibility.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        isSystem: true,
      },
    });
  }

  findResponsibilityByKey(key: string) {
    return this.client.responsibility.findUnique({ where: { key } });
  }

  createRole(data: { key: string; name: string; description?: string }) {
    return this.client.role.create({ data });
  }

  updateRole(key: string, data: { name?: string; description?: string | null }) {
    return this.client.role.update({ where: { key }, data });
  }

  deleteRoleByKey(key: string) {
    return this.client.role.delete({ where: { key } });
  }

  countUsersByRole(roleId: string) {
    return this.client.userRole.count({ where: { roleId } });
  }

  setRoleResponsibilities(roleId: string, responsibilityKeys: string[]) {
    return this.client.$transaction(async (tx) => {
      await tx.roleResponsibility.deleteMany({ where: { roleId } });
      if (responsibilityKeys.length > 0) {
        await tx.roleResponsibility.createMany({
          data: responsibilityKeys.map((key) => ({
            roleId,
            responsibilityId: key,
          })),
        });
      }
    });
  }

  createResponsibility(data: { key: string; name: string; description?: string }) {
    return this.client.responsibility.create({ data: { ...data, id: data.key } });
  }

  updateResponsibility(
    key: string,
    data: { name?: string; description?: string | null }
  ) {
    return this.client.responsibility.update({ where: { key }, data });
  }

  deleteResponsibilityByKey(key: string) {
    return this.client.responsibility.delete({ where: { key } });
  }
}