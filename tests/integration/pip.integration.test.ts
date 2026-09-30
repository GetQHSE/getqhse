import { readFile, readdir } from "node:fs/promises";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";
import type { PipRegister, PipMaterial, PipLaunch } from "@qhse/contracts";
import { smqPip } from "@qhse/domain";
import { GenericContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PipService } from "../../apps/client-api/src/modules/pip/application/pip.service.js";
import { PipAnalysisProcessor } from "../../apps/worker/src/processors/pip-analysis.processor.js";

const suite = describe.skipIf(process.env["TESTCONTAINERS_ENABLED"] !== "true");
suite("PIP persisted workflow", () => {
  let postgres: Awaited<ReturnType<GenericContainer["start"]>>;
  let database: DatabaseClient;
  let service: PipService;
  let worker: PipAnalysisProcessor;
  let register: PipRegister;
  const tenant = { organizationId: "org-pip", userId: "user-pip", role: "owner" };
  const generate =
    vi.fn<
      (
        stage: PipLaunch["stage"],
        material: PipMaterial,
        schema: unknown,
      ) => Promise<{ output: unknown; model: string }>
    >();
  const queue = { enqueue: vi.fn().mockResolvedValue({}) };
  beforeAll(async () => {
    postgres = await new GenericContainer("pgvector/pgvector:0.8.6-pg18")
      .withEnvironment({
        POSTGRES_DB: "pip_test",
        POSTGRES_USER: "pip_test",
        POSTGRES_PASSWORD: "pip_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    const url = `postgresql://pip_test:pip_test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/pip_test`;
    const { Client } = await import("pg");
    const migrationClient = new Client({ connectionString: url });
    await migrationClient.connect();
    const root = new URL("../../packages/database/prisma/migrations/", import.meta.url);
    const migrations = (await readdir(root, { withFileTypes: true }))
      .filter((x) => x.isDirectory())
      .map((x) => x.name)
      .sort();
    for (const migration of migrations)
      await migrationClient.query(
        await readFile(new URL(`${migration}/migration.sql`, root), "utf8"),
      );
    await migrationClient.end();
    database = createPrismaClient(url);
    await database.user.create({
      data: { id: tenant.userId, name: "PIP Reviewer", email: "pip-reviewer@example.test" },
    });
    await database.organization.create({
      data: { id: tenant.organizationId, name: "PIP Organisation", slug: "pip-organisation" },
    });
    await database.project.create({
      data: {
        id: "project-pip",
        organizationId: tenant.organizationId,
        createdById: tenant.userId,
        name: "Repair project",
        slug: "repair-project",
        entityType: "COMPANY",
        countryCode: "MA",
        language: "en",
        profile: {
          create: {
            snapshots: {
              create: {
                sequence: 1,
                schemaVersion: 1,
                contentHash: "profile-pip",
                completenessPercent: 100,
                regulatoryReadiness: 100,
                data: { fields: { "organization.mission": "Repair services" } },
              },
            },
          },
        },
      },
    });
    service = new PipService(queue as never, database);
    vi.stubEnv("DATABASE_URL", url);
    worker = new PipAnalysisProcessor();
    (worker as unknown as { database: DatabaseClient }).database = database;
    (worker as unknown as { generate: typeof generate }).generate = generate;
  });
  afterAll(async () => {
    await database?.$disconnect();
    await postgres?.stop();
    vi.unstubAllEnvs();
  });
  async function process(runId: string) {
    await worker.process({
      data: { organizationId: tenant.organizationId, payload: { runId } },
    } as never);
    register = await service.register(tenant, "project-pip");
    expect(register.runs.find((r) => r.id === runId)?.status).toBe("COMPLETED");
  }
  const proposed = {
    name: "Customers",
    description: "Customers using repair services",
    category: "Customers",
    scope: "external",
    relevance: "relevant",
    reasoning: "Declared activity",
    confidence: 0.8,
    evidence: [{ sourceType: "profile", reference: null, excerpt: "Repair services" }],
  };
  it("migrates cleanly, isolates tenants, and generates pending proposals only on launch", async () => {
    expect((await service.register(tenant, "repair-project")).parties).toHaveLength(0);
    expect(queue.enqueue).not.toHaveBeenCalled();
    await expect(
      service.register({ ...tenant, organizationId: "other-org" }, "project-pip"),
    ).rejects.toMatchObject({ status: 404 });
    generate.mockResolvedValueOnce({
      output: { parties: [proposed], clarifications: [] },
      model: "test-model",
    });
    const { runId } = await service.launch(tenant, "project-pip", {
      stage: "INVENTORY",
      method: "both",
    });
    expect(queue.enqueue).toHaveBeenCalledWith(
      "pip-analysis",
      "run-pip-analysis",
      expect.objectContaining({ organizationId: tenant.organizationId }),
    );
    await process(runId);
    expect(register.parties[0]?.reviewStatus).toBe("PENDING");
    const run = await database.pipRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.inputSnapshot).toHaveProperty("language", "en");
    await worker.process({
      data: { organizationId: tenant.organizationId, payload: { runId } },
    } as never);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("enforces server-side review prerequisites and persists requirements and assignments", async () => {
    await expect(
      service.launch(tenant, "project-pip", { stage: "REQUIREMENTS", method: "both" }),
    ).rejects.toMatchObject({ status: 400 });
    const party = register.parties[0]!;
    register = await service.review(tenant, "project-pip", {
      entityType: "party",
      entityId: party.id,
      reviewStatus: "VALIDATED",
      reason: "Customer relevance reviewed",
    });
    const base = {
      reasoning: "Customer expectations",
      sourceType: "ai_recommendation",
      regulatoryEntryId: null,
      sourceLabel: null,
      sourceUrl: null,
    };
    generate.mockResolvedValueOnce({
      output: {
        parties: [
          {
            partyId: party.id,
            items: [
              { ...base, kind: "need", text: "Reliable repair services", services: [] },
              {
                ...base,
                kind: "qms_requirement",
                text: "Check repair quality",
                services: ["Quality"],
              },
            ],
          },
        ],
      },
      model: "test-model",
    });
    await process(
      (await service.launch(tenant, "project-pip", { stage: "REQUIREMENTS", method: "both" }))
        .runId,
    );
    await expect(
      service.launch(tenant, "project-pip", { stage: "EVALUATION", method: "both" }),
    ).rejects.toMatchObject({ status: 400 });
    for (const item of register.parties[0]!.requirements)
      await service.review(tenant, "project-pip", {
        entityType: "requirement",
        entityId: item.id,
        reviewStatus: "VALIDATED",
        reason: "Requirement reviewed",
      });
    register = await service.register(tenant, "project-pip");
    const item = register.parties[0]!.requirements.find(
      (r) => r.content.kind === "qms_requirement",
    )!;
    expect(smqPip.computePipWorkflow(register.parties).completion[2]).toBe(false);
    register = await service.allocate(tenant, "project-pip", {
      requirementId: item.id,
      services: ["Quality"],
      noServiceConfirmed: false,
      reason: "Quality responsibility confirmed",
    });
    expect(smqPip.computePipWorkflow(register.parties).completion[2]).toBe(true);
  });
  it("evaluates reviewed material, audits decisions, and explicitly validates the final register", async () => {
    const party = register.parties[0]!;
    generate.mockResolvedValueOnce({
      output: {
        evaluations: [
          {
            partyId: party.id,
            content: {
              power: 3,
              interest: 5,
              impact: 2,
              requirementLevel: 3,
              monitoringMethod: "Customer survey",
              monitoringFrequency: "Quarterly",
              reasoning: "Customer satisfaction",
            },
          },
        ],
      },
      model: "test-model",
    });
    await process(
      (await service.launch(tenant, "project-pip", { stage: "EVALUATION", method: "both" })).runId,
    );
    const snapshot = generate.mock.calls.at(-1)![1];
    const snapshotParty = snapshot.parties[0];
    if (!snapshotParty) throw new Error("Evaluation snapshot must contain the retained party");
    expect(snapshotParty.requirements.every((r) => r.reviewStatus === "VALIDATED")).toBe(true);
    const snapshotRequirement = snapshotParty.requirements.find(
      (r) => r.content.kind === "qms_requirement",
    );
    if (!snapshotRequirement)
      throw new Error("Evaluation snapshot must contain the reviewed QMS requirement");
    expect(snapshotRequirement.allocationReviewed).toBe(true);
    await expect(service.validate(tenant, "project-pip")).rejects.toMatchObject({ status: 400 });
    register = await service.review(tenant, "project-pip", {
      entityType: "evaluation",
      entityId: register.parties[0]!.evaluation!.id,
      reviewStatus: "VALIDATED",
      reason: "Evaluation reviewed",
    });
    register = await service.validate(tenant, "project-pip");
    expect(register.validatedAt).not.toBeNull();
    expect(smqPip.pipRegisterRows(register.parties, "both", "en")[0]?.[10]).toBe("6");
    const publication = await database.pipCorrection.findFirstOrThrow({
      where: { projectId: "project-pip", entityType: "register" },
    });
    expect(publication.newValue).toHaveProperty("parties");
    expect(publication.authorId).toBe(tenant.userId);
  });
  it("preserves immutable proposals and corrections across regeneration and reopens stale decisions", async () => {
    const party = register.parties[0]!;
    const corrected = {
      ...party.content,
      description: "Customers with enterprise repair agreements",
    };
    await service.review(tenant, "project-pip", {
      entityType: "party",
      entityId: party.id,
      reviewStatus: "MODIFIED",
      content: corrected,
      reason: "Clarified enterprise scope",
    });
    await expect(
      database.pipParty.update({ where: { id: party.id }, data: { aiProposal: { forged: true } } }),
    ).rejects.toThrow(/immutable/);
    generate.mockResolvedValueOnce({
      output: { parties: [proposed], clarifications: [] },
      model: "test-model",
    });
    await process(
      (await service.launch(tenant, "project-pip", { stage: "INVENTORY", method: "both" })).runId,
    );
    expect(register.parties[0]!.content.description).toBe(corrected.description);
    expect(register.parties[0]!.reviewStatus).toBe("MODIFIED");
    await database.project.update({
      where: { id: "project-pip" },
      data: { description: "New expanded activity" },
    });
    expect((await service.register(tenant, "project-pip")).outdated).toBe(true);
    generate.mockResolvedValueOnce({
      output: { parties: [proposed], clarifications: [] },
      model: "test-model",
    });
    await process(
      (await service.launch(tenant, "project-pip", { stage: "INVENTORY", method: "both" })).runId,
    );
    expect(register.outdated).toBe(false);
    expect(register.parties[0]!.content.description).toBe(corrected.description);
    expect(register.parties[0]!.reviewStatus).toBe("PENDING");
    expect(register.parties[0]!.requirements.every((r) => r.reviewStatus === "PENDING")).toBe(true);
  });
  it("allows only one active run per project", async () => {
    const results = await Promise.allSettled([
      service.launch(tenant, "project-pip", { stage: "INVENTORY", method: "both" }),
      service.launch(tenant, "project-pip", { stage: "INVENTORY", method: "both" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((r) => r.status === "rejected");
    expect(failure?.status === "rejected" && failure.reason).toMatchObject({ status: 409 });
  });
});
