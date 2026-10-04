import { readFile, readdir } from "node:fs/promises";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";
import { smqScope } from "@qhse/domain";
import type { ScopeRegister, ScopeMaterial } from "@qhse/contracts";
import { GenericContainer, Wait } from "testcontainers";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { ScopeService } from "../../apps/client-api/src/modules/scope/application/scope.service.js";
import { ScopeStatementProcessor } from "../../apps/worker/src/processors/scope-statement.processor.js";
const suite = describe.skipIf(process.env["TESTCONTAINERS_ENABLED"] !== "true");
suite("Persisted scope boundary and immutable versions", () => {
  let postgres: Awaited<ReturnType<GenericContainer["start"]>>;
  let db: DatabaseClient,
    service: ScopeService,
    worker: ScopeStatementProcessor,
    register: ScopeRegister;
  const tenant = { organizationId: "org-scope", userId: "user-scope", role: "owner" };
  const queue = { enqueue: vi.fn().mockResolvedValue({}) };
  const declaration = {
    ...smqScope.emptyDeclaration(),
    activitiesInclusion: "all" as const,
    activities: "Repair",
    productsInclusion: "all" as const,
    products: "Repair services",
    sitesCoverage: "all" as const,
    sites: [{ name: "Workshop", address: "10 Main Street", type: "" }],
    designDeclaration: "customer_specifications" as const,
    thirdPartyProperty: "no" as const,
  };
  const verification = {
    applicability: "applicable" as const,
    justification: "Professional review confirms design responsibility",
    acknowledgedFindings: ["profileMissing", "issuesMissing", "partiesMissing"],
  };
  const refresh = async () => {
    register = await service.register(tenant, "p-scope");
    return register;
  };
  const draft = () => {
    const row = register.statements.find((s) => s.status === "DRAFT");
    if (!row) throw new Error("Draft required");
    return row;
  };
  beforeAll(async () => {
    postgres = await new GenericContainer("pgvector/pgvector:0.8.6-pg18")
      .withEnvironment({
        POSTGRES_DB: "scope_test",
        POSTGRES_USER: "scope_test",
        POSTGRES_PASSWORD: "scope_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    const url = `postgresql://scope_test:scope_test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/scope_test`;
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
      data: { id: tenant.userId, name: "Reviewer", email: "scope@example.test" },
    });
    await db.organization.create({
      data: { id: tenant.organizationId, name: "Scope Group", slug: "scope-group" },
    });
    await db.project.create({
      data: {
        id: "p-scope",
        organizationId: tenant.organizationId,
        createdById: tenant.userId,
        name: "Atlas",
        slug: "atlas-scope",
        entityType: "COMPANY",
        countryCode: "MA",
        language: "en",
      },
    });
    service = new ScopeService(queue as never, db);
    vi.stubEnv("DATABASE_URL", url);
    worker = new ScopeStatementProcessor();
    Object.defineProperty(worker, "db", { value: db });
    vi.spyOn(
      worker as unknown as {
        generate(m: ScopeMaterial): Promise<{ output: unknown; model: string }>;
      },
      "generate",
    ).mockImplementation(async (m) => ({
      model: "test-model",
      output: {
        statement: `The QMS scope of ${m.facts.projectName}, defined with reference to ISO 9001, covers repair services at Workshop, 10 Main Street.`,
        nonApplicable: [],
      },
    }));
    await refresh();
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await db?.$disconnect();
    await postgres?.stop();
  });
  it("blocks incomplete declarations and generation without verification", async () => {
    await expect(
      service.write(tenant, "p-scope", {
        kind: "verification",
        revision: register.revision,
        fingerprint: register.fingerprint,
        verification,
      }),
    ).rejects.toThrow("SCOPE_DECLARATIONS_INCOMPLETE");
    await expect(
      service.launch(tenant, "p-scope", {
        revision: register.revision,
        fingerprint: register.fingerprint,
      }),
    ).rejects.toThrow("SCOPE_VERIFICATION_REQUIRED");
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
  it("saves declarations and an explicit professional decision with author evidence", async () => {
    register = await service.write(tenant, "p-scope", {
      kind: "declaration",
      revision: register.revision,
      declaration,
    });
    expect(register.verificationCurrent).toBe(false);
    register = await service.write(tenant, "p-scope", {
      kind: "verification",
      revision: register.revision,
      fingerprint: register.fingerprint,
      verification,
    });
    expect(register.verificationCurrent).toBe(true);
    expect(register.verification?.authorId).toBe(tenant.userId);
    expect(await db.scopeCorrection.count({ where: { projectId: "p-scope" } })).toBe(2);
  });
  it("generates only a draft and prevents concurrent runs", async () => {
    const run = await service.launch(tenant, "p-scope", {
      revision: register.revision,
      fingerprint: register.fingerprint,
    });
    await expect(
      service.launch(tenant, "p-scope", {
        revision: register.revision,
        fingerprint: register.fingerprint,
      }),
    ).rejects.toThrow("SCOPE_RUN_ACTIVE");
    await worker.process({
      data: { organizationId: tenant.organizationId, payload: { runId: run.runId } },
    } as never);
    await refresh();
    expect(draft().status).toBe("DRAFT");
    expect(register.runs[0]?.status).toBe("COMPLETED");
    await expect(service.exportVersion(tenant, "p-scope", draft().id)).rejects.toThrow();
  });
  it("preserves the proposal, human edits, and immutable validated version", async () => {
    const row = draft();
    const edited = row.statement + " Maintenance services are included.";
    register = await service.write(tenant, "p-scope", {
      kind: "statement",
      revision: register.revision,
      statementId: row.id,
      statement: edited,
    });
    register = await service.write(tenant, "p-scope", {
      kind: "validate",
      revision: register.revision,
      statementId: row.id,
    });
    const exported = await service.exportVersion(tenant, "p-scope", row.id);
    expect(exported.version).toBe(1);
    expect(exported.statement).toBe(edited);
    expect(exported.professionallyModified).toBe(true);
    await expect(
      db.scopeStatement.update({ where: { id: row.id }, data: { statement: "Rewritten history" } }),
    ).rejects.toThrow();
    await expect(
      db.scopeStatement.update({ where: { id: row.id }, data: { aiProposal: { changed: true } } }),
    ).rejects.toThrow();
    const review = await db.scopeVerification.findFirstOrThrow({ where: { projectId: "p-scope" } });
    await expect(
      db.scopeVerification.update({
        where: { id: review.id },
        data: { decision: { changed: true } },
      }),
    ).rejects.toThrow();
  });
  it("marks changed upstream facts stale and exports historical sources unchanged", async () => {
    const version = register.statements.find((s) => s.status === "VALIDATED");
    if (!version) throw new Error("Version required");
    await db.project.update({ where: { id: "p-scope" }, data: { name: "New Atlas" } });
    await refresh();
    expect(register.verificationCurrent).toBe(false);
    await expect(
      service.launch(tenant, "p-scope", {
        revision: register.revision,
        fingerprint: register.fingerprint,
      }),
    ).rejects.toThrow("SCOPE_VERIFICATION_REQUIRED");
    const exported = await service.exportVersion(tenant, "p-scope", version.id);
    expect(exported.sourceSnapshot.facts.projectName).toBe("Atlas");
  });
  it("rejects stale revisions and cross-tenant reads, writes, generation and export", async () => {
    await expect(
      service.write(tenant, "p-scope", {
        kind: "declaration",
        revision: register.revision - 1,
        declaration,
      }),
    ).rejects.toThrow("SCOPE_INPUT_CHANGED");
    const other = { ...tenant, organizationId: "another-org" };
    await expect(service.register(other, "p-scope")).rejects.toThrow("Project not found");
    await expect(
      service.write(other, "p-scope", {
        kind: "declaration",
        revision: register.revision,
        declaration,
      }),
    ).rejects.toThrow("Project not found");
    await expect(
      service.launch(other, "p-scope", {
        revision: register.revision,
        fingerprint: register.fingerprint,
      }),
    ).rejects.toThrow("Project not found");
    await expect(
      service.exportVersion(other, "p-scope", register.statements[0]!.id),
    ).rejects.toThrow("Project not found");
  });
  it("discards generation if declarations change while the run executes", async () => {
    register = await service.write(tenant, "p-scope", {
      kind: "verification",
      revision: register.revision,
      fingerprint: register.fingerprint,
      verification,
    });
    const run = await service.launch(tenant, "p-scope", {
      revision: register.revision,
      fingerprint: register.fingerprint,
    });
    register = await service.write(tenant, "p-scope", {
      kind: "declaration",
      revision: register.revision,
      declaration: { ...declaration, notes: "New boundary review" },
    });
    await worker.process({
      data: { organizationId: tenant.organizationId, payload: { runId: run.runId } },
    } as never);
    await refresh();
    expect(register.runs[0]?.status).toBe("FAILED");
    expect(register.runs[0]?.error).toBe("SCOPE_INPUT_CHANGED");
    expect(register.statements.filter((s) => s.status === "DRAFT")).toHaveLength(0);
  });
});
