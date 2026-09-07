import {
  ICommand,
  ICommandHandler,
  IQuery,
  IQueryHandler,
} from "../shared/cqrs";
import { UserRepository, PROVIDER_FIELD } from "../shared/repositories/auth.repository";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../shared/errors";
import {
  hashPassword,
  comparePassword,
  generateToken,
} from "../lib/auth";
import type { SocialProvider } from "../lib/social-auth";
import {
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from "../lib/validators";
import { randomBytes } from "node:crypto";

export class RegisterUserCommand implements ICommand {
  constructor(public readonly data: RegisterInput) {}
}

export class LoginUserCommand implements ICommand {
  constructor(public readonly data: LoginInput) {}
}

export class SocialLoginCommand implements ICommand {
  constructor(
    public readonly provider: SocialProvider,
    public readonly providerId: string,
    public readonly email?: string,
    public readonly name?: string,
    public readonly avatar?: string
  ) {}
}

export class UpdateProfileCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: UpdateProfileInput
  ) {}
}

export class GetMeQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

export class RegisterUserCommandHandler
  implements ICommandHandler<RegisterUserCommand, any>
{
  constructor(private readonly users: UserRepository) {}

  async handle(command: RegisterUserCommand) {
    const { data } = command;

    const existingUser = await this.users.findByEmail(data.email);
    if (existingUser) {
      throw new ConflictError("Email já está em uso");
    }

    const hashedPassword = await hashPassword(data.password);

    const user = await this.users.create({
      name: data.name,
      email: data.email,
      phone: data.phone,
      password: hashedPassword,
      role: "CLIENT",
      aiValidationConsent: data.aiValidationConsent === true,
    });

    await this.users.assignRole(user.id, "CLIENT");
    const roleKeys = await this.users.getRoleKeys(user.id);

    const token = generateToken({ userId: user.id, role: user.role, roles: roleKeys, tokenVersion: user.tokenVersion ?? 0 });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        aiValidationConsent: user.aiValidationConsent === true,
      },
    };
  }
}

export class LoginUserCommandHandler
  implements ICommandHandler<LoginUserCommand, any>
{
  constructor(private readonly users: UserRepository) {}

  async handle(command: LoginUserCommand) {
    const { data } = command;
    const email = (data.email || "").trim().toLowerCase();

    const user = await this.users.findByEmail(email);

    if (!user) {
      throw new UnauthorizedError("Credenciais inválidas");
    }

    let isPasswordValid = await comparePassword(data.password, user.password);

    // Permitir tanto a senha da seed (29091992) quanto a senha indicada no banner de demo (admin123)
    if (!isPasswordValid && user.email === "admin@pambala.ao" && (data.password === "admin123" || data.password === "29091992")) {
      isPasswordValid = true;
    }

    if (!isPasswordValid) {
      throw new UnauthorizedError("Credenciais inválidas");
    }

    const roleKeys = await this.users.getRoleKeys(user.id);
    const token = generateToken({ userId: user.id, role: user.role, roles: roleKeys, tokenVersion: user.tokenVersion ?? 0 });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        roles: roleKeys,
        avatar: user.avatar,
        aiValidationConsent: user.aiValidationConsent === true,
      },
    };
  }
}

export class SocialLoginCommandHandler
  implements ICommandHandler<SocialLoginCommand, any>
{
  constructor(private readonly users: UserRepository) {}

  async handle(command: SocialLoginCommand) {
    const { provider, providerId, email, name, avatar } = command;

    let user = await this.users.findByProvider(provider, providerId);

    if (!user && email) {
      user = await this.users.findByEmail(email);
    }

    if (!user) {
      if (!email) {
        throw new BadRequestError(
          "Não foi possível obter o email da sua conta. Tente novamente ou use email/senha."
        );
      }

      const providerField = PROVIDER_FIELD[provider];
      const hashedPassword = await hashPassword(
        randomBytes(24).toString("hex")
      );

      user = await this.users.create({
        name: name || email.split("@")[0] || "Utilizador",
        email,
        password: hashedPassword,
        avatar: avatar || null,
        role: "CLIENT",
        ...{ [providerField]: providerId },
      } as any);

      await this.users.assignRole(user.id, "CLIENT");
    } else {
      const providerField = PROVIDER_FIELD[provider];
      const needsLink = (user as any)[providerField] !== providerId;
      if (needsLink || !user.avatar) {
        user = await this.users.linkProvider(
          user.id,
          provider,
          providerId,
          avatar || undefined
        );
      }
    }

    const roleKeys = await this.users.getRoleKeys(user.id);
    const token = generateToken({ userId: user.id, role: user.role, roles: roleKeys, tokenVersion: user.tokenVersion ?? 0 });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        roles: roleKeys,
        avatar: user.avatar,
        aiValidationConsent: user.aiValidationConsent === true,
      },
    };
  }
}

export class GetMeQueryHandler implements IQueryHandler<GetMeQuery, any> {
  constructor(private readonly users: UserRepository) {}

  async handle(query: GetMeQuery) {
    const user = await this.users.findMe(query.userId);

    if (!user) {
      throw new NotFoundError("Usuário não encontrado");
    }

    return { user };
  }
}

export class UpdateProfileCommandHandler
  implements ICommandHandler<UpdateProfileCommand, any>
{
  constructor(private readonly users: UserRepository) {}

  async handle(command: UpdateProfileCommand) {
    const { userId, data } = command;

    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.avatar !== undefined) updateData.avatar = data.avatar;
    if (data.aiValidationConsent !== undefined)
      updateData.aiValidationConsent = data.aiValidationConsent === true;
    if (data.newPassword) {
      const current = await this.users.findById(userId);
      if (!current || !current.password || !(await comparePassword(data.currentPassword || "", current.password))) {
        throw new BadRequestError("A senha atual está incorreta");
      }
      updateData.password = await hashPassword(data.newPassword);
      updateData.tokenVersion = { increment: 1 };
    }

    const user = await this.users.updateProfile(userId, updateData);

    return { user };
  }
}