import { afterEach, describe, expect, it, vi } from "vitest";
import { contextInternalIssuesPrompt } from "./prompts/context-internal-issues.prompt.js";
import { promptCatalog, promptPreviewVariables } from "./prompt-catalog.js";
import {
  currentPromptSnapshot,
  promptHash,
  protectedPromptRules,
  refreshAiPrompts,
  renderManagedPrompt,
  renderPromptTemplate,
  startAiPromptSync,
  validatePromptTemplate,
  withPromptRun,
} from "./managed-prompts.js";

const key = "context.internal-issues";
const build = () =>
  contextInternalIssuesPrompt.build({ digest: "Declared company facts", language: "fr" });
let stop = () => {};
afterEach(() => {
  stop();
  vi.useRealTimers();
});

function database() {
  const snapshots = new Map<string, unknown>();
  const findMany = vi.fn().mockResolvedValue([]);
  const findSource = vi.fn().mockResolvedValue(null);
  const upsert = vi
    .fn()
    .mockImplementation(({ where, create }: { where: { runKey: string }; create: unknown }) => {
      if (!snapshots.has(where.runKey)) snapshots.set(where.runKey, structuredClone(create));
      return Promise.resolve({ ...(snapshots.get(where.runKey) as object), usedPrompts: {} });
    });
  return {
    findMany,
    findSource,
    upsert,
    snapshots,
    client: {
      aiPrompt: { findMany },
      aiPromptSetting: { findUnique: findSource },
      aiPromptRunSnapshot: { upsert, update: vi.fn().mockResolvedValue({}) },
    } as never,
  };
}
function publication(template: string, id = "revision-1") {
  return {
    key,
    activeRevision: {
      id,
      promptKey: key,
      baseVersion: contextInternalIssuesPrompt.version,
      template,
      templateHash: promptHash(template),
      status: "VALIDATED",
    },
  };
}

