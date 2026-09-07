import { Prisma } from "@prisma/client";
import { BaseRepository } from "./base.repository";
import type { SocialProvider } from "../../lib/social-auth";

type ProviderField = "googleId" | "facebookId" | "linkedinId";

const PROVIDER_FIELD: Record<SocialProvider, ProviderField> = {
  google: "googleId",
  facebook: "facebookId",
  linkedin: "linkedinId",
};

export { PROVIDER_FIELD };

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
      },
    });
  }

  updateRole(id: string, role: string) {
    return this.client.user.update({ where: { id }, data: { role } });
  }

  adminFindMany(skip: number, limit: number, role?: string, q?: string) {
    const where: any = {};
    if (role) where.role = role;
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
      },
    });
  }

  adminCount(role?: string, q?: string) {
    const where: any = {};
    if (role) where.role = role;
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
      ];
    }
    return this.client.user.count({ where });
  }

  adminUpdateRole(id: string, role: string) {
    return this.client.user.update({
      where: { id },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });
  }

  adminDelete(id: string) {
    return this.client.user.delete({ where: { id } });
  }

  countAll() {
    return this.client.user.count();
  }

  countByRole(role: string) {
    return this.client.user.count({ where: { role } });
  }

  countCreatedSince(date: Date) {
    return this.client.user.count({ where: { createdAt: { gte: date } } });
  }

  countBetween(from: Date, to: Date) {
    return this.client.user.count({
      where: { createdAt: { gte: from, lt: to } },
    });
  }

  groupByRole() {
    return this.client.user.groupBy({ by: ["role"], _count: true });
  }
}