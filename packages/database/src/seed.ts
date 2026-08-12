import { createPrismaClient } from "./index.js";
import { ensureBootstrapSuperAdmin } from "./bootstrap-super-admin.js";
import { seedTaxonomies } from "./taxonomies.js";

const database = createPrismaClient();

async function seed() {
  const superAdmin = await ensureBootstrapSuperAdmin(database, {
    email: process.env["BOOTSTRAP_SUPER_ADMIN_EMAIL"],
    password: process.env["BOOTSTRAP_SUPER_ADMIN_PASSWORD"],
  });
  if (superAdmin.created) {
    console.info(`Bootstrapped super admin account: ${superAdmin.email}`);
  }

  const organization = await database.organization.upsert({
    where: { slug: "atlas-manufacturing" },
    update: {},
    create: { name: "Atlas Manufacturing", slug: "atlas-manufacturing" },
  });

  const owner = await database.user.upsert({
    where: { email: "owner@example.invalid" },
    update: {},
    create: {
      name: "Sample Owner",
      email: "owner@example.invalid",
      emailVerified: true,
    },
  });

  await database.member.upsert({
    where: {
      organizationId_userId: { organizationId: organization.id, userId: owner.id },
    },
    update: { role: "owner", status: "active" },
    create: {
      organizationId: organization.id,
      userId: owner.id,
      role: "owner",
      status: "active",
    },
  });

  const site = await database.site.upsert({
    where: {
      organizationId_code: { organizationId: organization.id, code: "CAS-01" },
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Casablanca Plant",
      code: "CAS-01",
      address: "Casablanca, Morocco",
      tags: ["manufacturing"],
    },
  });

  await database.audit.create({
    data: {
      organizationId: organization.id,
      siteId: site.id,
      title: "Sample ISO 45001 readiness audit",
      status: "DRAFT",
    },
  });

  await seedTaxonomies(database);
}

seed()
  .finally(async () => database.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
