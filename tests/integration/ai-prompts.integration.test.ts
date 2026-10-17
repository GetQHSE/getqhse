import { readFile, readdir } from "node:fs/promises";
import { GenericContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";
import {
  getPromptDefinition,
  refreshAiPrompts,
  renderManagedPrompt,
  promptPreviewVariables,
  startAiPromptSync,
  withPromptRun,
} from "@qhse/ai";
import { AiPromptsService } from "../../apps/admin-api/src/modules/ai-prompts/ai-prompts.service.js";
import type { AuthService } from "../../apps/admin-api/src/modules/auth/auth.service.js";

describe.skipIf(process.env["TESTCONTAINERS_ENABLED"] !== "true")(
  "Persisted AI prompt publication",
  () => {
    let postgres: Awaited<ReturnType<GenericContainer["start"]>>;
    let db: DatabaseClient;
    let service: AiPromptsService;
    let stop = () => {};
    const actor = { id: "prompt-admin", platformRole: "platform_admin" } as never;
    const key = "context.internal-issues";
    const definition = getPromptDefinition(key);
    const render = () => renderManagedPrompt(key, promptPreviewVariables(key, "fr"));

    beforeAll(async () => {
      postgres = await new GenericContainer("pgvector/pgvector:0.8.6-pg18")
        .withEnvironment({
          POSTGRES_DB: "prompt_test",
          POSTGRES_USER: "prompt_test",
          POSTGRES_PASSWORD: "prompt_test",
        })
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
        .start();
      const url = `postgresql://prompt_test:prompt_test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/prompt_test`;
      const { Client } = await import("pg");
      const pg = new Client({ connectionString: url });
      await pg.connect();
      const root = new URL("../../packages/database/prisma/migrations/", import.meta.url);
      for (const migration of (await readdir(root, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()) {
        await pg.query(await readFile(new URL(`${migration}/migration.sql`, root), "utf8"));
      }
      await pg.end();
      db = createPrismaClient(url);
      service = new AiPromptsService({ database: db } as unknown as AuthService);
      stop = await startAiPromptSync(db);
    });
    afterAll(async () => {
      stop();
      await db?.$disconnect();
      await postgres?.stop();
    });

    async function draft(note: string) {
      const view = await service.create(actor, key, {
        template: definition.template + `\n${note}`,
        changeNote: note,
      });
      const id = view.createdRevisionId;
      // A controlled preview fixture replaces a paid provider call; publication still follows the real service path.
      await db.aiPromptTest.create({
        data: {
          revisionId: id,
          language: "fr",
          inputHash: "synthetic",
          output: '{"issues":[]}',
          provider: "fixture",
          model: "fixture",
          createdById: "reviewer",
        },
      });
      await service.validate(actor, key, id, { note: "Reviewed synthetic examples" });
      return id;
    }

    it("applies the migration, publishes atomically, pins retries and preserves rollback history", async () => {
      const first = await draft("First editorial version");
      const input = {
        revisionId: first,
        expectedGeneration: 0,
        action: "PUBLISH" as const,
        note: "Approved first version",
      };
      const concurrent = await Promise.allSettled([
        service.publish(actor, key, input),
        service.publish(actor, key, input),
      ]);
      expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(await db.aiPromptPublication.count({ where: { promptKey: key } })).toBe(1);
      expect(render().promptRevisionId).toBe(first);
      const sourceChanges = await Promise.allSettled([
        service.updateSource(actor, { source: "CODE", expectedGeneration: 0 }),
        service.updateSource(actor, { source: "CODE", expectedGeneration: 0 }),
      ]);
      expect(sourceChanges.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(render().promptRevisionId).toBeNull();
      expect((await db.aiPrompt.findUniqueOrThrow({ where: { key } })).activeRevisionId).toBe(
        first,
      );
      stop();
      stop = await startAiPromptSync(db);
      expect(render().promptRevisionId).toBeNull();
      await withPromptRun("integration:code-run", async () => {
        expect(render().promptRevisionId).toBeNull();
        await service.updateSource(actor, { source: "DATABASE", expectedGeneration: 1 });
        expect(render().promptRevisionId).toBeNull();
      });
      expect(render().promptRevisionId).toBe(first);
      const second = await draft("Second editorial version");
      await withPromptRun("integration:pinned-run", async () => {
        expect(render().promptRevisionId).toBe(first);
        await service.publish(actor, key, { ...input, revisionId: second, expectedGeneration: 1 });
        await refreshAiPrompts();
        expect(render().promptRevisionId).toBe(first);
      });
      expect(render().promptRevisionId).toBe(second);
      stop();
      stop = await startAiPromptSync(db);
      await withPromptRun("integration:pinned-run", async () =>
        expect(render().promptRevisionId).toBe(first),
      );
      await service.publish(actor, key, {
        ...input,
        revisionId: first,
        action: "ROLLBACK",
        expectedGeneration: 2,
      });
      expect(render().promptRevisionId).toBe(first);
      await service.publish(actor, key, {
        ...input,
        revisionId: null,
        action: "RESET",
        expectedGeneration: 3,
      });
      expect(render().promptRevisionId).toBeNull();
      expect(await db.aiPromptPublication.count({ where: { promptKey: key } })).toBe(4);
      expect(await db.aiPromptRevision.count({ where: { promptKey: key } })).toBe(2);
      expect(await db.aiPromptRunSnapshot.count()).toBe(2);
      const pinned = await db.aiPromptRunSnapshot.findUniqueOrThrow({
        where: { runKey: "integration:pinned-run" },
      });
      expect(pinned.usedPrompts).toMatchObject({ [key]: { revisionId: first } });
    });
  },
);
