import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generated = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({
  generateText: generated,
  Output: { object: vi.fn(({ schema }) => ({ schema })) },
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: { responses: vi.fn(() => ({ modelId: "gpt-5-mini" })) },
}));

import {
  RegulatoryEvaluationProcessor,
  normalizeConformityAssessment,
  type GeneratedConformityAssessment,
} from "./regulatory-evaluation.processor.js";

function assessment(
  overrides: Partial<GeneratedConformityAssessment> = {},
): GeneratedConformityAssessment {
  return {
    suggestedResult: "CONFORMING",
    rationale: "Les informations déclarées décrivent explicitement la pratique attendue.",
    confidence: 0.9,
    matchedProfileKeys: ["operations.keyProcesses"],
    missingInformation: [],
    remediationPlan: null,
    action: {
      title: null,
      resources: null,
      startDate: null,
      dueDate: null,
      responsible: null,
      effectivenessCriteria: null,
    },
    ...overrides,
  };
}

describe("regulatory conformity normalization", () => {
  it("conservatively marks an uncertain assessment as non-conforming", () => {
    const result = normalizeConformityAssessment(
      assessment({ confidence: 0.42 }),
      JSON.stringify({ fields: {} }),
    );

    expect(result.suggestedResult).toBe("NON_CONFORMING");
    expect(result.missingInformation).toEqual([
      "Les informations disponibles ne permettent pas de démontrer la conformité.",
    ]);
    expect(result.remediationPlan).toContain("preuves manquantes");
  });

  it("keeps planning fields empty when they are not explicit in the project context", () => {
    const result = normalizeConformityAssessment(
      assessment({
        suggestedResult: "NON_CONFORMING",
        remediationPlan: "Formaliser puis vérifier la pratique attendue par l’exigence applicable.",
        action: {
          title: "Formaliser la pratique",
          resources: "Budget de 10 000 MAD",
          startDate: "2026-09-01",
          dueDate: "2026-10-01",
          responsible: "Responsable QHSE",
          effectivenessCriteria: "La pratique est documentée et appliquée.",
        },
      }),
      JSON.stringify({ fields: { "operations.keyProcesses": "Contrôle mensuel" } }),
    );

    expect(result.action).toMatchObject({
      resources: null,
      startDate: null,
      dueDate: null,
      responsible: null,
    });
    expect(result.action.title).toBe("Formaliser la pratique");
  });

  it("retains explicit, high-confidence planning information", () => {
    const result = normalizeConformityAssessment(
      assessment({
        suggestedResult: "NON_CONFORMING",
        remediationPlan: "Formaliser puis vérifier la pratique attendue par l’exigence applicable.",
        action: {
          title: "Formaliser la pratique",
          resources: "Registre QHSE",
          startDate: "2026-09-01",
          dueDate: "2026-10-01",
          responsible: "Responsable QHSE",
          effectivenessCriteria: "La pratique est documentée et appliquée.",
        },
      }),
      JSON.stringify({
        resources: "Registre QHSE",
        startDate: "2026-09-01",
        dueDate: "2026-10-01",
        responsible: "Responsable QHSE",
      }),
    );

    expect(result.action).toMatchObject({
      resources: "Registre QHSE",
      startDate: "2026-09-01",
      dueDate: "2026-10-01",
      responsible: "Responsable QHSE",
    });
  });
});

type AiStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

function conformityOutput(suggestedResult: "CONFORMING" | "NON_CONFORMING" = "CONFORMING") {
  return {
    output: {
      suggestedResult,
      rationale: "Les informations déclarées décrivent explicitement la pratique attendue.",
      confidence: 0.92,
      matchedProfileKeys: [],
      missingInformation: [],
      remediationPlan:
        suggestedResult === "CONFORMING"
          ? null
          : "Formaliser puis vérifier la pratique attendue par l’exigence.",
      action: {
        title: null,
        resources: null,
        startDate: null,
        dueDate: null,
        responsible: null,
        effectivenessCriteria: null,
      },
    },
    totalUsage: { inputTokens: 100, outputTokens: 40 },
  };
}

function baselineWith(entries: Array<{ id: string; aiStatus: AiStatus }>) {
  return {
    id: "baseline-1",
    analysisRunId: "run-1",
    profileSnapshot: { data: { fields: {} } },
    entries: entries.map((entry, index) => ({
      provisionId: `provision-${index + 1}`,
      requirementText: "L’organisme doit déterminer et fournir les ressources nécessaires.",
      applicabilityRationale: "Applicable aux activités déclarées.",
      requirementSupportingExcerpts: [],
      provision: {
        sourceIdentifier: `7.1.${index + 1}`,
        content: "L’organisme doit déterminer et fournir les ressources nécessaires.",
        version: { document: { referenceNumber: "ISO 9001:2015", title: "SMQ" } },
      },
      evaluation: {
        id: entry.id,
        evaluatedAt: null,
        result: "NOT_ASSESSED",
        aiStatus: entry.aiStatus,
        evidence: [],
      },
    })),
  };
}

