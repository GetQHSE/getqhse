import { describe, expect, it } from "vitest";

import {
  buildDigest,
  excludeLegalDimension,
  sanitizeExternalFactors,
} from "./context-external-research.processor.js";

describe("excludeLegalDimension", () => {
  it("drops the légal entry even when the model forgot to list it in excludedDimensions", () => {
    const entries = excludeLegalDimension([
      { dimension: "Politique" },
      { dimension: "Légal" },
      { dimension: "Économique" },
    ]);
    expect(entries.map((entry) => entry.dimension)).toEqual(["Politique", "Économique"]);
  });

  it("leaves a SWOT-style plan with no légal entry untouched", () => {
    const entries = excludeLegalDimension([
      { dimension: "Concurrentiel" },
      { dimension: "Technologique" },
    ]);
    expect(entries).toHaveLength(2);
  });
});

describe("sanitizeExternalFactors", () => {
  const citedUrls = new Set(["https://real-source.test/a", "https://real-source.test/b"]);

  it("drops a factor whose sourceUrls do not match any real citation", () => {
    const result = sanitizeExternalFactors(
      [
        {
          title: "Hausse des coûts énergétiques",
          relevanceToCompany: "Impacte directement les coûts de production.",
          sourceUrls: ["https://hallucinated.test/x"],
        },
      ],
      citedUrls,
    );
    expect(result).toHaveLength(0);
  });

  it("keeps a factor and strips only the URLs that were not actually cited", () => {
    const result = sanitizeExternalFactors(
      [
        {
          title: "Hausse des coûts énergétiques",
          relevanceToCompany: "Impacte directement les coûts de production.",
          sourceUrls: ["https://real-source.test/a", "https://hallucinated.test/x"],
        },
      ],
      citedUrls,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.sourceUrls).toEqual(["https://real-source.test/a"]);
  });

  it("drops a factor missing a title or a relevance statement", () => {
    const result = sanitizeExternalFactors(
      [
        { title: "", relevanceToCompany: "x", sourceUrls: ["https://real-source.test/a"] },
        { title: "x", relevanceToCompany: "   ", sourceUrls: ["https://real-source.test/a"] },
      ],
      citedUrls,
    );
    expect(result).toHaveLength(0);
  });
});

describe("buildDigest", () => {
  const project = {
    name: "Usine Nord",
    entityType: "COMPANY",
    description: "Fabrication de pièces automobiles.",
    standardCode: "ISO_9001",
  };

  it("tells the model never to search the légal dimension when the veille is empty", () => {
    const digest = buildDigest({
      project,
      snapshot: {},
      internalInputs: [],
      registerEntries: [],
    });
    expect(digest).toContain("ne doit PAS être recherchée ici");
  });

  it("lists the published register entries instead, when the veille has content", () => {
    const digest = buildDigest({
      project,
      snapshot: {},
      internalInputs: [],
      registerEntries: [{ citationLabel: "Code du travail — Art. 24", sourceReference: "Art. 24" }],
    });
    expect(digest).toContain("Code du travail — Art. 24 (Art. 24)");
  });

  it("groups internal inputs by section", () => {
    const digest = buildDigest({
      project,
      snapshot: {},
      internalInputs: [
        { sectionKey: "culture_valeurs", questionLabel: "Climat social ?", answerText: "Bon" },
      ],
      registerEntries: [],
    });
    expect(digest).toContain("## culture_valeurs");
    expect(digest).toContain("Climat social ?");
  });
});
