import {
  embeddingModel,
  embeddingProviderOptions,
  languageModel,
  providerWebSearch,
  resetLlmSettingsSnapshot,
} from "@qhse/ai";
import { Output, embed, generateText } from "ai";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { OpenAiProfileChatAdapter } from "../../apps/client-api/src/modules/project-profile/infrastructure/openai-profile-chat.adapter.js";

const languageCases = [
  {
    provider: "anthropic",
    key: "ANTHROPIC_API_KEY",
    enabled: "ANTHROPIC_LIVE_TESTS",
    model: process.env["ANTHROPIC_LIVE_MODEL"] ?? "claude-haiku-4-5-20251001",
  },
  {
    provider: "google",
    key: "GOOGLE_GENERATIVE_AI_API_KEY",
    enabled: "GOOGLE_LIVE_TESTS",
    model: process.env["GOOGLE_LIVE_MODEL"] ?? "gemini-3.6-flash",
  },
] as const;

const originalProfileProvider = process.env["LLM_PROFILE_PROVIDER"];
const originalProfileModel = process.env["LLM_PROFILE_MODEL"];

afterEach(() => {
  if (originalProfileProvider === undefined) delete process.env["LLM_PROFILE_PROVIDER"];
  else process.env["LLM_PROFILE_PROVIDER"] = originalProfileProvider;
  if (originalProfileModel === undefined) delete process.env["LLM_PROFILE_MODEL"];
  else process.env["LLM_PROFILE_MODEL"] = originalProfileModel;
  resetLlmSettingsSnapshot();
});

describe.sequential("multi-provider live language calls", () => {
  for (const providerCase of languageCases) {
    const enabled =
      process.env[providerCase.enabled] === "true" && Boolean(process.env[providerCase.key]);

    it.skipIf(!enabled)(
      `${providerCase.provider} supports profile tools and structured output`,
      async () => {
        process.env["LLM_PROFILE_PROVIDER"] = providerCase.provider;
        process.env["LLM_PROFILE_MODEL"] = providerCase.model;
        resetLlmSettingsSnapshot();
        const recorded: unknown[] = [];
        const result = await new OpenAiProfileChatAdapter().runTurn({
          language: "fr",
          userMessage: "Notre entreprise compte exactement 42 salariés.",
          currentQuestion: {
            key: "organization.employeeCount",
            prompt: "Combien de salariés compte votre entreprise ?",
          },
          profileRevision: 1,
          completenessPercent: 5,
          regulatoryReadiness: 5,
          knownFields: [{ key: "project.name", value: "Atlas", status: "ANSWERED" }],
          recordAnswers: async (answers) => {
            recorded.push(...answers);
            return {
              acceptedKeys: answers.map(({ key }) => key),
              rejectedAnswers: [],
              nextQuestion: null,
              completenessPercent: 10,
              regulatoryReadiness: 10,
            };
          },
        });
        expect(result.provider).toBe(providerCase.provider);
        expect(recorded).toContainEqual(
          expect.objectContaining({ key: "organization.employeeCount", valueJson: "42" }),
        );

        const structured = await generateText({
          model: languageModel({
            provider: providerCase.provider,
            model: providerCase.model,
          }),
          prompt: "Return the status ok.",
          output: Output.object({ schema: z.object({ status: z.literal("ok") }) }),
          maxOutputTokens: 64,
          maxRetries: 0,
        });
        expect(structured.output).toEqual({ status: "ok" });
      },
      45_000,
    );

    it.skipIf(!enabled)(
      `${providerCase.provider} regulatory discovery exposes cited web sources`,
      async () => {
        const search = providerWebSearch(providerCase.provider, {
          country: "MA",
          timezone: "Africa/Casablanca",
        });
        const result = await generateText({
          model: languageModel({ provider: providerCase.provider, model: providerCase.model }),
          prompt: "Find the official Moroccan workplace health and safety law and cite the source.",
          tools: { [search.name]: search.tool as never },
          toolChoice: { type: "tool", toolName: search.name },
          maxOutputTokens: 256,
          maxRetries: 0,
        });
        expect(result.sources.some((source) => source.sourceType === "url")).toBe(true);
      },
      45_000,
    );
  }
});

describe.sequential("multi-provider live embeddings", () => {
  for (const providerCase of [
    {
      provider: "openai",
      key: "OPENAI_API_KEY",
      enabled: "OPENAI_LIVE_TESTS",
      model: "text-embedding-3-small",
    },
    {
      provider: "google",
      key: "GOOGLE_GENERATIVE_AI_API_KEY",
      enabled: "GOOGLE_LIVE_TESTS",
      model: "gemini-embedding-001",
    },
  ] as const) {
    const enabled =
      process.env[providerCase.enabled] === "true" && Boolean(process.env[providerCase.key]);
    it.skipIf(!enabled)(`${providerCase.provider} returns exactly 768 dimensions`, async () => {
      const provider = providerCase.provider;
      const result = await embed({
        model: embeddingModel({ provider, model: providerCase.model, purpose: "query" }),
        value: "santé et sécurité au travail",
        providerOptions: embeddingProviderOptions(provider, "query"),
        maxRetries: 0,
      });
      expect(result.embedding).toHaveLength(768);
    });
  }
});
