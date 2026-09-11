import { describe, expect, it, vi } from "vitest";

import { knowledgeEmbeddingInput, searchForPrompt } from "./knowledge-library.js";

describe("AI knowledge library", () => {
  it("builds embedding input from sanitized content without provenance", () => {
    const input = knowledgeEmbeddingInput({
      feature: "DISCOVERY",
      title: "Installations classées",
      scenarioSummary: "Site industriel avec stockage dangereux.",
      guidance: "Vérifier les seuils applicables.",
      jurisdiction: "MA",
      language: "fr",
      tags: ["industrie"],
      rating: 4,
      expectedResult: null,
      evaluationSignal: null,
      payload: {
        includedLaws: [
          {
            reference: "Loi 11-03",
            title: "Protection de l'environnement",
            reason: "Les impacts potentiels justifient son examen.",
          },
        ],
        excludedLaws: [],
      },
      sourceOrganizationId: "secret-org",
      sourceProjectId: "secret-project",
    } as never);

    expect(input).toContain("Installations classées");
    expect(input).toContain("Loi 11-03");
    expect(input).not.toContain("secret-org");
    expect(input).not.toContain("secret-project");
  });

  it("falls back to recent active examples for the requested feature only", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "example-1",
        feature: "CONFORMITY_EVALUATION",
        title: "Preuve expirée",
        scenarioSummary: "Une preuve existe mais sa validation est expirée.",
        guidance: null,
        jurisdiction: "MA",
        language: "fr",
        tags: [],
        rating: null,
        expectedResult: "PARTIAL",
        evaluationSignal: "CORRECTION",
        payload: {
          lawReference: "Loi 11-03",
          lawTitle: "Protection de l'environnement",
          requirementSummary: "Conserver une preuve documentaire à jour.",
          rationale: "La preuve n'est plus valide.",
          remediationGuidance: "Faire renouveler la validation.",
        },
      },
    ]);
    const database = {
      embeddingProfile: { findFirst: vi.fn().mockResolvedValue(null) },
      aiKnowledgeExample: { findMany },
    };

    const results = await searchForPrompt(database as never, {
      feature: "CONFORMITY_EVALUATION",
      queryText: "preuve documentaire",
      jurisdiction: "MA",
      language: "fr",
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          feature: "CONFORMITY_EVALUATION",
          status: "ACTIVE",
          embeddingStatus: "COMPLETED",
        }),
        take: 5,
      }),
    );
  });
});
