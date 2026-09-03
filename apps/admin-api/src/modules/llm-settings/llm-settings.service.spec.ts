import { ForbiddenException } from "@nestjs/common";
import { decryptLlmSecret, resetLlmSettingsSnapshot } from "@qhse/ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthService } from "../auth/auth.service.js";
import { LlmSettingsService } from "./llm-settings.service.js";

const superAdmin = { id: "super-1", platformRole: "super_admin" } as never;
const contentManager = { id: "content-1", platformRole: "content_manager" } as never;

const storedRow = (overrides: Record<string, unknown> = {}) => ({
  id: "singleton",
  regulatoryModel: null,
  regulatoryServiceTier: null,
  apiKeyCiphertext: null,
  apiKeyPreview: null,
  updatedByUserId: null,
  createdAt: new Date("2026-09-01T10:00:00Z"),
  updatedAt: new Date("2026-09-01T10:00:00Z"),
  ...overrides,
});

describe("LlmSettingsService", () => {
  const llmSetting = {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  };
  const user = { findUnique: vi.fn() };
  const database = { llmSetting, user };
  const service = new LlmSettingsService({ database } as unknown as AuthService);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    llmSetting.findUnique.mockResolvedValue(null);
    user.findUnique.mockResolvedValue(null);
    resetLlmSettingsSnapshot();
  });

  afterEach(() => {
    resetLlmSettingsSnapshot();
    vi.unstubAllEnvs();
  });

  it("reports the environment as the effective configuration when nothing is stored", async () => {
    vi.stubEnv("OPENAI_REGULATORY_MODEL", "gpt-5");
    vi.stubEnv("OPENAI_API_KEY", "sk-proj-environment");

    const view = await service.read();

    expect(view.effective.regulatoryModel).toBe("gpt-5");
    expect(view.overrides).toEqual({});
    expect(view.apiKey).toMatchObject({ configured: true, source: "environment" });
    expect(view.environmentKeys.regulatoryModel).toBe("OPENAI_REGULATORY_MODEL");
    expect(view.updatedAt).toBeNull();
  });

  it("separates what is overridden from what the environment still supplies", async () => {
    vi.stubEnv("OPENAI_REGULATORY_MODEL", "gpt-5");
    vi.stubEnv("OPENAI_REGULATORY_SERVICE_TIER", "priority");
    llmSetting.findUnique.mockResolvedValue(storedRow({ regulatoryModel: "gpt-5-nano" }));

    const view = await service.read();

    expect(view.overrides).toEqual({ regulatoryModel: "gpt-5-nano" });
    expect(view.effective.regulatoryModel).toBe("gpt-5-nano");
    expect(view.effective.regulatoryServiceTier).toBe("priority");
    expect(view.environmentDefaults.regulatoryModel).toBe("gpt-5");
  });

  it("encrypts a new API key and only ever exposes a masked preview", async () => {
    llmSetting.upsert.mockImplementation(({ update }: { update: Record<string, unknown> }) =>
      Promise.resolve(storedRow(update)),
    );

    const view = await service.update(superAdmin, { apiKey: "sk-proj-secret-1234" });

    const written = llmSetting.upsert.mock.calls[0]![0].update as Record<string, string>;
    expect(written["apiKeyCiphertext"]).not.toContain("sk-proj-secret-1234");
    expect(decryptLlmSecret(written["apiKeyCiphertext"]!)).toBe("sk-proj-secret-1234");
    expect(view.apiKey).toMatchObject({
      configured: true,
      source: "database",
      preview: "••••••••1234",
    });
    expect(JSON.stringify(view)).not.toContain("sk-proj-secret-1234");
  });

  it("treats an empty API key as handing the credential back to the environment", async () => {
    llmSetting.upsert.mockResolvedValue(storedRow());

    await service.update(superAdmin, { apiKey: "" });

    expect(llmSetting.upsert.mock.calls[0]![0].update).toMatchObject({
      apiKeyCiphertext: null,
      apiKeyPreview: null,
    });
  });

  it("leaves the stored key alone when the payload omits it", async () => {
    llmSetting.upsert.mockResolvedValue(storedRow({ regulatoryModel: "gpt-5-nano" }));

    await service.update(superAdmin, { regulatoryModel: "gpt-5-nano" });

    expect(llmSetting.upsert.mock.calls[0]![0].update).not.toHaveProperty("apiKeyCiphertext");
  });

  it("records who made the change", async () => {
    llmSetting.upsert.mockResolvedValue(storedRow({ updatedByUserId: "super-1" }));
    user.findUnique.mockResolvedValue({ id: "super-1", name: "Sara Idrissi" });

    const view = await service.update(superAdmin, { regulatoryModel: "gpt-5" });

    expect(llmSetting.upsert.mock.calls[0]![0].update).toMatchObject({
      updatedByUserId: "super-1",
    });
    expect(view.updatedBy).toEqual({ id: "super-1", name: "Sara Idrissi" });
  });

  it("refuses writes from a role that does not administer the platform", async () => {
    await expect(
      service.update(contentManager, { regulatoryModel: "gpt-5" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.reset(contentManager)).rejects.toBeInstanceOf(ForbiddenException);
    expect(llmSetting.upsert).not.toHaveBeenCalled();
    expect(llmSetting.deleteMany).not.toHaveBeenCalled();
  });

  it("drops every override on reset", async () => {
    vi.stubEnv("OPENAI_REGULATORY_MODEL", "gpt-5");
    llmSetting.deleteMany.mockResolvedValue({ count: 1 });

    const view = await service.reset(superAdmin);

    expect(llmSetting.deleteMany).toHaveBeenCalledWith({ where: { id: "singleton" } });
    expect(view.overrides).toEqual({});
    expect(view.effective.regulatoryModel).toBe("gpt-5");
  });
});
