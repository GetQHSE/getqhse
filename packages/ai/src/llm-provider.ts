import { createAnthropic, type AnthropicProvider } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI, type GoogleGenerativeAIProvider } from "@ai-sdk/google";
import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import { findModelDefinition } from "@qhse/config";
import type { AiProvider, EmbeddingProvider, LanguageProvider } from "@qhse/config";
import type { EmbeddingModel, JSONValue, LanguageModel } from "ai";

type ProviderOptions = Record<string, Record<string, JSONValue | undefined>>;

import { isProviderConfigured, llmApiKey, llmSettings } from "./llm-settings-store.js";

type ProviderClients = {
  openai: OpenAIProvider;
  anthropic: AnthropicProvider;
  google: GoogleGenerativeAIProvider;
};

const providers = new Map<string, ProviderClients[AiProvider]>();

export class LlmNotConfiguredError extends Error {
  constructor(readonly provider: AiProvider = "openai") {
    super(`No ${provider} API key is configured`);
    this.name = "LlmNotConfiguredError";
  }
}

export { isProviderConfigured };

/** @deprecated Prefer isProviderConfigured(provider). */
export function isLlmConfigured(): boolean {
  return isProviderConfigured("openai");
}

function providerClient<P extends AiProvider>(provider: P): ProviderClients[P] {
  const apiKey = llmApiKey(provider);
  if (!apiKey) throw new LlmNotConfiguredError(provider);
  const cacheKey = `${provider}:${apiKey}`;
  const cached = providers.get(cacheKey);
  if (cached) return cached as ProviderClients[P];
  const client = (
    provider === "openai"
      ? createOpenAI({ apiKey })
      : provider === "anthropic"
        ? createAnthropic({ apiKey })
        : createGoogleGenerativeAI({ apiKey })
  ) as ProviderClients[P];
  for (const key of providers.keys()) {
    if (key.startsWith(`${provider}:`)) providers.delete(key);
  }
  providers.set(cacheKey, client);
  return client;
}

/** OpenAI-only capabilities such as transcription remain available through this compatibility API. */
export function openAiProvider(): OpenAIProvider {
  return providerClient("openai");
}

export function languageModel(input: { provider: LanguageProvider; model: string }): LanguageModel {
  const provider = providerClient(input.provider);
  if (input.provider === "openai") return (provider as OpenAIProvider).responses(input.model);
  return provider.languageModel(input.model);
}

export function embeddingModel(input: {
  provider: EmbeddingProvider;
  model: string;
  purpose: "document" | "query";
}): EmbeddingModel {
  return providerClient(input.provider).embedding(input.model);
}

export function embeddingProviderOptions(
  provider: EmbeddingProvider,
  purpose: "document" | "query",
): ProviderOptions {
  return provider === "openai"
    ? { openai: { dimensions: 768 } }
    : {
        google: {
          outputDimensionality: 768,
          taskType: purpose === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
        },
      };
}

export function languageProviderOptions(
  provider: LanguageProvider,
  input: { model?: string; reasoningEffort?: string; promptCacheKey?: string } = {},
): ProviderOptions {
  const settings = llmSettings();
  const controls = input.model
    ? new Set(findModelDefinition(provider, input.model, settings.customModels)?.advancedControls)
    : null;
  if (provider === "openai") {
    return {
      openai: {
        store: false,
        ...((controls?.has("reasoningEffort") ?? true)
          ? { reasoningEffort: input.reasoningEffort ?? settings.regulatoryReasoningEffort }
          : {}),
        ...((controls?.has("serviceTier") ?? true)
          ? { serviceTier: settings.regulatoryServiceTier }
          : {}),
        ...((controls?.has("verbosity") ?? true)
          ? { textVerbosity: settings.regulatoryTextVerbosity }
          : {}),
        ...(input.promptCacheKey && (controls?.has("cacheRetention") ?? true)
          ? {
              promptCacheKey: input.promptCacheKey,
              promptCacheRetention: settings.regulatoryPromptCacheRetention,
            }
          : {}),
      },
    };
  }
  if (provider === "anthropic") {
    return {
      anthropic: {
        ...((controls?.has("anthropicEffort") ?? true) ? { effort: settings.anthropicEffort } : {}),
        ...((controls?.has("anthropicSpeed") ?? true) ? { speed: settings.anthropicSpeed } : {}),
        structuredOutputMode: "auto",
      },
    };
  }
  return {
    google: {
      ...(controls?.has("thinkingLevel")
        ? {
            thinkingConfig: {
              thinkingLevel: settings.googleThinkingLevel,
              includeThoughts: false,
            },
          }
        : (controls?.has("thinkingBudget") ?? true) && settings.googleThinkingBudget !== null
          ? {
              thinkingConfig: {
                thinkingBudget: settings.googleThinkingBudget,
                includeThoughts: false,
              },
            }
          : {}),
    },
  };
}

export function providerWebSearch(provider: LanguageProvider): { name: string; tool: unknown } {
  const client = providerClient(provider);
  if (provider === "openai") {
    return {
      name: "web_search",
      tool: (client as OpenAIProvider).tools.webSearch({
        externalWebAccess: true,
        searchContextSize: "medium",
        userLocation: { type: "approximate", country: "MA", timezone: "Africa/Casablanca" },
      }),
    };
  }
  if (provider === "anthropic") {
    return {
      name: "web_search",
      tool: (client as AnthropicProvider).tools.webSearch_20250305({
        maxUses: 5,
        userLocation: { type: "approximate", country: "MA", timezone: "Africa/Casablanca" },
      }),
    };
  }
  return {
    name: "google_search",
    tool: (client as GoogleGenerativeAIProvider).tools.googleSearch({
      searchTypes: { webSearch: {} },
    }),
  };
}
