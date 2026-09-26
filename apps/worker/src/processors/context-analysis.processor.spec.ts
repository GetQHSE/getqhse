import { describe, expect, it } from "vitest";

import { internalIssuesMaterial, sanitizeSynthesizedIssues } from "./context-analysis.processor.js";
import { sameMethods } from "./context-material.js";

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

describe("internalIssuesMaterial", () => {
  it("references the retained internal issues I1, I2, … for the synthesis to rate", () => {
    expect(
      internalIssuesMaterial([
        {
          title: "Circulation insuffisante de l’information",
          description: "Des informations utiles arrivent tard.",
          nature: "faiblesse",
          categoryLabel: "Organisation",
        },
        {
          title: "Expertise métier élevée",
          description: null,
          nature: "force",
          categoryLabel: null,
        },
      ]),
    ).toBe(
      [
        "I1. [faiblesse · Organisation] Circulation insuffisante de l’information",
        "   Des informations utiles arrivent tard.",
        "I2. [force] Expertise métier élevée",
      ].join("\n"),
    );
  });
});

describe("sameMethods", () => {
  it("matches a run made with exactly the selected methods, whatever their order", () => {
    expect(sameMethods(["PESTEL", "SWOT"], ["SWOT", "PESTEL"])).toBe(true);
    expect(sameMethods(["SWOT"], ["SWOT", "PESTEL"])).toBe(false);
    expect(sameMethods(undefined, ["SWOT"])).toBe(false);
  });
});
