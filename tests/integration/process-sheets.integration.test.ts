import { readFile, readdir } from "node:fs/promises";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";
import { smqScope, smqPlanning } from "@qhse/domain";
import {
  scopeDeclarationSchema,
  planningDocumentSchema,
  type ProcessSheetRegister,
  type ProcessSheetGeneration,
} from "@qhse/contracts";
import { GenericContainer, Wait } from "testcontainers";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { ProcessSheetsService } from "../../apps/client-api/src/modules/process-sheets/application/process-sheets.service.js";
import { PlanningService } from "../../apps/client-api/src/modules/planning/application/planning.service.js";
import { ProcessSheetProcessor } from "../../apps/worker/src/processors/process-sheet.processor.js";
import {
  loadScopeFacts,
  scopeFingerprint,
} from "../../apps/client-api/src/modules/scope/application/scope-material.js";
const suite = describe.skipIf(process.env["TESTCONTAINERS_ENABLED"] !== "true");
suite("Persisted process sheets from validated upstream versions", () => {
  let postgres: Awaited<ReturnType<GenericContainer["start"]>>,
    db: DatabaseClient,
    service: ProcessSheetsService,
    planning: PlanningService,
    worker: ProcessSheetProcessor,
    register: ProcessSheetRegister;
  const tenant = { organizationId: "org-sheet", userId: "user-sheet", role: "owner" },
    queue = { enqueue: vi.fn().mockResolvedValue({}) };
  const process = (id: string) => ({
    id,
    title: "Repair " + id,
    purpose: "Repair orders",
    inputs: "Orders",
    outputs: "Repairs",
    decision: "retained" as const,
    family: "realization" as const,
    pilotName: "Reviewer",
    pilotRole: "Director",
  });
  const sheet = () => {
    const s = register.sheets.find((s) => s.processId === "a");
    if (!s) throw new Error("Sheet required");
    return s;
  };
  beforeAll(async () => {
    postgres = await new GenericContainer("pgvector/pgvector:0.8.6-pg18")
      .withEnvironment({
        POSTGRES_DB: "sheet_test",
        POSTGRES_USER: "sheet_test",
        POSTGRES_PASSWORD: "sheet_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    const url = `postgresql://sheet_test:sheet_test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/sheet_test`;
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
      data: { id: tenant.userId, name: "Reviewer", email: "sheet@example.test" },
    });
    await db.organization.create({
      data: { id: tenant.organizationId, name: "Group", slug: "sheet-group" },
    });
    await db.project.create({
      data: {
        id: "p-sheet",
        organizationId: tenant.organizationId,
        createdById: tenant.userId,
        name: "Atlas",
        slug: "atlas-sheet",
        entityType: "COMPANY",
        countryCode: "MA",
        language: "en",
      },
    });
    const facts = await loadScopeFacts(db, "p-sheet"),
      declaration = scopeDeclarationSchema.parse(smqScope.emptyDeclaration()),
      fp = scopeFingerprint({ facts, declaration });
    await db.scopeState.create({
      data: { projectId: "p-sheet", declaration: JSON.parse(JSON.stringify(declaration)) },
    });
    await db.scopeVerification.create({
      data: {
        id: "scope-sheet-review",
        projectId: "p-sheet",
        fingerprint: fp,
        decision: {
          applicability: "applicable",
          justification: "Professional scope review",
          acknowledgedFindings: [],
        },
        authorId: tenant.userId,
      },
    });
    await db.scopeStatement.create({
      data: {
        projectId: "p-sheet",
        status: "VALIDATED",
        version: 1,
        statement: "Atlas repair services scope",
        nonApplicable: [],
        aiProposal: {},
        fingerprint: fp,
        verificationId: "scope-sheet-review",
        sourceSnapshot: {},
        validatedAt: new Date(),
        validatedById: tenant.userId,
      },
    });
    planning = new PlanningService(queue as never, db);
    service = new ProcessSheetsService(queue as never, db);
    vi.stubEnv("DATABASE_URL", url);
    worker = new ProcessSheetProcessor();
    Object.defineProperty(worker, "db", { value: db });
    vi.spyOn(
      worker as unknown as {
        generate(value: ProcessSheetGeneration): Promise<{ output: unknown; model: string }>;
      },
      "generate",
    ).mockResolvedValue({
      model: "test-model",
      output: {
        activities: [
          {
            activity: "Inspect repaired products",
            input: "Repaired goods",
            output: "Verified goods",
          },
        ],
      },
    });
    register = await service.register(tenant, "atlas-sheet");
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await db?.$disconnect();
    await postgres?.stop();
  });
  it("never consumes draft process maps and rejects arbitrary process references", async () => {
    expect(register.sources.map).toBeNull();
    await expect(service.prepare(tenant, "p-sheet", "a")).rejects.toThrow(
      "SHEET_PROCESS_UNAVAILABLE",
    );
    let map = await planning.register(tenant, "p-sheet", "processes");
    map = await planning.write(tenant, "p-sheet", "processes", {
      kind: "save",
      revision: map.revision,
      document: planningDocumentSchema.parse({
        ...smqPlanning.emptyDocument(),
        processes: [process("a"), process("b")],
        interactions: [{ id: "i", from: "a", to: "b", flow: "Repair order", decision: "retained" }],
      }),
    });
    expect((await service.register(tenant, "p-sheet")).sources.map).toBeNull();
    await planning.write(tenant, "p-sheet", "processes", {
      kind: "validate",
      revision: map.revision,
      target: "processes",
    });
    register = await service.prepare(tenant, "p-sheet", "a");
    expect(sheet().content.purpose).toBe("Repair orders");
    expect(sheet().content.activities).toEqual([]);
    expect(sheet().sourceSnapshot.sources.objectives).toEqual([]);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
  it("opens an existing sheet without overwriting edits or auto-generating", async () => {
    register = await service.write(tenant, "p-sheet", sheet().id, {
      kind: "save",
      revision: sheet().revision,
      content: {
        ...sheet().content,
        description: "Receive the order, repair and inspect the goods.",
        authorName: "Reviewer",
        approverName: "Director",
        referencesReviewed: true,
      },
    });
    const revision = sheet().revision;
    register = await service.prepare(tenant, "p-sheet", "a");
    expect(sheet().revision).toBe(revision);
    expect(sheet().content.description).toContain("inspect");
    await expect(
      service.write(tenant, "p-sheet", sheet().id, {
        kind: "validate",
        revision: sheet().revision,
      }),
    ).rejects.toThrow("Bad Request");
  });
  it("generates proposals separately and applies them only as pending review", async () => {
    register = await service.launch(tenant, "p-sheet", sheet().id, sheet().revision);
    const run = register.runs[0]!;
    await worker.process({
      data: { organizationId: tenant.organizationId, payload: { runId: run.id } },
    } as never);
    expect(sheet().content.activities).toEqual([]);
    await worker.process({
      data: { organizationId: tenant.organizationId, payload: { runId: run.id } },
    } as never);
    expect((worker as unknown as { generate: unknown }).generate).toHaveBeenCalledTimes(1);
    expect((await db.processSheetRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe(
      "COMPLETED",
    );
    register = await service.write(tenant, "p-sheet", sheet().id, {
      kind: "apply",
      revision: sheet().revision,
      runId: run.id,
    });
    expect(sheet().content.activities[0]?.decision).toBe("pending");
    expect(sheet().content.authorName).toBe("Reviewer");
    await expect(
      service.write(tenant, "p-sheet", sheet().id, {
        kind: "validate",
        revision: sheet().revision,
      }),
    ).rejects.toThrow("Bad Request");
  });
  it("publishes immutable sheet history after explicit review and freezes exports", async () => {
    register = await service.write(tenant, "p-sheet", sheet().id, {
      kind: "save",
      revision: sheet().revision,
      content: {
        ...sheet().content,
        activities: sheet().content.activities.map((a) => ({ ...a, decision: "retained" })),
      },
    });
    register = await service.write(tenant, "p-sheet", sheet().id, {
      kind: "validate",
      revision: sheet().revision,
    });
    const v = register.versions[0]!;
    expect(v.version).toBe(1);
    expect(v.validatedById).toBe(tenant.userId);
    await expect(
      db.processSheetVersion.update({ where: { id: v.id }, data: { content: {} } }),
    ).rejects.toThrow();
    register = await service.write(tenant, "p-sheet", sheet().id, {
      kind: "save",
      revision: sheet().revision,
      content: {
        ...sheet().content,
        description: "A new professionally edited description of repairs.",
      },
    });
    expect((await service.exportVersion(tenant, "p-sheet", v.id)).content.description).toBe(
      "Receive the order, repair and inspect the goods.",
    );
  });
  it("guards revisions and prevents an older proposal from replacing newer input", async () => {
    register = await service.launch(tenant, "p-sheet", sheet().id, sheet().revision);
    const run = register.runs[0]!;
    await worker.process({
      data: { organizationId: tenant.organizationId, payload: { runId: run.id } },
    } as never);
    const previousRevision = sheet().revision;
    register = await service.write(tenant, "p-sheet", sheet().id, {
      kind: "save",
      revision: sheet().revision,
      content: { ...sheet().content, notes: "Professional correction after generation" },
    });
    await expect(
      service.write(tenant, "p-sheet", sheet().id, {
        kind: "apply",
        revision: sheet().revision,
        runId: run.id,
      }),
    ).rejects.toThrow("SHEET_PROPOSAL_EXPIRED");
    await expect(
      service.write(tenant, "p-sheet", sheet().id, {
        kind: "save",
        revision: previousRevision,
        content: sheet().content,
      }),
    ).rejects.toThrow("SHEET_INPUT_CHANGED");
    expect(sheet().content.notes).toContain("correction");
  });
  it("ignores policy/objective drafts, consumes validated versions and requires explicit source review", async () => {
    let policy = await planning.register(tenant, "p-sheet", "policy");
    policy = await planning.write(tenant, "p-sheet", "policy", {
      kind: "save",
      revision: policy.revision,
      document: planningDocumentSchema.parse({
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
            id: "axis",
            title: "Repair quality",
            rationale: "Ensure consistent quality of customer repairs",
            decision: "retained",
          },
        ],
        statement:
          "We commit to continually improving service quality, meeting applicable requirements and reviewing customer needs. ".repeat(
            14,
          ),
      }),
    });
    expect((await service.register(tenant, "p-sheet")).sources.policy).toBeNull();
    policy = await planning.write(tenant, "p-sheet", "policy", {
      kind: "validate",
      revision: policy.revision,
      target: "policy",
    });
    policy = await planning.write(tenant, "p-sheet", "policy", {
      kind: "save",
      revision: policy.revision,
      document: {
        ...policy.document,
        objectives: [
          {
            id: "objective",
            axisId: "axis",
            title: "Improve repair quality",
            indicator: "Repair quality rate",
            method: "Review",
            unit: "%",
            baseline: "",
            target: "95%",
            deadline: "2027-01-01",
            frequency: "Monthly",
            owner: "Director",
            decision: "retained",
          },
        ],
      },
    });
    expect((await service.register(tenant, "p-sheet")).sources.objectives).toEqual([]);
    await planning.write(tenant, "p-sheet", "policy", {
      kind: "validate",
      revision: policy.revision,
      target: "objectives",
    });
    register = await service.register(tenant, "p-sheet");
    expect(register.sources.objectives[0]?.id).toBe("objective");
    expect(sheet().current).toBe(false);
    await expect(service.launch(tenant, "p-sheet", sheet().id, sheet().revision)).rejects.toThrow(
      "SHEET_SOURCES_CHANGED",
    );
    register = await service.write(tenant, "p-sheet", sheet().id, {
      kind: "refresh_sources",
      revision: sheet().revision,
    });
    expect(sheet().content.activities[0]?.decision).toBe("pending");
    expect(sheet().content.referencesReviewed).toBe(false);
    expect(sheet().content.notes).toContain("correction");
    expect(sheet().current).toBe(true);
  });
  it("ignores map drafts and preserves historical sheets when a process is removed from a new validated map", async () => {
    let map = await planning.register(tenant, "p-sheet", "processes");
    map = await planning.write(tenant, "p-sheet", "processes", {
      kind: "save",
      revision: map.revision,
      document: {
        ...map.document,
        processes: [process("b"), process("c")],
        interactions: [
          { id: "j", from: "b", to: "c", flow: "Order handover", decision: "retained" },
        ],
      },
    });
    register = await service.register(tenant, "p-sheet");
    expect(register.sources.map?.processes.some((p) => p.id === "a")).toBe(true);
    await planning.write(tenant, "p-sheet", "processes", {
      kind: "validate",
      revision: map.revision,
      target: "processes",
    });
    register = await service.register(tenant, "p-sheet");
    expect(sheet().available).toBe(false);
    expect(sheet().current).toBe(false);
    await expect(service.prepare(tenant, "p-sheet", "a")).rejects.toThrow(
      "SHEET_PROCESS_UNAVAILABLE",
    );
    const frozen = await service.exportVersion(tenant, "p-sheet", register.versions[0]!.id);
    expect(frozen.sourceSnapshot.sources.map?.processes.some((p) => p.id === "a")).toBe(true);
    expect(frozen.content.activities[0]?.decision).toBe("retained");
  });
  it("isolates tenant reads, mutations, cross-project sheets and historical exports", async () => {
    const other = { ...tenant, organizationId: "other" };
    await expect(service.register(other, "p-sheet")).rejects.toThrow("Project not found");
    await expect(service.exportVersion(other, "p-sheet", register.versions[0]!.id)).rejects.toThrow(
      "Project not found",
    );
    await db.project.create({
      data: {
        id: "p-other-sheet",
        organizationId: tenant.organizationId,
        createdById: tenant.userId,
        name: "Other",
        slug: "other-sheet",
        entityType: "COMPANY",
        countryCode: "MA",
        language: "en",
      },
    });
    await expect(
      service.write(tenant, "p-other-sheet", sheet().id, {
        kind: "save",
        revision: sheet().revision,
        content: sheet().content,
      }),
    ).rejects.toThrow("Process sheet not found");
    await expect(
      service.exportVersion(tenant, "p-other-sheet", register.versions[0]!.id),
    ).rejects.toThrow("Validated sheet not found");
    expect(await db.processSheetCorrection.count()).toBeGreaterThan(5);
  });
});