function harness(baseline: ReturnType<typeof baselineWith>) {
  const processor = new RegulatoryEvaluationProcessor();
  const evaluationUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  let callSequence = 0;
  const database = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([]),
    regulatoryBaseline: { findFirst: vi.fn().mockResolvedValue(baseline) },
    regulatoryEvaluation: { updateMany: evaluationUpdateMany },
    regulatoryModelCall: {
      aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
      create: vi.fn().mockImplementation(async () => ({ id: `call-${++callSequence}` })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (input: unknown) =>
      typeof input === "function"
        ? (input as (tx: typeof database) => Promise<unknown>)(database)
        : Promise.all(input as Promise<unknown>[]),
    ),
  };
  (processor as unknown as { database: object }).database = database;
  const job = {
    id: "job-1",
    attemptsMade: 0,
    opts: { attempts: 5 },
    data: {
      organizationId: "org-1",
      correlationId: "correlation-1",
      idempotencyKey: "baseline-1:evaluation",
      payload: { baselineId: "baseline-1" },
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  };
  const statusFor = (evaluationId: string) =>
    evaluationUpdateMany.mock.calls
      .filter((call) => {
        const where = call[0].where as { id?: string | { in: string[] } };
        return typeof where.id === "string"
          ? where.id === evaluationId
          : Boolean(where.id?.in.includes(evaluationId));
      })
      .map((call) => (call[0].data as { aiStatus: string }).aiStatus);
  return { processor, job, database, statusFor };
}

describe("regulatory conformity evaluation pass", () => {
  const previousDatabaseUrl = process.env["DATABASE_URL"];

  beforeEach(() => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    process.env["OPENAI_API_KEY"] = "test-key";
    generated.mockReset();
  });

  afterEach(() => {
    if (previousDatabaseUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = previousDatabaseUrl;
    delete process.env["OPENAI_API_KEY"];
    delete process.env["REGULATORY_EVALUATION_BUDGET_MICRO_USD"];
  });

  it("keeps evaluating the baseline after one requirement fails", async () => {
    generated
      .mockResolvedValueOnce(conformityOutput())
      .mockRejectedValueOnce(new Error("Model output did not match the schema"))
      .mockResolvedValueOnce(conformityOutput("NON_CONFORMING"));
    const { processor, job, statusFor } = harness(
      baselineWith([
        { id: "evaluation-1", aiStatus: "PENDING" },
        { id: "evaluation-2", aiStatus: "PENDING" },
        { id: "evaluation-3", aiStatus: "PENDING" },
      ]),
    );

    await expect(processor.process(job as never)).resolves.toMatchObject({
      evaluated: 2,
      failed: 1,
    });

    expect(statusFor("evaluation-1")).toContain("COMPLETED");
    expect(statusFor("evaluation-2")).toContain("FAILED");
    expect(statusFor("evaluation-3")).toContain("COMPLETED");
  });

  it("skips already failed evaluations so they cannot starve a retry", async () => {
    generated.mockResolvedValue(conformityOutput());
    const { processor, job, statusFor } = harness(
      baselineWith([
        { id: "evaluation-1", aiStatus: "FAILED" },
        { id: "evaluation-2", aiStatus: "COMPLETED" },
        { id: "evaluation-3", aiStatus: "PENDING" },
      ]),
    );

    await expect(processor.process(job as never)).resolves.toMatchObject({ evaluated: 1 });

    expect(generated).toHaveBeenCalledTimes(1);
    expect(statusFor("evaluation-1")).toEqual([]);
    expect(statusFor("evaluation-2")).toEqual([]);
    expect(statusFor("evaluation-3")).toContain("COMPLETED");
  });

  it("records every model call in the ledger and stops at the budget ceiling", async () => {
    process.env["REGULATORY_EVALUATION_BUDGET_MICRO_USD"] = "1";
    generated.mockResolvedValue(conformityOutput());
    const { processor, job, database, statusFor } = harness(
      baselineWith([
        { id: "evaluation-1", aiStatus: "PENDING" },
        { id: "evaluation-2", aiStatus: "PENDING" },
      ]),
    );

    await expect(processor.process(job as never)).resolves.toMatchObject({
      evaluated: 0,
      failed: 2,
    });

    expect(generated).not.toHaveBeenCalled();
    expect(database.regulatoryModelCall.create).not.toHaveBeenCalled();
    expect(statusFor("evaluation-1")).toContain("FAILED");
    expect(statusFor("evaluation-2")).toContain("FAILED");
  });

  it("reserves and settles a ledger entry for each evaluated requirement", async () => {
    generated.mockResolvedValue(conformityOutput());
    const { processor, job, database } = harness(
      baselineWith([{ id: "evaluation-1", aiStatus: "PENDING" }]),
    );

    await processor.process(job as never);

    expect(database.regulatoryModelCall.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runId: "run-1",
          provisionId: "provision-1",
          stage: "conformity_evaluation",
          attempt: 1,
        }),
      }),
    );
    expect(database.regulatoryModelCall.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SUCCEEDED", inputTokens: 100, outputTokens: 40 }),
      }),
    );
  });
});
