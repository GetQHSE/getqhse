import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as AiSdk from "ai";
import type * as QhseAi from "@qhse/ai";
import type { PipMaterial } from "@qhse/contracts";
const { database, generateText } = vi.hoisted(() => ({
  database: {
    pipRun: { findFirst: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn() },
    pipState: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    pipParty: { upsert: vi.fn() },
    pipRequirement: { createMany: vi.fn() },
    pipClarification: { upsert: vi.fn() },
    pipEvaluation: { updateMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  generateText: vi.fn(),
}));
vi.mock("@qhse/database", () => ({ createPrismaClient: () => database }));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof AiSdk>()),
  generateText,
}));
vi.mock("@qhse/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof QhseAi>()),
  languageModel: vi.fn(() => ({})),
}));
import {
  groundedPipRequirement,
  supportedPipParty,
  PipAnalysisProcessor,
} from "./pip-analysis.processor.js";
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

const proposedParty = {
  name: "Customers",
  description: "Repair customers",
  category: "Clients",
  scope: "external" as const,
  relevance: "relevant" as const,
  reasoning: "Declared repairs",
  confidence: 0.8,
  evidence: [
    {
      sourceType: "profile" as const,
      reference: null,
      excerpt: "The organisation provides repairs.",
    },
  ],
};
describe("PIP inventory processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateText.mockReset();
    const run = {
      id: "run-1",
      projectId: "project-1",
      stage: "INVENTORY",
      status: "DRAFT",
      revision: 1,
      contextFingerprint: "context-1",
      inputSnapshot: material,
    };
    database.pipRun.findFirst.mockResolvedValue(run);
    database.pipRun.findUniqueOrThrow.mockResolvedValue(run);
    database.pipState.findUniqueOrThrow.mockResolvedValue({
      revision: 1,
      inventoryFingerprint: null,
    });
    database.$transaction.mockImplementation(async (callback: (tx: typeof database) => unknown) =>
      callback(database),
    );
  });
  const job = {
    data: { organizationId: "org-1", payload: { runId: "run-1" } },
    opts: { attempts: 3 },
    attemptsMade: 0,
  };
  it("completes inventory with faithful evidence differing only in whitespace", async () => {
    generateText.mockResolvedValue({
      output: {
        parties: [
          {
            ...proposedParty,
            evidence: [
              { ...proposedParty.evidence[0]!, excerpt: "The organisation\nprovides  repairs." },
            ],
          },
        ],
        clarifications: [],
      },
    });
    await new PipAnalysisProcessor().process(job as never);
    expect(database.pipParty.upsert).toHaveBeenCalled();
    expect(database.pipRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) }),
    );
  });
  it("keeps grounded parties and discards only unsupported evidence", async () => {
    generateText.mockResolvedValue({
      output: {
        parties: [
          {
            ...proposedParty,
            evidence: [
              ...proposedParty.evidence,
              { ...proposedParty.evidence[0]!, excerpt: "Invented contract" },
            ],
          },
        ],
        clarifications: [],
      },
    });
    await new PipAnalysisProcessor().process(job as never);
    expect(database.pipParty.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          effective: expect.objectContaining({ evidence: proposedParty.evidence }),
        }),
      }),
    );
    expect(database.pipRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) }),
    );
  });
  it("retries transient failures instead of silently completing the queue job as failed", async () => {
    generateText.mockRejectedValue(
      Object.assign(new Error("Rate limited"), { statusCode: 429, isRetryable: true }),
    );
    await expect(new PipAnalysisProcessor().process(job as never)).rejects.toThrow("Rate limited");
    expect(database.pipRun.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });
  it("recovers omitted parties by generating only the missing requirements", async () => {
    const input = {
      ...material,
      parties: [
        {
          id: "party-1",
          origin: "ai",
          content: proposedParty,
          aiProposal: null,
          reviewStatus: "VALIDATED",
          requirements: [],
          evaluation: null,
        },
        {
          id: "party-2",
          origin: "ai",
          content: { ...proposedParty, name: "Suppliers" },
          aiProposal: null,
          reviewStatus: "VALIDATED",
          requirements: [],
          evaluation: null,
        },
      ],
    };
    database.pipRun.findFirst.mockResolvedValue({
      id: "run-1",
      projectId: "project-1",
      stage: "REQUIREMENTS",
      status: "DRAFT",
      revision: 1,
      contextFingerprint: "context-1",
      inputSnapshot: input,
    });
    generateText
      .mockResolvedValueOnce({ output: { parties: [{ partyId: "party-1", items: [item] }] } })
      .mockResolvedValueOnce({ output: { parties: [{ partyId: "party-2", items: [item] }] } });
    await new PipAnalysisProcessor().process(job as never);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(JSON.parse(generateText.mock.calls[1]![0].prompt).parties).toEqual([input.parties[1]]);
    expect(database.pipRequirement.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ partyId: "party-1" }),
        expect.objectContaining({ partyId: "party-2" }),
      ]),
      skipDuplicates: true,
    });
    expect(database.pipRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) }),
    );
  });

  it("still fails without publishing an entirely fabricated inventory", async () => {
    generateText.mockResolvedValue({
      output: {
        parties: [
          {
            ...proposedParty,
            evidence: [{ ...proposedParty.evidence[0]!, excerpt: "Invented contract" }],
          },
        ],
        clarifications: [],
      },
    });
    await new PipAnalysisProcessor().process(job as never);
    expect(database.pipParty.upsert).not.toHaveBeenCalled();
    expect(database.pipRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "PIP_NO_SUPPORTED_PARTIES",
        }),
      }),
    );
  });
});
