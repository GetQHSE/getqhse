import { describe, expect, it, vi } from "vitest";
import type { PipMaterial } from "@qhse/contracts";
vi.mock("@qhse/database", () => ({ createPrismaClient: vi.fn() }));
import { groundedPipRequirement, supportedPipParty } from "./pip-analysis.processor.js";
const material: PipMaterial = {
  language: "en",
  digest: "The organisation provides repairs.",
  issues: [],
  regulations: [
    {
      id: "law-1",
      title: "Published law",
      requirementText: "Provide accurate customer information.",
      sourceUrl: "https://official.example/law",
    },
  ],
  clarifications: [],
  method: "both",
  parties: [],
};
const item = {
  kind: "qms_requirement" as const,
  text: "Provide accurate customer information.",
  reasoning: "Customer information",
  sourceType: "legal_regulatory" as const,
  regulatoryEntryId: "law-1",
  sourceLabel: "Invented label",
  sourceUrl: "https://invented.example",
  services: ["Sales", "Sales"],
};
describe("PIP grounding", () => {
  it("takes source identity from supplied evidence rather than model claims", () => {
    expect(groundedPipRequirement(item, material)).toMatchObject({
      services: ["Sales"],
      content: {
        sourceType: "legal_regulatory",
        sourceLabel: "Published law",
        sourceUrl: "https://official.example/law",
      },
    });
  });
  it("downgrades unverified and invented legal requirements", () => {
    expect(
      groundedPipRequirement({ ...item, text: "Obtain an invented licence." }, material).content
        .sourceType,
    ).toBe("ai_recommendation");
    expect(
      groundedPipRequirement({ ...item, regulatoryEntryId: "other-tenant-law" }, material).content,
    ).toMatchObject({ sourceType: "ai_recommendation", regulatoryEntryId: null, sourceUrl: null });
  });
  it("does not manufacture obligations from discovered laws lacking verified text", () => {
    expect(
      groundedPipRequirement(item, {
        ...material,
        regulations: [{ ...material.regulations[0]!, requirementText: null }],
      }).content.sourceType,
    ).toBe("ai_recommendation");
  });
  it("does not present an ISO interpretation as a controlled normative requirement", () => {
    expect(
      groundedPipRequirement({ ...item, sourceType: "normative" }, material).content.sourceType,
    ).toBe("ai_recommendation");
  });
  it("rejects unsupported source excerpts", () => {
    const party = {
      name: "Customers",
      description: "Customers",
      category: "Clients",
      scope: "external" as const,
      relevance: "relevant" as const,
      reasoning: "Repairs",
      confidence: 0.8,
      evidence: [
        {
          sourceType: "profile" as const,
          reference: null,
          excerpt: "The organisation provides repairs.",
        },
      ],
    };
    expect(supportedPipParty(party, material)).toBe(true);
    expect(
      supportedPipParty(
        { ...party, evidence: [{ ...party.evidence[0]!, excerpt: "Invented customer contract" }] },
        material,
      ),
    ).toBe(false);
  });
});
