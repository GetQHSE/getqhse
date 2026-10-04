import { readFile, readdir } from "node:fs/promises";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";
import type { RoRegister, RoMaterial } from "@qhse/contracts";
import { smqRo } from "@qhse/domain";
import { GenericContainer, Wait } from "testcontainers";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { RoService } from "../../apps/client-api/src/modules/ro/application/ro.service.js";
import { loadPipMaterial } from "../../apps/client-api/src/modules/pip/application/pip-material.js";
import { RoAnalysisProcessor } from "../../apps/worker/src/processors/ro-analysis.processor.js";
const suite = describe.skipIf(process.env["TESTCONTAINERS_ENABLED"] !== "true");
suite("R&O persisted six-step workflow", () => {
  let postgres: Awaited<ReturnType<GenericContainer["start"]>>,
    db: DatabaseClient,
    service: RoService,
    worker: RoAnalysisProcessor,
    register: RoRegister;
  const tenant = { organizationId: "org-ro", userId: "user-ro", role: "owner" };
  const queue = { enqueue: vi.fn().mockResolvedValue({}) };
  const generate =
    vi.fn<
      (
        stage: string,
        material: RoMaterial,
        schema: unknown,
      ) => Promise<{ output: unknown; model: string }>
    >();
  const content = {
    type: "risk" as const,
    title: "Repair errors",
    description: "Repair defects could cause customer complaints",
    causes: "Quality variation",
    consequences: "Customer dissatisfaction",
    reasoning: "Reviewed source",
    confidence: 0.9,
  };
  const rating = {
    probability: 2,
    impact: 3,
    feasibility: null,
    benefit: null,
    priority: "P1" as const,
    reasoning: "Reviewed source",
  };
  const today = new Date().toISOString().slice(0, 10);
  const action = {
    title: "Review repair quality",
    description: "Quality verification",
    process: "Quality",
    owner: "Quality manager",
    objective: "Improve quality",
    resources: "Review time",
    budget: "To confirm",
    plannedDate: today,
    criterion: "Customer complaints reduced",
    effectivenessDate: today,
  };
  const current = () => {
    const item = register.items.find((i) => i.effective.content.type === "opportunity");
    if (!item) throw new Error("Opportunity required");
    return item;
  };
  async function process(runId: string) {
    await worker.process({
      data: { organizationId: tenant.organizationId, payload: { runId } },
    } as never);
    register = await service.register(tenant, "project-ro");
    expect(register.runs.find((r) => r.id === runId)?.status).toBe("COMPLETED");
  }
  beforeAll(async () => {
    postgres = await new GenericContainer("pgvector/pgvector:0.8.6-pg18")
      .withEnvironment({
        POSTGRES_DB: "ro_test",
        POSTGRES_USER: "ro_test",
        POSTGRES_PASSWORD: "ro_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    const url = `postgresql://ro_test:ro_test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/ro_test`;
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
      data: { id: tenant.userId, name: "Reviewer", email: "ro@example.test" },
    });
    await db.organization.create({
      data: { id: tenant.organizationId, name: "RO organization", slug: "ro-org" },
    });
    await db.project.create({
      data: {
        id: "project-ro",
        organizationId: tenant.organizationId,
        createdById: tenant.userId,
        name: "Repair project",
        slug: "repair-ro",
        entityType: "COMPANY",
        countryCode: "MA",
        language: "en",
        profile: {
          create: {
            snapshots: {
              create: {
                sequence: 1,
                schemaVersion: 1,
                contentHash: "ro-profile",
                completenessPercent: 100,
                regulatoryReadiness: 100,
                data: { fields: { "organization.mission": "Repair services" } },
              },
            },
          },
        },
      },
    });
    const context = await db.contextAnalysisRun.create({
      data: {
        projectId: "project-ro",
        triggeredById: tenant.userId,
        kind: "SYNTHESIS",
        status: "COMPLETED",
        completedAt: new Date(),
        validatedAt: new Date(),
      },
    });
    await db.contextIssue.create({
      data: {
        id: "issue-ro",
        projectId: "project-ro",
        runId: context.id,
        canonicalKey: "quality",
        issueFingerprint: "quality-ro-fingerprint",
        aiOrigin: "INTERNAL",
        aiTitle: "Repair quality",
        aiDescription: "Quality variation",
        reviewStatus: "VALIDATED",
      },
    });
    const party = await db.pipParty.create({
      data: {
        projectId: "project-ro",
        canonicalKey: "customers",
        origin: "user",
        reviewStatus: "VALIDATED",
        effective: {
          name: "Customers",
          description: "Repair customers",
          category: "Customers",
          scope: "external",
          relevance: "relevant",
          reasoning: "Reviewed",
          confidence: null,
          evidence: [],
        },
      },
    });
    await db.pipRequirement.create({
      data: {
        id: "requirement-ro",
        partyId: party.id,
        canonicalKey: "need:quality",
        origin: "user",
        reviewStatus: "VALIDATED",
        effective: {
          kind: "need",
          text: "Reliable repairs",
          reasoning: "Customer need",
          sourceType: "stakeholder_expectation",
          regulatoryEntryId: null,
          sourceLabel: null,
          sourceUrl: null,
        },
      },
    });
    const { fingerprint } = await loadPipMaterial(db, "project-ro");
    await db.pipState.create({
      data: { projectId: "project-ro", inventoryFingerprint: fingerprint },
    });
    service = new RoService(queue as never, db);
    vi.stubEnv("DATABASE_URL", url);
    worker = new RoAnalysisProcessor();
    (worker as unknown as { database: DatabaseClient }).database = db;
    (worker as unknown as { generate: typeof generate }).generate = generate;
  });
  afterAll(async () => {
    await db?.$disconnect();
    await postgres?.stop();
    vi.unstubAllEnvs();
  });
  it("loads reviewed sources without launching AI and enforces tenant isolation", async () => {
    register = await service.register(tenant, "repair-ro");
    expect(register.sources).toHaveLength(2);
    expect(queue.enqueue).not.toHaveBeenCalled();
    await expect(
      service.register({ ...tenant, organizationId: "foreign" }, "project-ro"),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("generates both branches with pending decisions, deterministic scoring and project language", async () => {
    generate.mockResolvedValueOnce({
      output: { items: [{ sourceId: "issue-ro", content, rating }] },
      model: "test",
    });
    await process(
      (await service.launch(tenant, "project-ro", { stage: "GENERATION", branch: "context_issue" }))
        .runId,
    );
    generate.mockResolvedValueOnce({
      output: {
        items: [
          {
            sourceId: "requirement-ro",
            content: { ...content, type: "opportunity", title: "Stronger customer retention" },
            rating: {
              probability: null,
              impact: null,
              feasibility: 4,
              benefit: 5,
              priority: "P1",
              reasoning: "Customer reliability",
            },
          },
        ],
      },
      model: "test",
    });
    await process(
      (
        await service.launch(tenant, "project-ro", {
          stage: "GENERATION",
          branch: "pip_requirement",
        })
      ).runId,
    );
    expect(register.items).toHaveLength(2);
    expect(register.items.every((i) => i.reviewStatus === "PENDING")).toBe(true);
    expect(
      register.items.find((i) => i.effective.content.type === "risk")?.effective.rating?.priority,
    ).toBe("P3");
    expect(generate.mock.calls[0]?.[1].language).toBe("en");
    await expect(
      service.launch(tenant, "project-ro", { stage: "TREATMENT" }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("requires reviewed rating and controls, and treats only uncovered items", async () => {
    for (const i of register.items) {
      await service.write(tenant, "project-ro", {
        kind: "item",
        entityId: i.id,
        reviewStatus: "VALIDATED",
        reason: "Reviewed proposal",
      });
      await service.write(tenant, "project-ro", {
        kind: "rating",
        entityId: i.id,
        rating: i.effective.rating!,
        reason: "Reviewed rating",
      });
      await service.write(tenant, "project-ro", {
        kind: "controls",
        entityId: i.id,
        state: i.effective.content.type === "risk" ? "existing" : "none",
        controls: i.effective.content.type === "risk" ? ["Quality check"] : [],
        reason: "Controls reviewed",
      });
    }
    register = await service.register(tenant, "project-ro");
    const opportunity = current();
    generate.mockImplementationOnce(async (_stage, material) => {
      expect(material.items.map((i) => i.id)).toEqual([opportunity.id]);
      return { output: { items: [{ itemId: opportunity.id, actions: [action] }] }, model: "test" };
    });
    await process((await service.launch(tenant, "project-ro", { stage: "TREATMENT" })).runId);
    expect(register.items.find((i) => i.effective.content.type === "risk")?.actions).toHaveLength(
      0,
    );
    expect(current().actions[0]?.reviewStatus).toBe("PENDING");
    await expect(service.validate(tenant, "project-ro")).rejects.toMatchObject({ status: 400 });
    const a = current().actions[0]!;
    register = await service.write(tenant, "project-ro", {
      kind: "action",
      entityId: a.id,
      reviewStatus: "VALIDATED",
      reason: "Action reviewed",
    });
    register = await service.validate(tenant, "project-ro");
    expect(register.validatedAt).not.toBeNull();
    expect(smqRo.roRegisterRows(register.items, "en")).toHaveLength(2);
    expect(current().actions[0]?.effectiveness).toHaveLength(0);
  });
  it("does not duplicate unchanged treatment or overwrite human edits", async () => {
    const beforeCalls = generate.mock.calls.length;
    await process((await service.launch(tenant, "project-ro", { stage: "TREATMENT" })).runId);
    expect(generate).toHaveBeenCalledTimes(beforeCalls);
    expect(current().actions).toHaveLength(1);
    const i = current();
    register = await service.write(tenant, "project-ro", {
      kind: "item",
      entityId: i.id,
      reviewStatus: "MODIFIED",
      content: { ...i.effective.content, title: "Enterprise customer retention" },
      reason: "Clarified enterprise scope",
    });
    generate.mockResolvedValueOnce({
      output: {
        items: [
          {
            sourceId: "requirement-ro",
            content: { ...content, type: "opportunity", title: "Stronger customer retention" },
            rating: {
              probability: null,
              impact: null,
              feasibility: 4,
              benefit: 5,
              priority: "P1",
              reasoning: "Customer reliability",
            },
          },
        ],
      },
      model: "test",
    });
    await process(
      (
        await service.launch(tenant, "project-ro", {
          stage: "GENERATION",
          branch: "pip_requirement",
        })
      ).runId,
    );
    expect(current().effective.content.title).toBe("Enterprise customer retention");
    expect(current().reviewStatus).toBe("MODIFIED");
    await expect(
      db.roItem.update({ where: { id: i.id }, data: { aiProposal: { forged: true } } }),
    ).rejects.toThrow(/immutable/);
  });
  it("records progress and effectiveness as separate append-only human evidence", async () => {
    const i = current();
    await service.write(tenant, "project-ro", {
      kind: "rating",
      entityId: i.id,
      rating: i.effective.rating!,
      reason: "Rating reconfirmed",
    });
    await service.write(tenant, "project-ro", {
      kind: "controls",
      entityId: i.id,
      state: "none",
      controls: [],
      reason: "Controls reconfirmed",
    });
    const a = i.actions[0]!;
    await service.write(tenant, "project-ro", {
      kind: "action",
      entityId: a.id,
      reviewStatus: "VALIDATED",
      reason: "Action reconfirmed",
    });
    await expect(
      service.write(tenant, "project-ro", {
        kind: "effectiveness",
        entityId: a.id,
        reason: "Measured effectiveness",
        content: {
          date: today,
          result: "effective",
          measuredValue: "Complaints decreased",
          comment: "Measured against the criterion",
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await service.write(tenant, "project-ro", {
      kind: "progress",
      entityId: a.id,
      reason: "Action completed",
      content: {
        status: "completed",
        percent: 100,
        actualDate: today,
        comment: "Quality review evidence",
      },
    });
    register = await service.write(tenant, "project-ro", {
      kind: "effectiveness",
      entityId: a.id,
      reason: "Measured effectiveness",
      content: {
        date: today,
        result: "effective",
        measuredValue: "Complaints decreased",
        comment: "Measured against the criterion",
      },
    });
    expect(current().actions[0]?.effectiveness[0]?.measuredValue).toBe("Complaints decreased");
    const event = await db.roActionEvent.findFirstOrThrow({ where: { actionId: a.id } });
    await expect(
      db.roActionEvent.update({ where: { id: event.id }, data: { content: { forged: true } } }),
    ).rejects.toThrow(/append-only/);
  });
  it("reopens dependent decisions when a source changes and hides removed sources", async () => {
    await db.contextIssue.update({
      where: { id: "issue-ro" },
      data: { title: "Updated repair quality" },
    });
    register = await service.register(tenant, "project-ro");
    expect(register.outdated).toBe(true);
    generate.mockResolvedValueOnce({
      output: { items: [{ sourceId: "issue-ro", content, rating }] },
      model: "test",
    });
    await process(
      (await service.launch(tenant, "project-ro", { stage: "GENERATION", branch: "context_issue" }))
        .runId,
    );
    const risk = register.items.find((i) => i.effective.content.type === "risk")!;
    expect(risk.reviewStatus).toBe("PENDING");
    expect(risk.effective.ratingReviewed).toBe(false);
    await db.contextIssue.update({
      where: { id: "issue-ro" },
      data: { reviewStatus: "NOT_RETAINED" },
    });
    register = await service.register(tenant, "project-ro");
    expect(register.items.some((i) => i.id === risk.id)).toBe(false);
    await process(
      (await service.launch(tenant, "project-ro", { stage: "GENERATION", branch: "context_issue" }))
        .runId,
    );
    expect(await db.roItem.findUnique({ where: { id: risk.id } })).not.toBeNull();
  });
  it("allows only one active run under concurrent launches", async () => {
    const results = await Promise.allSettled([
      service.launch(tenant, "project-ro", { stage: "GENERATION", branch: "context_issue" }),
      service.launch(tenant, "project-ro", { stage: "GENERATION", branch: "context_issue" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
});
