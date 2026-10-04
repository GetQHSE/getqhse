import { PlanningProcessor } from "../../apps/worker/src/processors/planning.processor.js";
import { readFile, readdir } from "node:fs/promises";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";
import { smqPlanning, smqScope } from "@qhse/domain";
import {
  planningDocumentSchema,
  scopeDeclarationSchema,
  type PlanningRegister,
} from "@qhse/contracts";
import { GenericContainer, Wait } from "testcontainers";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { PlanningService } from "../../apps/client-api/src/modules/planning/application/planning.service.js";
import {
  loadScopeFacts,
  scopeFingerprint,
} from "../../apps/client-api/src/modules/scope/application/scope-material.js";
const suite = describe.skipIf(process.env["TESTCONTAINERS_ENABLED"] !== "true");
suite("Persisted quality policy and process mapping", () => {
  let postgres: Awaited<ReturnType<GenericContainer["start"]>>,
    db: DatabaseClient,
    service: PlanningService,
    policy: PlanningRegister,
    processes: PlanningRegister;
  const tenant = { organizationId: "org-plan", userId: "user-plan", role: "owner" },
    queue = { enqueue: vi.fn().mockResolvedValue({}) };
  const document = () =>
    planningDocumentSchema.parse({
      ...smqPlanning.emptyDocument(),
      directions: {
        priorities: ["customer_satisfaction"],
        otherPriority: "",
        style: "engage",
        signatoryName: "Reviewer",
        signatoryRole: "Director",
        internalNote: "",
      },
      axes: [
        {
          id: "a",
          decision: "retained",
          title: "Service quality",
          rationale: "Maintain professional service quality",
        },
      ],
      statement:
        "We commit to continually improving service quality, meeting applicable requirements and reviewing customer needs. ".repeat(
          14,
        ),
    });
  beforeAll(async () => {
    postgres = await new GenericContainer("pgvector/pgvector:0.8.6-pg18")
      .withEnvironment({
        POSTGRES_DB: "planning_test",
        POSTGRES_USER: "planning_test",
        POSTGRES_PASSWORD: "planning_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    const url = `postgresql://planning_test:planning_test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/planning_test`;
    const { Client } = await import("pg");
    const pg = new Client({ connectionString: url });
    await pg.connect();
    const root = new URL("../../packages/database/prisma/migrations/", import.meta.url);
    for (const m of (await readdir(root, { withFileTypes: true }))
      .filter((x) => x.isDirectory())
      .map((x) => x.name)
      .sort())
      await pg.query(await readFile(new URL(`${m}/migration.sql`, root), "utf8"));
    await pg.end();
    db = createPrismaClient(url);
    await db.user.create({
      data: { id: tenant.userId, name: "Reviewer", email: "planning@example.test" },
    });
    await db.organization.create({
      data: { id: tenant.organizationId, name: "Group", slug: "planning-group" },
    });
    await db.project.create({
      data: {
        id: "p-plan",
        organizationId: tenant.organizationId,
        createdById: tenant.userId,
        name: "Atlas",
        slug: "atlas-plan",
        entityType: "COMPANY",
        countryCode: "MA",
        language: "en",
      },
    });
    const facts = await loadScopeFacts(db, "p-plan"),
      declaration = scopeDeclarationSchema.parse(smqScope.emptyDeclaration()),
      fp = scopeFingerprint({ facts, declaration });
    await db.scopeState.create({
      data: { projectId: "p-plan", declaration: JSON.parse(JSON.stringify(declaration)) },
    });
    await db.scopeVerification.create({
      data: {
        id: "scope-review",
        projectId: "p-plan",
        fingerprint: fp,
        decision: {
          applicability: "applicable",
          justification: "Professional review of scope boundary",
          acknowledgedFindings: [],
        },
        authorId: tenant.userId,
      },
    });
    await db.scopeStatement.create({
      data: {
        projectId: "p-plan",
        status: "VALIDATED",
        version: 1,
        statement: "Atlas repair services scope",
        nonApplicable: [],
        aiProposal: {},
        fingerprint: fp,
        verificationId: "scope-review",
        sourceSnapshot: {},
        validatedAt: new Date(),
        validatedById: tenant.userId,
      },
    });
    vi.stubEnv("DATABASE_URL", url);
    service = new PlanningService(queue as never, db);
    policy = await service.register(tenant, "atlas-plan", "policy");
    processes = await service.register(tenant, "p-plan", "processes");
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await db?.$disconnect();
    await postgres?.stop();
  });
  it("blocks empty validation and invalid generation stages", async () => {
    await expect(
      service.write(tenant, "p-plan", "policy", {
        kind: "validate",
        revision: policy.revision,
        target: "policy",
      }),
    ).rejects.toThrow("PLANNING_REVIEW_INCOMPLETE");
    await expect(
      service.launch(tenant, "p-plan", "policy", { revision: policy.revision, stage: "processes" }),
    ).rejects.toThrow("PLANNING_STAGE_INVALID");
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
  it("publishes an immutable signed policy and guards concurrent edits", async () => {
    policy = await service.write(tenant, "p-plan", "policy", {
      kind: "save",
      revision: policy.revision,
      document: document(),
    });
    const revision = policy.revision;
    policy = await service.write(tenant, "p-plan", "policy", {
      kind: "validate",
      revision,
      target: "policy",
    });
    expect(policy.document.policyVersionId).toBeTruthy();
    const version = policy.versions[0]!;
    expect(version.document.directions.signatoryName).toBe("Reviewer");
    await expect(
      service.write(tenant, "p-plan", "policy", { kind: "save", revision, document: document() }),
    ).rejects.toThrow("PLANNING_INPUT_CHANGED");
    await expect(
      db.planningVersion.update({ where: { id: version.id }, data: { document: {} } }),
    ).rejects.toThrow();
  });
  it("requires human measurable targets and keeps objective exports frozen", async () => {
    const objective = {
      id: "o",
      decision: "retained" as const,
      axisId: "a",
      title: "Improve service quality",
      indicator: "Service quality rate",
      method: "Monthly review",
      unit: "%",
      baseline: "",
      target: "",
      deadline: "",
      frequency: "Monthly",
      owner: "",
    };
    policy = await service.write(tenant, "p-plan", "policy", {
      kind: "save",
      revision: policy.revision,
      document: { ...policy.document, objectives: [objective] },
    });
    await expect(
      service.write(tenant, "p-plan", "policy", {
        kind: "validate",
        revision: policy.revision,
        target: "objectives",
      }),
    ).rejects.toThrow("PLANNING_REVIEW_INCOMPLETE");
    policy = await service.write(tenant, "p-plan", "policy", {
      kind: "save",
      revision: policy.revision,
      document: {
        ...policy.document,
        objectives: [
          { ...objective, target: "95%", deadline: "2027-01-01", owner: "Service director" },
        ],
      },
    });
    policy = await service.write(tenant, "p-plan", "policy", {
      kind: "validate",
      revision: policy.revision,
      target: "objectives",
    });
    const v = policy.versions.find((x) => x.kind === "objectives")!;
    expect(v.document.objectives[0]?.target).toBe("95%");
    expect(
      (await service.exportExcel(tenant, "p-plan", "policy", v.id)).byteLength,
    ).toBeGreaterThan(1000);
  });
  it("requires full process coverage and named pilots before publishing a map", async () => {
    const process = (id: string) => ({
      id,
      decision: "retained" as const,
      title: "Process " + id,
      purpose: "Repair",
      inputs: "Orders",
      outputs: "Repair services",
      family: "realization" as const,
      pilotName: "",
      pilotRole: "",
    });
    processes = await service.write(tenant, "p-plan", "processes", {
      kind: "save",
      revision: processes.revision,
      document: {
        ...processes.document,
        processes: [process("a"), process("b")],
        interactions: [
          { id: "i", decision: "retained", from: "a", to: "b", flow: "Order details" },
        ],
      },
    });
    await expect(
      service.write(tenant, "p-plan", "processes", {
        kind: "validate",
        revision: processes.revision,
        target: "processes",
      }),
    ).rejects.toThrow("PLANNING_REVIEW_INCOMPLETE");
    processes = await service.write(tenant, "p-plan", "processes", {
      kind: "save",
      revision: processes.revision,
      document: {
        ...processes.document,
        processes: processes.document.processes.map((p) => ({
          ...p,
          pilotName: "Reviewer",
          pilotRole: "Director",
        })),
      },
    });
    processes = await service.write(tenant, "p-plan", "processes", {
      kind: "validate",
      revision: processes.revision,
      target: "processes",
    });
    expect(processes.versions[0]?.document.processes).toHaveLength(2);
  });
  it("keeps AI proposals separate and rejects applying after human edits", async () => {
    processes = await service.launch(tenant, "p-plan", "processes", {
      revision: processes.revision,
      stage: "processes",
    });
    const run = processes.runs[0]!;
    expect(queue.enqueue).toHaveBeenCalled();
    expect(processes.document.processes).toHaveLength(2);
    await db.planningRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        outputSnapshot: {
          axes: [],
          statement: "",
          objectives: [],
          processes: [
            {
              title: "Additional service",
              purpose: "Repair",
              inputs: "Orders",
              outputs: "Repairs",
              family: "realization",
            },
          ],
          interactions: [],
        },
      },
    });
    processes = await service.write(tenant, "p-plan", "processes", {
      kind: "save",
      revision: processes.revision,
      document: {
        ...processes.document,
        processes: processes.document.processes.map((p) => ({
          ...p,
          pilotName: "Corrected reviewer",
        })),
      },
    });
    await expect(
      service.write(tenant, "p-plan", "processes", {
        kind: "apply",
        revision: processes.revision,
        runId: run.id,
      }),
    ).rejects.toThrow("PLANNING_PROPOSAL_EXPIRED");
    expect(processes.document.processes[0]?.pilotName).toBe("Corrected reviewer");
  });
  it("applies a completed worker proposal as pending while preserving human edits and history", async () => {
    processes = await service.launch(tenant, "p-plan", "processes", {
      revision: processes.revision,
      stage: "processes",
    });
    const run = processes.runs[0]!;
    const worker = new PlanningProcessor();
    Object.defineProperty(worker, "db", { value: db });
    const generated = {
      axes: [],
      statement: "",
      objectives: [],
      processes: [
        {
          title: "Additional service",
          purpose: "Repair",
          inputs: "Orders",
          outputs: "Repairs",
          family: "support",
        },
      ],
      interactions: [],
    };
    vi.spyOn(
      worker as unknown as {
        generate(value: unknown): Promise<{ output: unknown; model: string }>;
      },
      "generate",
    ).mockResolvedValue({ output: generated, model: "test-model" });
    await worker.process({
      data: { organizationId: tenant.organizationId, payload: { runId: run.id } },
    } as never);
    expect((await db.planningRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe(
      "COMPLETED",
    );
    processes = await service.write(tenant, "p-plan", "processes", {
      kind: "apply",
      revision: processes.revision,
      runId: run.id,
    });
    expect(processes.document.processes[0]?.pilotName).toBe("Corrected reviewer");
    expect(processes.document.processes.at(-1)?.decision).toBe("pending");
    expect(processes.document.processes.at(-1)?.pilotName).toBe("");
    expect(processes.versions[0]?.document.processes).toHaveLength(2);
    await expect(
      service.write(tenant, "p-plan", "processes", {
        kind: "apply",
        revision: processes.revision,
        runId: run.id,
      }),
    ).rejects.toThrow("PLANNING_PROPOSAL_EXPIRED");
    const current = await db.planningRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(current.inputSnapshot).toHaveProperty("document");
    await expect(
      db.planningRun.update({ where: { id: run.id }, data: { outputSnapshot: {} } }),
    ).rejects.toThrow();
  });
  it("isolates tenant projects and module-specific version exports", async () => {
    await expect(
      service.register({ ...tenant, organizationId: "another" }, "p-plan", "policy"),
    ).rejects.toThrow("Project not found");
    await expect(
      service.exportExcel(tenant, "p-plan", "processes", policy.versions[0]!.id),
    ).rejects.toThrow("Validated version not found");
  });
  it("invalidates changed source material while keeping historical deliverables", async () => {
    await db.project.update({
      where: { id: "p-plan" },
      data: { name: "Changed organization scope" },
    });
    policy = await service.register(tenant, "p-plan", "policy");
    expect(policy.current).toBe(false);
    const v = policy.versions.find((x) => x.kind === "policy")!;
    await expect(
      service.write(tenant, "p-plan", "policy", {
        kind: "validate",
        revision: policy.revision,
        target: "policy",
      }),
    ).rejects.toThrow("PLANNING_SOURCES_CHANGED");
    expect(
      (await service.exportExcel(tenant, "p-plan", "policy", v.id)).byteLength,
    ).toBeGreaterThan(1000);
    policy = await service.write(tenant, "p-plan", "policy", {
      kind: "review_sources",
      revision: policy.revision,
    });
    expect(policy.document.axes[0]?.decision).toBe("pending");
    expect(policy.document.policyVersionId).toBeNull();
    expect(await db.planningCorrection.count()).toBeGreaterThan(5);
  });
});
