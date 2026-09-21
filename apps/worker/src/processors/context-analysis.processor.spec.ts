import { describe, expect, it } from "vitest";

import { buildDigest, sanitizeSynthesizedIssues } from "./context-analysis.processor.js";

describe("sanitizeSynthesizedIssues", () => {
  const base = {
    title: "Rotation élevée du personnel",
    description: "Le taux de rotation dépasse la moyenne du secteur.",
    evidence: [{ excerpt: "Turnover de 24% sur douze mois." }],
  };

  it("keeps an issue with at least one real piece of evidence", () => {
    expect(sanitizeSynthesizedIssues([base])).toHaveLength(1);
  });

  it("drops an issue with no evidence at all", () => {
    expect(sanitizeSynthesizedIssues([{ ...base, evidence: [] }])).toHaveLength(0);
  });

  it("drops an issue whose only evidence entries are blank", () => {
    expect(sanitizeSynthesizedIssues([{ ...base, evidence: [{ excerpt: "   " }] }])).toHaveLength(
      0,
    );
  });

  it("drops an issue missing a title or a description", () => {
    expect(sanitizeSynthesizedIssues([{ ...base, title: "" }])).toHaveLength(0);
    expect(sanitizeSynthesizedIssues([{ ...base, description: "  " }])).toHaveLength(0);
  });
});

describe("buildDigest", () => {
  const project = {
    name: "Usine Nord",
    entityType: "COMPANY",
    description: "Fabrication de pièces automobiles.",
    standardCode: "ISO_9001",
  };

  it("tells the model the légal dimension must not be searched when the veille is empty", () => {
    const digest = buildDigest({ project, snapshot: {}, internalInputs: [], registerEntries: [] });
    expect(digest).toContain("ne doit PAS être recherchée ici");
  });

  it("carries the published register entries into the digest", () => {
    const digest = buildDigest({
      project,
      snapshot: {},
      internalInputs: [],
      registerEntries: [{ citationLabel: "Code du travail — Art. 24", sourceReference: null }],
    });
    expect(digest).toContain("Code du travail — Art. 24");
  });
});
