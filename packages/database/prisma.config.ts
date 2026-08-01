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
    url:
      process.env["DATABASE_MIGRATION_URL"] ??
      process.env["DATABASE_URL"] ??
      "postgresql://qhse_migrator:change-me@localhost:5432/qhse",
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
