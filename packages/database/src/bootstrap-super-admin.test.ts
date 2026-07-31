import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "./index.js";
import { ensureBootstrapSuperAdmin } from "./bootstrap-super-admin.js";

function databaseMock() {
  return {
    user: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    account: {
      upsert: vi.fn(),
    },
  } as unknown as DatabaseClient;
}

describe("ensureBootstrapSuperAdmin", () => {
  it("does not change credentials when a super admin already exists", async () => {
    const database = databaseMock();
    vi.mocked(database.user.findFirst).mockResolvedValue({
      email: "existing@example.test",
    } as never);
    const passwordHasher = vi.fn();

    await expect(ensureBootstrapSuperAdmin(database, {}, passwordHasher)).resolves.toEqual({
      created: false,
      email: "existing@example.test",
    });

    expect(passwordHasher).not.toHaveBeenCalled();
    expect(database.user.upsert).not.toHaveBeenCalled();
    expect(database.account.upsert).not.toHaveBeenCalled();
  });

  it("creates a super admin and Better Auth credential when none exists", async () => {
    const database = databaseMock();
    vi.mocked(database.user.findFirst).mockResolvedValue(null);
    vi.mocked(database.user.upsert).mockResolvedValue({
      id: "admin-user-id",
      email: "admin@example.test",
    } as never);
    const passwordHasher = vi.fn().mockResolvedValue("hashed-password");

    await expect(
      ensureBootstrapSuperAdmin(
        database,
        {
          email: " ADMIN@example.test ",
          password: "secure-password",
        },
        passwordHasher,
      ),
    ).resolves.toEqual({ created: true, email: "admin@example.test" });

    expect(database.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "admin@example.test" },
        create: expect.objectContaining({ platformRole: "super_admin" }),
        update: expect.objectContaining({ platformRole: "super_admin" }),
      }),
    );
    expect(database.account.upsert).toHaveBeenCalledWith({
      where: {
        providerId_accountId: {
          providerId: "credential",
          accountId: "admin-user-id",
        },
      },
      update: { password: "hashed-password" },
      create: {
        providerId: "credential",
        accountId: "admin-user-id",
        userId: "admin-user-id",
        password: "hashed-password",
      },
    });
  });

  it("requires bootstrap credentials only when no super admin exists", async () => {
    const database = databaseMock();
    vi.mocked(database.user.findFirst).mockResolvedValue(null);

    await expect(ensureBootstrapSuperAdmin(database, {})).rejects.toThrow(
      "BOOTSTRAP_SUPER_ADMIN_EMAIL and BOOTSTRAP_SUPER_ADMIN_PASSWORD are required",
    );
  });
});
