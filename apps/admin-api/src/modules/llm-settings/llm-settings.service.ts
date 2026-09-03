import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import {
  encryptLlmSecret,
  llmSettingsOverridesFromRecord,
  maskLlmSecret,
  refreshLlmSettings,
  LLM_SETTINGS_ROW_ID,
} from "@qhse/ai";
import type { CurrentUser } from "@qhse/auth";
import {
  llmApiKeyEnvironmentKey,
  llmSettingsEnvironmentKeys,
  llmSettingsFromEnvironment,
  llmSettingsSchema,
  resolveLlmSettings,
  type LlmSettingsKey,
} from "@qhse/config";
import type { DatabaseClient, LlmSetting } from "@qhse/database";

import { AuthService } from "../auth/auth.service.js";
import type { LlmSettingsView, UpdateLlmSettingsInput } from "./llm-settings.contracts.js";

// Reading the configuration is useful to anyone who supports the platform, but the API key and the
// spend ceiling are not: writes are limited to the two roles that already carry platform-wide
// responsibility.
const WRITE_ROLES = new Set(["super_admin", "platform_admin"]);

@Injectable()
export class LlmSettingsService {
  constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
  ) {}

  private get database(): DatabaseClient {
    return this.auth.database;
  }

  async read(): Promise<LlmSettingsView> {
    return this.toView(await this.load());
  }

  async update(actor: CurrentUser, input: UpdateLlmSettingsInput): Promise<LlmSettingsView> {
    this.requireWriteAccess(actor);
    const { apiKey, ...overrides } = input;
    const data: Record<string, unknown> = { ...overrides, updatedByUserId: actor.id };
    if (apiKey !== undefined) {
      // An empty string is a deliberate "stop using the stored key", which is different from
      // leaving the field alone.
      const trimmed = apiKey?.trim() ?? "";
      data["apiKeyCiphertext"] = trimmed ? encryptLlmSecret(trimmed) : null;
      data["apiKeyPreview"] = trimmed ? maskLlmSecret(trimmed) : null;
    }
    const record = await this.database.llmSetting.upsert({
      where: { id: LLM_SETTINGS_ROW_ID },
      create: { id: LLM_SETTINGS_ROW_ID, ...data },
      update: data,
    });
    // The admin API resolves model calls of its own (search testing), so it refreshes immediately
    // instead of waiting out its own poll interval. The other services pick the change up on theirs.
    await refreshLlmSettings();
    return this.toView(record);
  }

  /** Drops every override at once, handing the whole configuration back to the environment. */
  async reset(actor: CurrentUser): Promise<LlmSettingsView> {
    this.requireWriteAccess(actor);
    await this.database.llmSetting.deleteMany({ where: { id: LLM_SETTINGS_ROW_ID } });
    await refreshLlmSettings();
    return this.toView(null);
  }

  private async load(): Promise<LlmSetting | null> {
    return await this.database.llmSetting.findUnique({ where: { id: LLM_SETTINGS_ROW_ID } });
  }

  private async toView(record: LlmSetting | null): Promise<LlmSettingsView> {
    const overrides = llmSettingsOverridesFromRecord(record);
    const updatedBy = record?.updatedByUserId
      ? await this.database.user.findUnique({
          where: { id: record.updatedByUserId },
          select: { id: true, name: true },
        })
      : null;
    const environmentKey = process.env[llmApiKeyEnvironmentKey];
    return {
      effective: resolveLlmSettings(overrides, process.env),
      overrides,
      environmentDefaults: llmSettingsFromEnvironment(process.env),
      environmentKeys: llmSettingsEnvironmentKeys,
      apiKey: {
        configured: Boolean(record?.apiKeyCiphertext ?? environmentKey),
        source: record?.apiKeyCiphertext ? "database" : environmentKey ? "environment" : "none",
        preview:
          record?.apiKeyPreview ?? (environmentKey ? maskLlmSecret(environmentKey) : null) ?? null,
      },
      updatedAt: record?.updatedAt.toISOString() ?? null,
      updatedBy,
    };
  }

  private requireWriteAccess(actor: CurrentUser) {
    if (!WRITE_ROLES.has(actor.platformRole ?? "")) {
      throw new ForbiddenException("Only a platform administrator can change the LLM settings");
    }
  }
}

export const llmSettingsFieldKeys = Object.keys(llmSettingsSchema.shape) as LlmSettingsKey[];
