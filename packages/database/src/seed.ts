import { createPrismaClient } from "./index.js";
import { ensureBootstrapSuperAdmin } from "./bootstrap-super-admin.js";

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

  const taxonomySeeds = [
    {
      key: "qhse_domain",
      name: "QHSE domain",
      terms: [
        "quality",
        "health",
        "safety",
        "environment",
        "food_safety",
        "energy",
        "information_security",
        "social_responsibility",
        "business_continuity",
        "general_management",
      ],
    },
    {
      key: "industry",
      name: "Industry",
      terms: [
        "construction",
        "manufacturing",
        "food",
        "automotive",
        "energy",
        "mining",
        "healthcare",
        "logistics",
        "hospitality",
        "public_sector",
        "general",
      ],
    },
    {
      key: "jurisdiction",
      name: "Jurisdiction",
      terms: ["international", "morocco", "regional", "organization_internal"],
    },
    {
      key: "legal_category",
      name: "Legal category",
      terms: ["binding", "regulatory_guidance", "voluntary_standard", "internal_control"],
    },
    {
      key: "applicability",
      name: "Applicability",
      terms: ["general", "sector_specific", "site_specific", "activity_specific"],
    },
    {
      key: "risk_domain",
      name: "Risk domain",
      terms: ["legal", "operational", "occupational", "environmental", "product", "information"],
    },
  ];
  for (const taxonomySeed of taxonomySeeds) {
    const taxonomy = await database.taxonomy.upsert({
      where: { key: taxonomySeed.key },
      update: { name: taxonomySeed.name, isActive: true },
      create: { key: taxonomySeed.key, name: taxonomySeed.name },
    });
    for (const [sortOrder, key] of taxonomySeed.terms.entries()) {
      await database.taxonomyTerm.upsert({
        where: { taxonomyId_key: { taxonomyId: taxonomy.id, key } },
        update: { label: key.replaceAll("_", " "), sortOrder, isActive: true },
        create: { taxonomyId: taxonomy.id, key, label: key.replaceAll("_", " "), sortOrder },
      });
    }
  }
}

seed()
  .finally(async () => database.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
