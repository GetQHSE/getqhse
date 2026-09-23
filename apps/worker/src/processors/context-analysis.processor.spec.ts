import { describe, expect, it } from "vitest";

import { sanitizeSynthesizedIssues } from "./context-analysis.processor.js";

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
