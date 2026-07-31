import { hashPassword } from "better-auth/crypto";

import type { DatabaseClient } from "./index.js";

export type BootstrapSuperAdminOptions = {
  email?: string | undefined;
  password?: string | undefined;
};

export type BootstrapSuperAdminResult = {
  created: boolean;
  email: string;
};

type PasswordHasher = (password: string) => Promise<string>;

export async function ensureBootstrapSuperAdmin(
  database: DatabaseClient,
  options: BootstrapSuperAdminOptions,
  passwordHasher: PasswordHasher = hashPassword,
): Promise<BootstrapSuperAdminResult> {
  const existingSuperAdmin = await database.user.findFirst({
    where: { platformRole: "super_admin" },
    select: { email: true },
  });

  if (existingSuperAdmin) {
    return { created: false, email: existingSuperAdmin.email };
  }

  const email = options.email?.trim().toLowerCase();
  const password = options.password;

  if (!email || !password) {
    throw new Error(
      "BOOTSTRAP_SUPER_ADMIN_EMAIL and BOOTSTRAP_SUPER_ADMIN_PASSWORD are required when no super admin exists",
    );
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error("BOOTSTRAP_SUPER_ADMIN_EMAIL must be a valid email address");
  }
  if (password.length < 12) {
    throw new Error("BOOTSTRAP_SUPER_ADMIN_PASSWORD must contain at least 12 characters");
  }

  const passwordHash = await passwordHasher(password);
  const user = await database.user.upsert({
    where: { email },
    update: {
      emailVerified: true,
      platformRole: "super_admin",
      status: "active",
    },
    create: {
      name: "Platform Super Admin",
      email,
      emailVerified: true,
      platformRole: "super_admin",
      status: "active",
    },
  });

  await database.account.upsert({
    where: {
      providerId_accountId: {
        providerId: "credential",
        accountId: user.id,
      },
    },
    update: { password: passwordHash },
    create: {
      providerId: "credential",
      accountId: user.id,
      userId: user.id,
      password: passwordHash,
    },
  });

  return { created: true, email: user.email };
}
