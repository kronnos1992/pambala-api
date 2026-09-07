import { Prisma } from "@prisma/client";
import { BaseRepository } from "./base.repository";
import type { SocialProvider } from "../../lib/social-auth";
import { primaryRoleOf } from "../../lib/permissions";

type ProviderField = "googleId" | "facebookId" | "linkedinId";

const PROVIDER_FIELD: Record<SocialProvider, ProviderField> = {
  google: "googleId",
  facebook: "facebookId",
  linkedin: "linkedinId",
};

export { PROVIDER_FIELD };

const roleKeysSelect = {
  roles: { select: { role: { select: { key: true } } } },
} as const;

export class UserRepository extends BaseRepository {
  findByEmail(email: string) {
    return this.client.user.findUnique({ where: { email } });
  }

  findByProvider(provider: SocialProvider, providerId: string) {
    const field = PROVIDER_FIELD[provider];
    return this.client.user.findUnique({
      where: { [field]: providerId } as unknown as Prisma.UserWhereUniqueInput,
    });
  }

  linkProvider(
    id: string,
    provider: SocialProvider,
    providerId: string,
    avatar?: string
  ) {
    const field = PROVIDER_FIELD[provider];
    const data: any = { [field]: providerId };
    if (avatar) data.avatar = avatar;
    return this.client.user.update({
      where: { id },
      data,
    });
  }

  findById(id: string) {
    return this.client.user.findUnique({ where: { id } });
  }

  getRoleKeys(userId: string): Promise<string[]> {
    return this.client.userRole
      .findMany({
        where: { userId },
        select: { role: { select: { key: true } } },
      })
      .then((rows) => rows.map((r) => r.role.key));
  }

  /** Atribui uma role ao utilizador (sem remover as restantes) e sincroniza a role primária. */
  async assignRole(userId: string, roleKey: string) {
    const role = await this.client.role.findUnique({ where: { key: roleKey } });
    if (!role) return this.findById(userId);

    await this.client.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id },
      update: {},
    });

    return this.syncPrimaryRole(userId);
  }

  /** Substitui o conjunto de roles do utilizador e sincroniza a role primária. */
  async replaceRoles(userId: string, roleKeys: string[]) {
    const roles = await this.client.role.findMany({
      where: { key: { in: roleKeys } },
    });

    await this.client.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      if (roles.length > 0) {
await tx.userRole.createMany({
        data: roles.map((role) => ({ userId, roleId: role.id })),
      });
      }
    });

    return this.syncPrimaryRole(userId);
  }

  private async syncPrimaryRole(userId: string) {
    const roleKeys = await this.getRoleKeys(userId);
    const primary = primaryRoleOf(roleKeys);
    return this.client.user.update({
      where: { id: userId },
      data: { role: primary },
      select: { id: true, name: true, email: true, role: true },
    });
  }

  findMe(id: string) {
    return this.client.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        avatar: true,
        aiValidationConsent: true,
        createdAt: true,
        ...roleKeysSelect,
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            isVerified: true,
          },
        },
      },
    });
  }

  create(data: Prisma.UserCreateInput) {
    return this.client.user.create({ data });
  }

  updateProfile(
    id: string,
    data: {
      name?: string;
      phone?: string;
      avatar?: string;
      aiValidationConsent?: boolean;
      password?: string;
      tokenVersion?: number;
    }
  ) {
    return this.client.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        avatar: true,
        aiValidationConsent: true,
        tokenVersion: true,
        ...roleKeysSelect,
      },
    });
  }

  updateRole(id: string, role: string) {
    return this.client.user.update({ where: { id }, data: { role } });
  }

  adminFindMany(skip: number, limit: number, role?: string, q?: string) {
    const where: any = {};
    if (role) where.roles = { some: { role: { key: role } } };
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
      ];
    }
    return this.client.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
        ...roleKeysSelect,
      },
    });
  }

  adminCount(role?: string, q?: string) {
    const where: any = {};
    if (role) where.roles = { some: { role: { key: role } } };
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
      ];
    }
    return this.client.user.count({ where });
  }

  adminDelete(id: string) {
    return this.client.user.delete({ where: { id } });
  }

  countAll() {
    return this.client.user.count();
  }

  countByRoleKey(key: string) {
    return this.client.user.count({
      where: { roles: { some: { role: { key } } } },
    });
  }

  countCreatedSince(date: Date) {
    return this.client.user.count({ where: { createdAt: { gte: date } } });
  }

  countBetween(from: Date, to: Date) {
    return this.client.user.count({
      where: { createdAt: { gte: from, lt: to } },
    });
  }

  groupByRoleKey() {
    return this.client.userRole
      .groupBy({ by: ["roleId"], _count: true })
      .then(async (grouped) => {
        const ids = grouped.map((g) => g.roleId);
        const roles = await this.client.role.findMany({
          where: { id: { in: ids } },
          select: { id: true, key: true },
        });
        const map = new Map(roles.map((r) => [r.id, r.key]));
        return grouped.map((g) => ({
          role: map.get(g.roleId) || g.roleId,
          count: g._count,
        }));
      });
  }
}