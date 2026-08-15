import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generated = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({
  embed: vi.fn(),
  generateText: generated,
  Output: { object: vi.fn(({ schema }) => ({ schema })) },
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: {
    responses: vi.fn(() => ({ modelId: "gpt-5.6-sol" })),
    embedding: vi.fn(() => ({ modelId: "embedding" })),
  },
}));

import { RegulatoryAnalysisProcessor } from "./regulatory-analysis.processor.js";

describe("independent regulatory requirement verification", () => {
  const previousDatabaseUrl = process.env["DATABASE_URL"];

  beforeEach(() => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    process.env["OPENAI_REGULATORY_MODEL"] = "gpt-5.6-sol";
    process.env["OPENAI_REGULATORY_REASONING_EFFORT"] = "xhigh";
    generated.mockReset();
  });

  afterEach(() => {
    if (previousDatabaseUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = previousDatabaseUrl;
    delete process.env["OPENAI_REGULATORY_MODEL"];
    delete process.env["OPENAI_REGULATORY_REASONING_EFFORT"];
  });

  it("retries drafting once with verifier feedback and accepts the corrected requirement", async () => {
    generated
      .mockResolvedValueOnce({
        output: {
          suggestion: "APPLICABLE",
          rationale: "Le projet emploie des salariés.",
          matchedProfileKeys: ["organization.employeeCount"],
          confidence: 0.96,
          clarificationQuestion: null,
          sourceQuality: "PASS",
          normativeRequirement: true,
          requirementText:
            "L’employeur doit préserver la sécurité et la santé des salariés et organiser une formation annuelle.",
          supportingExcerpts: ["préserver la sécurité, la santé et la dignité des salariés"],
          qualityIssues: [],
        },
        totalUsage: { inputTokens: 100, outputTokens: 50 },
      })
      .mockResolvedValueOnce({
        output: {
          supported: false,
          issues: ["La formation annuelle n’est pas mentionnée dans la disposition."],
        },
        totalUsage: { inputTokens: 40, outputTokens: 15 },
      })
      .mockResolvedValueOnce({
        output: {
          suggestion: "APPLICABLE",
          rationale: "Le projet emploie des salariés.",
          matchedProfileKeys: ["organization.employeeCount"],
          confidence: 0.98,
          clarificationQuestion: null,
          sourceQuality: "PASS",
          normativeRequirement: true,
          requirementText:
            "L’employeur doit prendre les mesures nécessaires pour préserver la sécurité, la santé et la dignité des salariés.",
          supportingExcerpts: [
            "prendre toutes les mesures nécessaires afin de préserver la sécurité, la santé et la dignité des salariés",
          ],
          qualityIssues: [],
        },
        totalUsage: { inputTokens: 110, outputTokens: 45 },
      })
      .mockResolvedValueOnce({
        output: { supported: true, issues: [] },
        totalUsage: { inputTokens: 40, outputTokens: 10 },
      });

    const processor = new RegulatoryAnalysisProcessor();
    const update = vi.fn().mockResolvedValue({});
    (processor as unknown as { database: object }).database = {
      regulatoryAnalysisRun: {
        findUnique: vi.fn().mockResolvedValue({ status: "RUNNING" }),
        update,
      },
    };
    const classify = (
      processor as unknown as {
        classifyProvisions(
          run: unknown,
          candidates: unknown[],
          changes: unknown[],
        ): Promise<
          Array<{
            requirementText: string | null;
            requirementStatus: string;
            requirementIssues: string[];
          }>
        >;
      }
    ).classifyProvisions.bind(processor);
    const candidates = await classify(
      {
        id: "run-1",
        profileSnapshot: { data: { fields: { "organization.employeeCount": 12 } } },
        baseBaseline: null,
        scopeFacts: [],
      },
      [
        {
          provisionId: "article-24",
          documentId: "code-travail",
          documentVersionId: "v1",
          documentTitle: "Code du travail",
          referenceNumber: "Loi n° 65-99",
          documentFamily: "regulation",
          provisionType: "article",
          identifier: "Article 24",
          title: null,
          headingPath: ["Livre premier"],
          language: "fr",
          content:
            "Article 24 — L’employeur est tenu de prendre toutes les mesures nécessaires afin de préserver la sécurité, la santé et la dignité des salariés.",
          contentHash: "hash-24",
          score: 1,
          previousEntryId: null,
          changeType: "ADDED",
          changeSummary: null,
          previousRationale: null,
          previousRequirementText: null,
          previousRequirementSupportingExcerpts: [],
        },
      ],
      [],
    );

    expect(generated).toHaveBeenCalledTimes(4);
    expect(candidates[0]).toMatchObject({
      requirementStatus: "READY",
      requirementIssues: [],
      requirementText:
        "L’employeur doit prendre les mesures nécessaires pour préserver la sécurité, la santé et la dignité des salariés.",
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          model: "gpt-5.6-sol",
          inputTokens: 290,
          outputTokens: 120,
        }),
      }),
    );
  });
});
