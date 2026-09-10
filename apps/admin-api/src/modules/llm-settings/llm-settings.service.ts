import {
  ForbiddenException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  embeddingModel,
  embeddingProviderOptions,
  encryptLlmSecret,
  languageModel,
  llmSettingsOverridesFromRecord,
  maskLlmSecret,
  refreshLlmSettings,
  LLM_SETTINGS_ROW_ID,
} from "@qhse/ai";
import type { CurrentUser } from "@qhse/auth";
import {
  findModelDefinition,
  languageProviders,
  llmApiKeyEnvironmentKeys,
  llmSettingsEnvironmentKeys,
  llmSettingsFromEnvironment,
  llmSettingsSchema,
  modelCatalog,
  resolveLlmSettings,
  type LlmSettingsKey,
  type AiProvider,
} from "@qhse/config";
import type { DatabaseClient, LlmSetting } from "@qhse/database";
import { embed, generateText } from "ai";

import { AuthService } from "../auth/auth.service.js";
import type {
  LlmSettingsView,
  ProviderHealthCheckInput,
  ProviderHealthCheckResult,
  UpdateLlmSettingsInput,
} from "./llm-settings.contracts.js";

// Reading the configuration is useful to anyone who supports the platform, but the API key and the
// spend ceiling are not: writes are limited to the two roles that already carry platform-wide
// responsibility.
const WRITE_ROLES = new Set(["super_admin", "platform_admin"]);

