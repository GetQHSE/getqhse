import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CurrentUser } from "@qhse/auth";
import { hashPassword } from "better-auth/crypto";

import { AuthService } from "../auth/auth.service.js";
import type {
  CreatePlatformUserInput,
  ListPlatformUsersInput,
  PlatformOperator,
  UpdatePlatformUserInput,
} from "./platform-users.contracts.js";

const operatorSelect = {
  id: true,
  name: true,
  email: true,
  firstName: true,
  lastName: true,
  platformRole: true,
  status: true,
  locale: true,
  timezone: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PlatformUsersService {
  constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
  ) {}

  async list(_actor: CurrentUser, input: ListPlatformUsersInput): Promise<PlatformOperator[]> {
    return await this.auth.database.user.findMany({
      where: {
        platformRole: { in: ["super_admin", "platform_admin", "content_manager", "support"] },
        ...(input.role ? { platformRole: input.role } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.search
          ? {
              OR: [
                { name: { contains: input.search, mode: "insensitive" as const } },
                { email: { contains: input.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ platformRole: "asc" }, { name: "asc" }],
      select: operatorSelect,
    });
  }

  async create(actor: CurrentUser, input: CreatePlatformUserInput): Promise<PlatformOperator> {
    this.requireSuperAdmin(actor);

    const existing = await this.auth.database.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) throw new ConflictException("An account already exists for this email address");

    const password = await hashPassword(input.password);
    try {
      return await this.auth.database.$transaction(async (database) => {
        const user = await database.user.create({
          data: {
            name: `${input.firstName} ${input.lastName}`,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            emailVerified: true,
            platformRole: input.platformRole,
            status: "active",
            locale: input.locale,
            timezone: input.timezone,
          },
          select: operatorSelect,
        });
        await database.account.create({
          data: {
            providerId: "credential",
            accountId: user.id,
            userId: user.id,
            password,
          },
        });
        return user;
      });
    } catch (error) {
      if (isUniqueConstraint(error)) {
        throw new ConflictException("An account already exists for this email address");
      }
      throw error;
    }
  }

  async update(
    actor: CurrentUser,
    userId: string,
    input: UpdatePlatformUserInput,
  ): Promise<PlatformOperator> {
    this.requireSuperAdmin(actor);
    if (actor.id === userId) {
      throw new ForbiddenException(
        "Use a separate account to change your own administrative access",
      );
    }

    const target = await this.auth.database.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, platformRole: true },
    });
    if (!target || target.platformRole === "user") {
      throw new NotFoundException("Platform operator not found");
    }
    if (target.platformRole === "super_admin") {
      throw new ForbiddenException("The bootstrap super administrator cannot be modified here");
    }

    const firstName = input.firstName ?? target.firstName ?? "";
    const lastName = input.lastName ?? target.lastName ?? "";
    const password = input.password ? await hashPassword(input.password) : null;

    return this.auth.database.$transaction(async (database) => {
      const user = await database.user.update({
        where: { id: userId },
        data: {
          ...(input.firstName ? { firstName: input.firstName } : {}),
          ...(input.lastName ? { lastName: input.lastName } : {}),
          ...(input.firstName || input.lastName ? { name: `${firstName} ${lastName}`.trim() } : {}),
          ...(input.platformRole ? { platformRole: input.platformRole } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.locale ? { locale: input.locale } : {}),
          ...(input.timezone ? { timezone: input.timezone } : {}),
        },
        select: operatorSelect,
      });

      if (password) {
        await database.account.upsert({
          where: { providerId_accountId: { providerId: "credential", accountId: userId } },
          update: { password },
          create: { providerId: "credential", accountId: userId, userId, password },
        });
      }
      if (password || input.status === "suspended") {
        await database.session.deleteMany({ where: { userId } });
      }
      return user;
    });
  }

  private requireSuperAdmin(actor: CurrentUser) {
    if (actor.platformRole !== "super_admin") {
      throw new ForbiddenException("Only a super administrator can manage platform operators");
    }
  }
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
