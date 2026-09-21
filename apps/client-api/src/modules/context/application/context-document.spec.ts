import { describe, expect, it } from "vitest";
import type { ContextExternalFactor, ContextIssue } from "@qhse/contracts";

import { buildContextDocument, contextDocumentFileName } from "./context-document.js";

function issue(overrides: Partial<ContextIssue> = {}): ContextIssue {
  return {
    id: "issue-1",
    runId: "run-1",
    canonicalKey: "rotation-personnel",
    comparisonStatus: null,
    aiOrigin: "INTERNAL",
    aiCategoryKey: "ressources",
    aiCategoryLabel: "Ressources",
    aiTitle: "Rotation élevée du personnel",
    aiDescription: "Le taux de rotation dépasse la moyenne du secteur.",
    aiReasoning: null,
    aiNature: "faiblesse",
    aiImpactQuality: null,
    aiImpactCustomerSatisfaction: null,
    aiImpactOverall: null,
    aiScores: {},
    aiConfidence: null,
    aiRecommendedPriority: false,
    aiModel: "gpt-5-mini",
    aiGeneratedAt: "2026-09-01T00:00:00.000Z",
    origin: "INTERNAL",
    categoryKey: "ressources",
    categoryLabel: "Ressources",
    title: "Rotation élevée du personnel",
    description: "Le taux de rotation dépasse la moyenne du secteur.",
    nature: "faiblesse",
    impactQuality: null,
    impactCustomerSatisfaction: null,
    impactOverall: null,
    scores: {},
    selectedPriority: false,
    reviewStatus: "VALIDATED",
    humanOverride: false,
    humanReviewedAt: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    sourceKind: "AI",
    createdAt: "2026-09-01T00:00:00.000Z",
    evidence: [],
    corrections: [],
    ...overrides,
  };
}

function factor(overrides: Partial<ContextExternalFactor> = {}): ContextExternalFactor {
  return {
    id: "factor-1",
    runId: "extrun-1",
    categoryKey: "economique",
    categoryLabel: "Économique",
    title: "Hausse des coûts énergétiques",
    description: "Le prix de l'énergie a augmenté de 12% sur un an.",
    relevanceToCompany: "Impacte directement les coûts de production.",
    influenceOnObjectives: null,
    influenceOnQuality: null,
    influenceOnCustomerSatisfaction: null,
    geographicScope: "national",
    orientation: "defavorable",
    evidenceStrength: "solide",
    confidence: 0.8,
    sourceOrigin: "web_research",
    regulatoryEntryId: null,
    canonicalKey: "hausse-couts-energetiques",
    comparisonStatus: null,
    model: "gpt-5-mini",
    generatedAt: "2026-09-01T00:00:00.000Z",
    sources: [
      {
        id: "source-1",
        url: "https://statistiques.gouv.test/energie",
        title: "Statistiques énergie",
        publisher: "Ministère de l'Énergie",
        sourceDate: null,
        groundingOrigin: "search_grounding",
        excerpt: null,
        authorityTier: "grounded",
      },
    ],
    ...overrides,
  };
}

describe("buildContextDocument", () => {
  it("groups issues into SWOT quadrants only when SWOT was actually performed", () => {
    const doc = buildContextDocument({
      organizationName: "Org",
      projectName: "Usine Nord",
      isoStandard: "ISO_9001",
      method: "SWOT",
      methodExplicit: true,
      analysisDate: null,
      factors: [],
      issues: [issue()],
    });
    expect(doc.swot).not.toBeNull();
    expect(doc.pestel).toBeNull();
    expect(doc.swot?.[0]?.label).toBe("Faiblesses");
  });

  it("groups external issues by PESTEL dimension, and never creates a légal group", () => {
    const doc = buildContextDocument({
      organizationName: "Org",
      projectName: "Usine Nord",
      isoStandard: "ISO_9001",
      method: "PESTEL",
      methodExplicit: true,
      analysisDate: null,
      factors: [],
      issues: [
        issue({
          origin: "EXTERNAL",
          aiOrigin: "EXTERNAL",
          nature: "menace",
          categoryKey: "economique",
          categoryLabel: "Économique",
        }),
      ],
    });
    expect(doc.pestel).not.toBeNull();
    expect(doc.pestel?.some((group) => group.label === "Légal")).toBe(false);
    expect(doc.pestel?.find((group) => group.label === "Économique")?.issues).toHaveLength(1);
  });

  it("exposes only publisher names for a factor's sources, never the raw URL", () => {
    const doc = buildContextDocument({
      organizationName: "Org",
      projectName: "Usine Nord",
      isoStandard: "ISO_9001",
      method: "SWOT",
      methodExplicit: true,
      analysisDate: null,
      factors: [factor()],
      issues: [],
    });
    expect(doc.factors[0]!.publishers).toEqual(["Ministère de l'Énergie"]);
    expect(JSON.stringify(doc.factors[0])).not.toContain("https://");
  });

  it("labels a non-explicit method choice as a default, not a decision", () => {
    const doc = buildContextDocument({
      organizationName: "Org",
      projectName: "Usine Nord",
      isoStandard: "ISO_9001",
      method: "SWOT",
      methodExplicit: false,
      analysisDate: null,
      factors: [],
      issues: [],
    });
    expect(doc.methodLabel).toContain("par défaut");
  });

  it("summarizes review status counts without conflating pending with retained", () => {
    const doc = buildContextDocument({
      organizationName: "Org",
      projectName: "Usine Nord",
      isoStandard: "ISO_9001",
      method: "SWOT",
      methodExplicit: true,
      analysisDate: null,
      factors: [],
      issues: [
        issue({ id: "1", reviewStatus: "VALIDATED" }),
        issue({ id: "2", reviewStatus: "PENDING" }),
        issue({ id: "3", reviewStatus: "NOT_RETAINED" }),
        issue({ id: "4", reviewStatus: "MODIFIED" }),
      ],
    });
    expect(doc.summary).toMatchObject({
      issues: 4,
      retained: 2,
      pending: 1,
      notRetained: 1,
      corrected: 1,
    });
  });
});

describe("contextDocumentFileName", () => {
  it("slugifies the project name and appends today's date", () => {
    const doc = buildContextDocument({
      organizationName: "Org",
      projectName: "Usine du Nord — Site Principal",
      isoStandard: "ISO_9001",
      method: "SWOT",
      methodExplicit: true,
      analysisDate: null,
      factors: [],
      issues: [],
    });
    expect(contextDocumentFileName(doc, "xlsx")).toMatch(
      /^analyse-enjeux-usine-du-nord-site-principal-\d{4}-\d{2}-\d{2}\.xlsx$/,
    );
  });
});