function providerStatusCode(error: unknown): number | null {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const statusCode = (current as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === "number") return statusCode;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/** Preserve enough of the failure class to make the health check actionable without returning
 * the provider body, URL, headers, model prompt, or credential. */
function safeProviderError(error: unknown): string {
  const statusCode = providerStatusCode(error);
  if (statusCode === 401 || statusCode === 403) {
    return "Credential or provider access was rejected";
  }
  if (statusCode === 404) return "The selected model is unavailable to this provider account";
  if (statusCode === 408 || statusCode === 429) {
    return statusCode === 429
      ? "Provider rate limit or quota was exceeded"
      : "Provider request timed out";
  }
  if (statusCode !== null && statusCode >= 500) return "The provider is temporarily unavailable";
  if (statusCode !== null && statusCode >= 400) return "The provider rejected the model request";

  const message = error instanceof Error ? error.message : "";
  if (/timeout|timed out|abort/iu.test(message)) return "Provider request timed out";
  if (/key|credential|auth|401|403/iu.test(message)) {
    return "Credential or provider access was rejected";
  }
  return "Provider request failed";
}

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
    const { apiKey, apiKeys, ...overrides } = input;
    const current = await this.load();
    const currentOverrides = llmSettingsOverridesFromRecord(current);
    const nextSettings = resolveLlmSettings({ ...currentOverrides, ...overrides }, process.env);
    const selectionChanged = Object.keys(overrides).some(
      (key) => key.endsWith("Provider") || key.endsWith("Model") || key === "customModels",
    );
    if (selectionChanged) this.validateSelections(nextSettings);
    this.validateAdvancedControlUpdates(nextSettings, overrides);
    const data: Record<string, unknown> = { ...overrides, updatedByUserId: actor.id };
    const credentialUpdates = {
      ...(apiKeys ?? {}),
      ...(apiKey !== undefined ? { openai: apiKey } : {}),
    };
    for (const [provider, value] of Object.entries(credentialUpdates)) {
      const trimmed = value?.trim() ?? "";
      const prefix = provider === "openai" ? "apiKey" : `${provider}ApiKey`;
      data[`${prefix}Ciphertext`] = trimmed ? encryptLlmSecret(trimmed) : null;
      data[`${prefix}Preview`] = trimmed ? maskLlmSecret(trimmed) : null;
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

  private validateSelections(settings: ReturnType<typeof llmSettingsFromEnvironment>): void {
    const selections = [
      {
        name: "profile chat",
        provider: settings.profileProvider,
        model: settings.profileModel,
        capabilities: ["language", "tools"] as const,
        priced: false,
      },
      {
        name: "regulatory drafting",
        provider: settings.regulatoryProvider,
        model: settings.regulatoryModel,
        capabilities: ["language", "structuredOutput", "webSearch"] as const,
        priced: true,
      },
      {
        name: "regulatory verification",
        provider: settings.regulatoryVerificationProvider,
        model: settings.regulatoryVerificationModel,
        capabilities: ["language", "structuredOutput"] as const,
        priced: true,
      },
      {
        name: "embedding",
        provider: settings.embeddingProvider,
        model: settings.embeddingModel,
        capabilities: ["embedding"] as const,
        priced: false,
      },
    ];
    for (const selection of selections) {
      const definition = findModelDefinition(
        selection.provider,
        selection.model,
        settings.customModels,
      );
      if (!definition) {
        throw new UnprocessableEntityException(
          `${selection.name} model must be in the tested or custom model catalog`,
        );
      }
      if (selection.capabilities.some((capability) => !definition.capabilities[capability])) {
        throw new UnprocessableEntityException(
          `${selection.provider}:${selection.model} does not support ${selection.name}`,
        );
      }
      if (selection.priced && !definition.rates) {
        throw new UnprocessableEntityException(
          `${selection.provider}:${selection.model} requires token prices for regulatory use`,
        );
      }
    }
  }

  private validateAdvancedControlUpdates(
    settings: ReturnType<typeof llmSettingsFromEnvironment>,
    overrides: Record<string, unknown>,
  ): void {
    const controls = [
      { field: "regulatoryReasoningEffort", provider: "openai", control: "reasoningEffort" },
      { field: "regulatoryServiceTier", provider: "openai", control: "serviceTier" },
      { field: "regulatoryTextVerbosity", provider: "openai", control: "verbosity" },
      { field: "regulatoryPromptCacheRetention", provider: "openai", control: "cacheRetention" },
      { field: "anthropicEffort", provider: "anthropic", control: "anthropicEffort" },
      { field: "anthropicSpeed", provider: "anthropic", control: "anthropicSpeed" },
      { field: "googleThinkingLevel", provider: "google", control: "thinkingLevel" },
      { field: "googleThinkingBudget", provider: "google", control: "thinkingBudget" },
    ] as const;
    const selections = [
      [settings.profileProvider, settings.profileModel],
      [settings.regulatoryProvider, settings.regulatoryModel],
      [settings.regulatoryVerificationProvider, settings.regulatoryVerificationModel],
    ] as const;
    for (const option of controls) {
      if (!(option.field in overrides) || overrides[option.field] === null) continue;
      const incompatible = selections.find(
        ([provider, model]) =>
          provider === option.provider &&
          !findModelDefinition(provider, model, settings.customModels)?.advancedControls.includes(
            option.control,
          ),
      );
      if (incompatible) {
        throw new UnprocessableEntityException(
          `${incompatible[0]}:${incompatible[1]} does not support ${option.field}`,
        );
      }
    }
  }

  async testProvider(
    actor: CurrentUser,
    provider: AiProvider,
    input: ProviderHealthCheckInput,
  ): Promise<ProviderHealthCheckResult> {
    this.requireWriteAccess(actor);
    const startedAt = Date.now();
    try {
      if (input.capability === "embedding") {
        if (provider === "anthropic") throw new Error("Anthropic does not support embeddings");
        await embed({
          model: embeddingModel({ provider, model: input.model, purpose: "query" }),
          value: "QHSE provider health check",
          providerOptions: embeddingProviderOptions(provider, "query"),
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(15_000),
          telemetry: { isEnabled: false },
        });
      } else {
        await generateText({
          model: languageModel({ provider, model: input.model }),
          prompt: "Reply with OK.",
          // Reasoning tokens count against this ceiling. Eight tokens can be consumed before a
          // reasoning model emits the requested visible text, producing a false-negative check.
          maxOutputTokens: 128,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(15_000),
          telemetry: { isEnabled: false },
        });
      }
      return {
        ok: true,
        provider,
        capability: input.capability,
        model: input.model,
        latencyMs: Date.now() - startedAt,
        error: null,
      };
    } catch (error) {
      return {
        ok: false,
        provider,
        capability: input.capability,
        model: input.model,
        latencyMs: Date.now() - startedAt,
        error: safeProviderError(error),
      };
    }
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
    const credentials = Object.fromEntries(
      languageProviders.map((provider) => {
        const ciphertext =
          provider === "openai"
            ? record?.apiKeyCiphertext
            : provider === "anthropic"
              ? record?.anthropicApiKeyCiphertext
              : record?.googleApiKeyCiphertext;
        const storedPreview =
          provider === "openai"
            ? record?.apiKeyPreview
            : provider === "anthropic"
              ? record?.anthropicApiKeyPreview
              : record?.googleApiKeyPreview;
        const environmentKey = process.env[llmApiKeyEnvironmentKeys[provider]];
        return [
          provider,
          {
            configured: Boolean(ciphertext ?? environmentKey),
            source: ciphertext ? "database" : environmentKey ? "environment" : "none",
            preview: storedPreview ?? (environmentKey ? maskLlmSecret(environmentKey) : null),
          },
        ];
      }),
    ) as LlmSettingsView["credentials"];
    const effective = resolveLlmSettings(overrides, process.env);
    return {
      effective,
      overrides,
      environmentDefaults: llmSettingsFromEnvironment(process.env),
      environmentKeys: llmSettingsEnvironmentKeys,
      credentials,
      apiKey: credentials.openai,
      catalog: modelCatalog(effective.customModels),
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
