import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx src/seed.ts",
  },
  datasource: {
    // Runtime services use the least-privileged DATABASE_URL. Prisma migration
    // commands need the schema-owning role whenever MIGRATION_DATABASE_URL is
    // configured.
    url: process.env["MIGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"],
    // Only needed for providers that forbid CREATE DATABASE; otherwise Prisma
    // creates and drops a temporary shadow database itself during `migrate dev`.
    ...(process.env["SHADOW_DATABASE_URL"]
      ? { shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"] }
      : {}),
  },
});
