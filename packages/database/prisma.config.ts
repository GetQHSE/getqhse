import "dotenv/config";
import { defineConfig } from "prisma/config";

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
