import { ConflictException, ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthService } from "../auth/auth.service.js";
import { PlatformUsersService } from "./platform-users.service.js";

const operator = {
  id: "operator-1",
  name: "Leila Mansouri",
  email: "leila@example.test",
  firstName: "Leila",
  lastName: "Mansouri",
  platformRole: "content_manager",
  status: "active",
  locale: "fr-MA",
  timezone: "Africa/Casablanca",
  createdAt: new Date("2026-08-11T10:00:00Z"),
  updatedAt: new Date("2026-08-11T10:00:00Z"),
};

const superAdmin = { id: "super-1", platformRole: "super_admin" } as never;
const platformAdmin = { id: "admin-1", platformRole: "platform_admin" } as never;

describe("PlatformUsersService", () => {
  const user = {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const account = { create: vi.fn(), upsert: vi.fn() };
  const session = { deleteMany: vi.fn() };
  const database = {
    user,
    account,
    session,
    $transaction: vi.fn(async (callback: (value: unknown) => unknown) =>
      callback({ user, account, session }),
    ),
  };
  const service = new PlatformUsersService({ database } as unknown as AuthService);

  beforeEach(() => {
    vi.clearAllMocks();
    user.findUnique.mockResolvedValue(null);
    user.create.mockResolvedValue(operator);
    account.create.mockResolvedValue({ id: "account-1" });
  });

  it("lists only platform operator roles", async () => {
    user.findMany.mockResolvedValue([operator]);

    await expect(service.list(platformAdmin, { search: "leila" })).resolves.toEqual([operator]);

    expect(user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          platformRole: {
            in: ["super_admin", "platform_admin", "content_manager", "support"],
          },
        }),
      }),
    );
  });

  it("allows only a super administrator to create an operator", async () => {
    await expect(
      service.create(platformAdmin, {
        firstName: "Leila",
        lastName: "Mansouri",
        email: "leila@example.test",
        password: "a-secure-password",
        platformRole: "content_manager",
        locale: "fr-MA",
        timezone: "Africa/Casablanca",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(user.findUnique).not.toHaveBeenCalled();
  });

  it("creates the user and credential account atomically", async () => {
    const result = await service.create(superAdmin, {
      firstName: "Leila",
      lastName: "Mansouri",
      email: "leila@example.test",
      password: "a-secure-password",
      platformRole: "content_manager",
      locale: "fr-MA",
      timezone: "Africa/Casablanca",
    });

    expect(result).toEqual(operator);
    expect(database.$transaction).toHaveBeenCalledOnce();
    expect(user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "leila@example.test",
          emailVerified: true,
          platformRole: "content_manager",
          status: "active",
        }),
      }),
    );
    expect(account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerId: "credential",
        accountId: operator.id,
        userId: operator.id,
        password: expect.any(String),
      }),
    });
    expect(account.create.mock.calls[0]?.[0].data.password).not.toBe("a-secure-password");
    expect(result).not.toHaveProperty("password");
  });

  it("rejects an email already used by any account", async () => {
    user.findUnique.mockResolvedValue({ id: "existing-user" });

    await expect(
      service.create(superAdmin, {
        firstName: "Leila",
        lastName: "Mansouri",
        email: "leila@example.test",
        password: "a-secure-password",
        platformRole: "support",
        locale: "fr-MA",
        timezone: "Africa/Casablanca",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it("prevents an administrator from changing their own access", async () => {
    await expect(
      service.update(superAdmin, "super-1", { status: "suspended" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
