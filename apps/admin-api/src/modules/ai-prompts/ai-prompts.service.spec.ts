import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import {
  getPromptDefinition,
  promptHash,
  setLlmSettingsSnapshot,
  resetLlmSettingsSnapshot,
} from "@qhse/ai";
import type { AuthService } from "../auth/auth.service.js";
import { AiPromptsService } from "./ai-prompts.service.js";

const modelCalls = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("ai", async () => ({ ...(await vi.importActual<object>("ai")), ...modelCalls }));

const key = "context.internal-issues";
const admin = { id: "admin", platformRole: "platform_admin" } as never;
const editor = { id: "editor", platformRole: "content_manager" } as never;
const support = { id: "support", platformRole: "support" } as never;
const publish = {
  revisionId: "rev-1",
  expectedGeneration: 2,
  action: "PUBLISH" as const,
  note: "Reviewed examples",
};
const definition = getPromptDefinition(key);
const revision = {
  id: "rev-1",
  promptKey: key,
  baseVersion: definition.version,
  template: definition.template,
  templateHash: promptHash(definition.template),
  status: "VALIDATED",
};

describe("AiPromptsService", () => {
  const db = {
    aiPromptSetting: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    aiPrompt: { findMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    aiPromptRevision: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    aiPromptTest: { count: vi.fn(), create: vi.fn() },
    aiPromptPublication: { create: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  const service = new AiPromptsService({ database: db } as unknown as AuthService);
  beforeEach(() => {
    vi.resetAllMocks();
    db.aiPromptSetting.findUnique.mockResolvedValue(null);
    db.aiPromptSetting.upsert.mockResolvedValue({ generation: 0, source: "DATABASE" });
    db.aiPromptSetting.updateMany.mockResolvedValue({ count: 1 });
    setLlmSettingsSnapshot({
      profileProvider: "openai",
      profileModel: "gpt-5-mini",
      apiKeys: { openai: "synthetic-preview-key", anthropic: null, google: null },
    });
    modelCalls.generateText.mockResolvedValue({ output: { issues: [] }, text: "{}" });
    db.aiPrompt.findMany.mockResolvedValue([]);
    db.aiPrompt.upsert.mockResolvedValue({ key, activeRevisionId: "previous", generation: 2 });
    db.aiPrompt.updateMany.mockResolvedValue({ count: 1 });
    db.aiPromptRevision.findFirst.mockResolvedValue(revision);
    db.aiPromptRevision.create.mockResolvedValue({ id: "new-draft" });
    db.aiPromptRevision.findMany.mockResolvedValue([]);
    db.aiPromptPublication.findMany.mockResolvedValue([]);
    db.aiPromptTest.count.mockResolvedValue(1);
    db.aiPromptRevision.updateMany.mockResolvedValue({ count: 1 });
    db.$transaction.mockImplementation((work: (client: typeof db) => unknown) => work(db));
  });
  afterEach(() => {
    resetLlmSettingsSnapshot();
  });

  it("defaults to database prompts and restricts source changes to administrators", async () => {
    expect(await service.source()).toEqual({ source: "DATABASE", generation: 0 });
    for (const actor of [support, editor])
      await expect(
        service.updateSource(actor, { source: "CODE", expectedGeneration: 0 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.aiPromptSetting.upsert).not.toHaveBeenCalled();
    expect(await service.updateSource(admin, { source: "CODE", expectedGeneration: 0 })).toEqual({
      source: "CODE",
      generation: 1,
    });
    expect(db.aiPromptSetting.updateMany).toHaveBeenCalledWith({
      where: { id: "singleton", generation: 0 },
      data: { source: "CODE", generation: { increment: 1 }, updatedByUserId: "admin" },
    });
    expect(db.aiPrompt.updateMany).not.toHaveBeenCalled();
    expect(db.aiPromptRevision.updateMany).not.toHaveBeenCalled();
  });

  it("rejects stale and concurrent source changes", async () => {
    await expect(
      service.updateSource(admin, { source: "CODE", expectedGeneration: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.aiPromptSetting.updateMany).not.toHaveBeenCalled();
    db.aiPromptSetting.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.updateSource(admin, { source: "CODE", expectedGeneration: 0 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("previews the exact saved revision with runtime language and records output without retaining sample inputs", async () => {
    await service.test(editor, key, "rev-1", {
      language: "ar",
      context: "Synthetic company facts",
      countries: "MA",
    });
    expect(modelCalls.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("LANGUE DE SORTIE"),
        prompt: expect.stringContaining("Synthetic company facts"),
        maxRetries: 0,
      }),
    );
    expect(db.aiPromptTest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        revisionId: "rev-1",
        language: "ar",
        output: '{\n  "issues": []\n}',
        inputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        createdById: "editor",
      }),
    });
    expect(JSON.stringify(db.aiPromptTest.create.mock.calls)).not.toContain(
      "Synthetic company facts",
    );
  });

  it("does not save preview evidence after a model failure or an unauthorized attempt", async () => {
    await expect(
      service.test(support, key, "rev-1", {
        language: "fr",
        context: "Synthetic facts",
        countries: "MA",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(modelCalls.generateText).not.toHaveBeenCalled();
    modelCalls.generateText.mockRejectedValue(new Error("Provider unavailable"));
    await expect(
      service.test(editor, key, "rev-1", {
        language: "fr",
        context: "Synthetic facts",
        countries: "MA",
      }),
    ).rejects.toThrow("Provider unavailable");
    expect(db.aiPromptTest.create).not.toHaveBeenCalled();
  });

  it("allows content managers to create immutable drafts but rejects support writes", async () => {
    const input = { template: definition.template, changeNote: "Sharper wording" };
    await expect(service.create(support, key, input)).rejects.toBeInstanceOf(ForbiddenException);
    await service.create(editor, key, input);
    expect(db.aiPromptRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdById: "editor",
        templateHash: promptHash(input.template),
      }),
    });
    expect(db.aiPrompt.updateMany).not.toHaveBeenCalled();
  });

  it("requires preview evidence and records manual validation against the exact revision", async () => {
    db.aiPromptTest.count.mockResolvedValue(0);
    await expect(
      service.validate(editor, key, "rev-1", { note: "Reviewed all examples" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.aiPromptRevision.updateMany).not.toHaveBeenCalled();
    db.aiPromptTest.count.mockResolvedValue(1);
    await service.validate(editor, key, "rev-1", { note: "Reviewed all examples" });
    expect(db.aiPromptRevision.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "rev-1", promptKey: key, status: "DRAFT" },
        data: expect.objectContaining({ validatedById: "editor" }),
      }),
    );
  });

  it("restricts publication and rejects unvalidated or obsolete revisions", async () => {
    await expect(service.publish(editor, key, publish)).rejects.toBeInstanceOf(ForbiddenException);
    db.aiPromptRevision.findFirst.mockResolvedValue({ ...revision, status: "DRAFT" });
    await expect(service.publish(admin, key, publish)).rejects.toBeInstanceOf(ConflictException);
    db.aiPromptRevision.findFirst.mockResolvedValue({ ...revision, baseVersion: 0 });
    await expect(service.publish(admin, key, publish)).rejects.toBeInstanceOf(ConflictException);
    expect(db.aiPrompt.updateMany).not.toHaveBeenCalled();
  });

  it("publishes with an optimistic lock and appends the previous revision to history", async () => {
    await service.publish(admin, key, publish);
    expect(db.aiPrompt.updateMany).toHaveBeenCalledWith({
      where: { key, generation: 2 },
      data: { activeRevisionId: "rev-1", generation: { increment: 1 } },
    });
    expect(db.aiPromptPublication.create).toHaveBeenCalledWith({
      data: {
        promptKey: key,
        revisionId: "rev-1",
        previousRevisionId: "previous",
        action: "PUBLISH",
        note: "Reviewed examples",
        actorId: "admin",
      },
    });
    db.aiPrompt.updateMany.mockResolvedValue({ count: 0 });
    db.aiPromptPublication.create.mockClear();
    await expect(service.publish(admin, key, publish)).rejects.toBeInstanceOf(ConflictException);
    expect(db.aiPromptPublication.create).not.toHaveBeenCalled();
  });

  it("records rollback and reset without editing any revision", async () => {
    await service.publish(admin, key, { ...publish, action: "ROLLBACK" });
    await service.publish(admin, key, { ...publish, action: "RESET", revisionId: null });
    expect(db.aiPromptPublication.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        action: "RESET",
        revisionId: null,
        previousRevisionId: "previous",
      }),
    });
    expect(db.aiPromptRevision.updateMany).not.toHaveBeenCalled();
  });

  it("resolves revision IDs under their prompt key and rejects stale publication views", async () => {
    db.aiPromptRevision.findFirst.mockResolvedValue(null);
    await expect(service.publish(admin, key, publish)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.aiPromptRevision.findFirst).toHaveBeenCalledWith({
      where: { id: "rev-1", promptKey: key },
    });
    db.aiPromptRevision.findFirst.mockResolvedValue(revision);
    await expect(
      service.publish(admin, key, { ...publish, expectedGeneration: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.aiPrompt.updateMany).not.toHaveBeenCalled();
  });
});
