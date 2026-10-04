import { describe, expect, it } from "vitest";
import type { RoMaterial } from "@qhse/contracts";
import { validateRoGeneration } from "./ro-analysis.processor.js";
const source = {
  id: "source",
  branch: "pip_requirement" as const,
  title: "Customer quality",
  description: "Customer quality",
  partyId: "party",
  partyName: "Customers",
  kind: "need",
  fingerprint: "fp",
};
const material: RoMaterial = {
  language: "en",
  digest: "Repair services",
  sources: [source],
  items: [],
  referenceDate: "2026-09-30",
};
const proposal = {
  sourceId: "source",
  content: {
    type: "risk" as const,
    title: "Repair failure",
    description: "An uncertain negative event",
    causes: "Incomplete control",
    consequences: "Customer dissatisfaction",
    reasoning: "Customer quality",
    confidence: 0.8,
  },
  rating: {
    probability: 2,
    impact: 3,
    feasibility: null,
    benefit: null,
    priority: "P3" as const,
    reasoning: "Quality",
  },
};
describe("R&O output boundaries", () => {
  it("rejects invented source IDs", () => {
    expect(() =>
      validateRoGeneration({ items: [{ ...proposal, sourceId: "invented" }] }, material),
    ).toThrow("RO_SOURCE_INVALID");
  });
  it("limits each PIP requirement to one risk and one opportunity", () => {
    expect(() => validateRoGeneration({ items: [proposal, proposal] }, material)).toThrow(
      "RO_PIP_LIMIT_EXCEEDED",
    );
  });
  it("permits zero proposals without filling categories", () => {
    expect(() => validateRoGeneration({ items: [] }, material)).not.toThrow();
  });
  it("rejects risk scoring on an opportunity", () => {
    expect(() =>
      validateRoGeneration(
        { items: [{ ...proposal, content: { ...proposal.content, type: "opportunity" } }] },
        material,
      ),
    ).toThrow("RO_RATING_INVALID");
  });
  it("rejects an action disguised as an opportunity", () => {
    expect(() =>
      validateRoGeneration(
        {
          items: [
            {
              ...proposal,
              content: {
                ...proposal.content,
                type: "opportunity",
                title: "Implement a new system",
              },
              rating: {
                ...proposal.rating,
                probability: null,
                impact: null,
                feasibility: 3,
                benefit: 4,
              },
            },
          ],
        },
        material,
      ),
    ).toThrow("RO_ACTION_SHAPED_OPPORTUNITY");
  });
});
