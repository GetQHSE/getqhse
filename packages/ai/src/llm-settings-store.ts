import {
  llmApiKeyEnvironmentKeys,
  llmSettingsSchema,
  resolveLlmSettings,
  type LlmSettings,
  type LlmSettingsKey,
  type LlmSettingsOverrides,
} from "@qhse/config";
import type { AiProvider } from "@qhse/config";
import type { DatabaseClient, LlmSetting } from "@qhse/database";

import { decryptLlmSecret } from "./llm-secret.js";

export const LLM_SETTINGS_ROW_ID = "singleton";

// Three services read this configuration and only one of them writes it, so propagation is a poll
// rather than a broadcast: a saved change reaches every worker within one interval. Thirty seconds
// is short enough that an administrator sees their change take effect while they are still on the
// page, and long enough that the extra query is invisible next to the model calls it configures.
const DEFAULT_SYNC_INTERVAL_MS = 30_000;

export type ResolvedLlmSettings = LlmSettings & {
  apiKeys: Record<AiProvider, string | null>;
  apiKeySources: Record<AiProvider, "database" | "environment" | "none">;
  /** @deprecated OpenAI compatibility alias. */
  apiKey: string | null;
  /** @deprecated OpenAI compatibility alias. */
  apiKeySource: "database" | "environment" | "none";
};

export type LlmSettingsLoader = () => Promise<LlmSetting | null>;

function resolve(
  record: LlmSetting | null,
  environment: Record<string, string | undefined> = process.env,
): ResolvedLlmSettings {
  const storedKeys: Record<AiProvider, string | null> = {
    openai: record?.apiKeyCiphertext ? decryptLlmSecret(record.apiKeyCiphertext) : null,
    anthropic: record?.anthropicApiKeyCiphertext
      ? decryptLlmSecret(record.anthropicApiKeyCiphertext)
      : null,
    google: record?.googleApiKeyCiphertext ? decryptLlmSecret(record.googleApiKeyCiphertext) : null,
  };
  const environmentKeys: Record<AiProvider, string | null> = {
    openai: environment[llmApiKeyEnvironmentKeys.openai] || null,
    anthropic: environment[llmApiKeyEnvironmentKeys.anthropic] || null,
    google: environment[llmApiKeyEnvironmentKeys.google] || null,
  };
  const apiKeys = Object.fromEntries(
    Object.keys(storedKeys).map((provider) => [
      provider,
      storedKeys[provider as AiProvider] ?? environmentKeys[provider as AiProvider],
    ]),
  ) as Record<AiProvider, string | null>;
  const apiKeySources = Object.fromEntries(
    Object.keys(storedKeys).map((provider) => [
      provider,
      storedKeys[provider as AiProvider]
        ? "database"
        : environmentKeys[provider as AiProvider]
          ? "environment"
          : "none",
    ]),
  ) as Record<AiProvider, "database" | "environment" | "none">;
  return {
    ...resolveLlmSettings(llmSettingsOverridesFromRecord(record), environment),
    apiKeys,
    apiKeySources,
    apiKey: apiKeys.openai,
    apiKeySource: apiKeySources.openai,
  };
}

/** Turns a stored row into overrides, dropping any column that no longer satisfies its schema.
 * A value written before an enum was narrowed must not stop the pipeline: it falls back to the
 * environment the same way an unset column does. */
export function llmSettingsOverridesFromRecord(
  record: LlmSetting | null | undefined,
): LlmSettingsOverrides {
  if (!record) return {};
  const overrides: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(llmSettingsSchema.shape)) {
    const stored: unknown = (record as Record<string, unknown>)[key];
    if (stored === null || stored === undefined) continue;
    // Decimal columns arrive as Prisma Decimal instances rather than numbers.
    const direct = schema.safeParse(stored);
    const parsed = direct.success
      ? direct
      : schema.safeParse(typeof stored === "object" ? Number(stored) : stored);
    if (parsed.success) overrides[key] = parsed.data;
  }
  return overrides;
}

// Null means "nothing loaded", not "nothing configured": the accessor then resolves the
// environment on the spot, which is exactly how these services behaved before the settings row
// existed. Scripts and tests that never start the sync therefore need no extra wiring.
let snapshot: ResolvedLlmSettings | null = null;
let loader: LlmSettingsLoader | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<ResolvedLlmSettings> | null = null;

/** The synchronous accessor every call site uses. */
export function llmSettings(): ResolvedLlmSettings {
  return snapshot ?? resolve(null);
}

export function llmApiKey(provider: AiProvider): string | null {
  return llmSettings().apiKeys[provider];
}

export function isProviderConfigured(provider: AiProvider): boolean {
  return Boolean(llmApiKey(provider));
}

export function configureLlmSettingsLoader(next: LlmSettingsLoader | null): void {
  loader = next;
}

export async function refreshLlmSettings(): Promise<ResolvedLlmSettings> {
  if (!loader) {
    snapshot = null;
    return llmSettings();
  }
  const currentLoader = loader;
  inFlight ??= (async () => {
    try {
      snapshot = resolve(await currentLoader());
    } catch {
      // Keep serving the last good snapshot: a database blip must not silently reconfigure the
      // pipeline, and the next tick will pick the row up again.
    } finally {
      inFlight = null;
    }
    return llmSettings();
  })();
  return await inFlight;
}

/** Loads the row once and then keeps it fresh. Returns the stop function; callers that own a
 * process lifecycle should call it on shutdown so tests and workers exit cleanly. */
export async function startLlmSettingsSync(
  database: DatabaseClient,
  options: { intervalMs?: number } = {},
): Promise<() => void> {
  configureLlmSettingsLoader(() =>
    database.llmSetting.findUnique({ where: { id: LLM_SETTINGS_ROW_ID } }),
  );
  await refreshLlmSettings();
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    void refreshLlmSettings();
  }, options.intervalMs ?? DEFAULT_SYNC_INTERVAL_MS);
  timer.unref?.();
  return stopLlmSettingsSync;
}

export function stopLlmSettingsSync(): void {
  if (timer) clearInterval(timer);
  timer = null;
  snapshot = null;
  configureLlmSettingsLoader(null);
}

/** Test seam: installs a snapshot without touching a database. */
export function setLlmSettingsSnapshot(
  overrides: Partial<ResolvedLlmSettings> = {},
): ResolvedLlmSettings {
  snapshot = { ...resolve(null), ...overrides };
  return snapshot;
}

/** Drops the loaded snapshot so the accessor reads the environment again. */
export function resetLlmSettingsSnapshot(): void {
  snapshot = null;
}

export function llmSettingsFieldKeys(): LlmSettingsKey[] {
  return Object.keys(llmSettingsSchema.shape) as LlmSettingsKey[];
}
