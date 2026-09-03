import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";

import { llmSettings } from "./llm-settings-store.js";

// The package-level `openai` provider reads OPENAI_API_KEY from the environment, which stops being
// the whole answer once the key can also live in the settings row. Providers are cached per key so
// swapping the key in the admin workspace builds one new client rather than one per model call.
const providers = new Map<string, OpenAIProvider>();

export class LlmNotConfiguredError extends Error {
  constructor(message = "No OpenAI API key is configured") {
    super(message);
    this.name = "LlmNotConfiguredError";
  }
}

export function llmApiKey(): string | null {
  return llmSettings().apiKey;
}

export function isLlmConfigured(): boolean {
  return Boolean(llmSettings().apiKey);
}

/** The provider bound to the currently resolved key. Throws rather than falling back to an
 * unkeyed client, so a missing key surfaces as a configuration error at the call site instead of
 * a 401 from the provider. */
export function openAiProvider(): OpenAIProvider {
  const apiKey = llmApiKey();
  if (!apiKey) throw new LlmNotConfiguredError();
  const cached = providers.get(apiKey);
  if (cached) return cached;
  const provider = createOpenAI({ apiKey });
  providers.clear();
  providers.set(apiKey, provider);
  return provider;
}