describe("managed prompts", () => {
  it("switches all new runs to code and back without changing published revisions or pinned runs", async () => {
    const db = database();
    const template = currentPromptSnapshot()[key]!.template + "\nDatabase instruction.";
    db.findMany.mockResolvedValue([publication(template)]);
    stop = await startAiPromptSync(db.client);
    await withPromptRun("database-run", async () => {
      expect(build().promptRevisionId).toBe("revision-1");
      db.findSource.mockResolvedValue({ source: "CODE" });
      await refreshAiPrompts();
      expect(build().promptRevisionId).toBe("revision-1");
    });
    expect(build().promptRevisionId).toBeNull();
    expect(build().system).not.toContain("Database instruction.");
    expect(
      Object.values(currentPromptSnapshot()).every((prompt) => prompt.revisionId === null),
    ).toBe(true);
    stop();
    stop = await startAiPromptSync(db.client);
    await withPromptRun("code-run", async () => {
      expect(build().promptRevisionId).toBeNull();
      db.findSource.mockResolvedValue({ source: "DATABASE" });
      await refreshAiPrompts();
      expect(build().promptRevisionId).toBeNull();
    });
    expect(build().promptRevisionId).toBe("revision-1");
    await withPromptRun("code-run", async () => expect(build().promptRevisionId).toBeNull());
    await withPromptRun("database-run", async () =>
      expect(build().promptRevisionId).toBe("revision-1"),
    );
  });

  it("keeps code mode on a failed source refresh", async () => {
    const db = database();
    db.findMany.mockResolvedValue([publication(currentPromptSnapshot()[key]!.template)]);
    db.findSource.mockResolvedValue({ source: "CODE" });
    stop = await startAiPromptSync(db.client);
    db.findSource.mockRejectedValue(new Error("offline"));
    await expect(refreshAiPrompts()).rejects.toThrow("offline");
    expect(build().promptRevisionId).toBeNull();
  });

  it("renders every catalog default and protects runtime language for all project languages", () => {
    expect(new Set(promptCatalog.map((item) => item.key)).size).toBe(promptCatalog.length);
    for (const entry of promptCatalog)
      for (const language of ["fr", "en", "ar"] as const) {
        const output = renderPromptTemplate(
          entry.key,
          entry.template,
          promptPreviewVariables(entry.key, language),
        );
        expect(output).not.toContain("{{");
        expect(output).toContain(protectedPromptRules);
        if (entry.variables.includes("language"))
          expect(output).toContain(`OUTPUT LANGUAGE: Write all generated prose in ${language}`);
      }
    expect(promptPreviewVariables(key, "fr")["isoGuidance"]).toContain("§4.1");
  });

  it("rejects deleted, unknown and malformed placeholders", () => {
    const template = promptCatalog.find((entry) => entry.key === key)!.template;
    expect(() => validatePromptTemplate(key, template.replace("{{languageRule}}", ""))).toThrow(
      "Required placeholder",
    );
    expect(() => validatePromptTemplate(key, template + " {{project.secrets}} ")).toThrow(
      "Unknown prompt placeholder",
    );
    expect(() => validatePromptTemplate(key, template + " {{oops")).toThrow(
      "Invalid prompt placeholder",
    );
    expect(() => renderManagedPrompt("unknown.prompt")).toThrow("Unknown AI prompt");
  });

  it("uses only compatible validated overrides and keeps source material unchanged", async () => {
    const db = database();
    const template =
      currentPromptSnapshot()[key]!.template + "\nPrefer concise concrete descriptions.";
    db.findMany.mockResolvedValue([publication(template)]);
    stop = await startAiPromptSync(db.client);
    expect(build()).toMatchObject({
      promptRevisionId: "revision-1",
      promptHash: promptHash(template),
    });
    expect(build().system).toContain("Prefer concise concrete descriptions.");
    expect(build().context).toContain("Declared company facts");
    db.findMany.mockResolvedValue([
      {
        ...publication(template),
        activeRevision: { ...publication(template).activeRevision, status: "DRAFT" },
      },
    ]);
    await refreshAiPrompts();
    expect(build().promptRevisionId).toBeNull();
  });

  it("pins multi-step jobs and retries across publication and process restart", async () => {
    const db = database();
    stop = await startAiPromptSync(db.client);
    const initial = build();
    const template = currentPromptSnapshot()[key]!.template + "\nNew instruction.";
    await withPromptRun("worker:context:run-1", async () => {
      expect(build().promptRevisionId).toBeNull();
      db.findMany.mockResolvedValue([publication(template)]);
      await refreshAiPrompts();
      expect(build().system).toBe(initial.system);
    });
    expect(build().promptRevisionId).toBe("revision-1");
    stop();
    stop = await startAiPromptSync(db.client);
    await withPromptRun("worker:context:run-1", async () =>
      expect(build().system).toBe(initial.system),
    );
    await withPromptRun("worker:context:run-2", async () =>
      expect(build().promptRevisionId).toBe("revision-1"),
    );
    expect(db.snapshots.size).toBe(2);
  });

  it("keeps the last good publication on a database outage and refuses unauditable runs", async () => {
    const db = database();
    const template = currentPromptSnapshot()[key]!.template + "\nStable instruction.";
    db.findMany.mockResolvedValue([publication(template)]);
    stop = await startAiPromptSync(db.client);
    db.findMany.mockRejectedValue(new Error("offline"));
    await expect(refreshAiPrompts()).rejects.toThrow("offline");
    expect(build().promptRevisionId).toBe("revision-1");
    db.upsert.mockRejectedValue(new Error("offline"));
    const model = vi.fn();
    await expect(withPromptRun("run", model)).rejects.toThrow("offline");
    expect(model).not.toHaveBeenCalled();
  });

  it("falls back for changed code versions, mismatched hashes and cross-prompt revisions", async () => {
    const db = database();
    const template = currentPromptSnapshot()[key]!.template;
    stop = await startAiPromptSync(db.client);
    for (const fields of [
      { baseVersion: 0 },
      { templateHash: "invalid" },
      { promptKey: "profile.chat" },
    ]) {
      db.findMany.mockResolvedValue([
        {
          ...publication(template),
          activeRevision: { ...publication(template).activeRevision, ...fields },
        },
      ]);
      await refreshAiPrompts();
      expect(build().promptRevisionId).toBeNull();
    }
  });
});
