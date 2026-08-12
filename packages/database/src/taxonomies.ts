import type { DatabaseClient } from "./index.js";

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

/** Reference data the platform needs in every environment, production included. */
export async function seedTaxonomies(database: DatabaseClient): Promise<void> {
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
