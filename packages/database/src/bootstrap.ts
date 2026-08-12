import { ensureBootstrapSuperAdmin } from "./bootstrap-super-admin.js";
import { createPrismaClient } from "./index.js";
import { seedTaxonomies } from "./taxonomies.js";

/**
 * Production bootstrap: super admin + reference data only. Runs after
 * `prisma migrate deploy` in the migrate container. Unlike `seed.ts` it
 * creates no demo organization, users, or audits.
 */
const database = createPrismaClient();

const email = process.env["BOOTSTRAP_SUPER_ADMIN_EMAIL"];
const password = process.env["BOOTSTRAP_SUPER_ADMIN_PASSWORD"];

async function bootstrap() {
  if (email || password) {
    const superAdmin = await ensureBootstrapSuperAdmin(database, { email, password });
    console.info(
      superAdmin.created
        ? `Bootstrapped super admin account: ${superAdmin.email}`
        : `Super admin already present: ${superAdmin.email}`,
    );
  } else {
    console.warn("BOOTSTRAP_SUPER_ADMIN_EMAIL/PASSWORD not set - skipping super admin bootstrap");
  }

  await seedTaxonomies(database);
  console.info("Taxonomies are up to date");
}

try {
  await bootstrap();
} catch (error: unknown) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
