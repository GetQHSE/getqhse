import { describe, expect, it } from "vitest";

import {
  collectCitations,
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

describe("collectCitations", () => {
  it("keeps grounded sources first, then URLs the model wrote in its own text", () => {
    const citations = collectCitations(
      [{ sourceType: "url", url: "https://grounded.test/a", title: "A" }],
      "Voir https://grounded.test/a et https://written.test/b.",
    );
    expect([...citations]).toEqual([
      ["https://grounded.test/a", { title: "A", origin: "search_grounding" }],
      ["https://written.test/b", { title: null, origin: "model_citation" }],
    ]);
  });
});

describe("sanitizeExternalFactors — URL normalization", () => {
  it("matches a URL the model copied without the search tool's utm_source, keeping the cited form", () => {
    const [factor] = sanitizeExternalFactors(
      [
        {
          title: "Trafic portuaire",
          relevanceToCompany: "Délais d'importation des vitrages.",
          sourceUrls: ["https://finances.gov.ma/Publication/depf/2026/nc_351.pdf/"],
        },
      ],
      new Set(["https://www.finances.gov.ma/Publication/depf/2026/nc_351.pdf?utm_source=openai"]),
    );
    expect(factor?.sourceUrls).toEqual([
      "https://www.finances.gov.ma/Publication/depf/2026/nc_351.pdf?utm_source=openai",
    ]);
  });
});
