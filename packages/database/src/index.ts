import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/client/client.js";

export * from "./generated/client/client.js";
export * from "./normative-index.js";
export { ensureBootstrapSuperAdmin } from "./bootstrap-super-admin.js";
export type {
  BootstrapSuperAdminOptions,
  BootstrapSuperAdminResult,
} from "./bootstrap-super-admin.js";

export function createPrismaClient(databaseUrl = process.env["DATABASE_URL"]) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

export type DatabaseClient = ReturnType<typeof createPrismaClient>;
