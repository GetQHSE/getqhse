import { renderManagedPrompt } from "@qhse/ai";
import { languageModel, llmSettings } from "@qhse/ai";
import type { ExtractedBlock, NormativeLanguage } from "@qhse/knowledge";
import { Output, generateText } from "ai";
import { z } from "zod";

import { lawStructureSchema, materializeLawStructure } from "./law-catalog.js";
import {
  regulatoryPrimaryModel,
  regulatoryPrimaryProvider,
  regulatoryProviderOptions,
} from "./regulatory-model-cost.js";

const MAX_STRUCTURE_CHARS = 180_000;

export async function detectLawMetadata(text: string) {
  const provider = regulatoryPrimaryProvider();
  const schema = z.object({
    suggestions: z
      .array(
        z.object({
          fieldName: z.enum(["title", "referenceNumber", "issuingAuthority"]),
          value: z.string().trim().min(1).max(300),
          sourceText: z.string().trim().min(1).max(1000),
        }),
      )
      .max(3),
  });
  // Identity is normally on the opening pages; absence yields no suggestion, never a guess.
  const source = text.slice(0, 20_000);
  const result = await generateText({
    model: languageModel({ provider, model: regulatoryPrimaryModel() }),
    system: renderManagedPrompt("documents.metadata").system,
    prompt: source,
    output: Output.object({ schema }),
    timeout: llmSettings().regulatoryTimeoutMs,
    maxOutputTokens: 2_000,
    maxRetries: 1,
    providerOptions: regulatoryProviderOptions({
      provider,
      model: regulatoryPrimaryModel(),
      reasoningEffort: "low",
      promptCacheKey: "law-metadata",
    }),
    telemetry: { isEnabled: false },
  });
  const { suggestions } = schema.parse(result.output);
  const fieldCounts = new Map<string, number>();
  for (const item of suggestions)
    fieldCounts.set(item.fieldName, (fieldCounts.get(item.fieldName) ?? 0) + 1);

  // Metadata suggestions are optional. A malformed suggestion must never be stored, but it also
  // must not prevent the document from reaching human review. Duplicate fields are ambiguous, so
  // omit every suggestion for that field rather than arbitrarily choosing one.
  return suggestions.filter(
    (item) =>
      fieldCounts.get(item.fieldName) === 1 &&
      source.includes(item.sourceText) &&
      item.sourceText.includes(item.value),
  );
}

export async function structureLaw(blocks: ExtractedBlock[], language: NormativeLanguage) {
  const provider = regulatoryPrimaryProvider();
  if (!blocks.length) throw new Error("No source blocks available for legal structure extraction");
  // Explicit failure is preferable to silently dropping pages from an oversized source.
  const input = JSON.stringify(
    blocks.map((block, index) => ({
      index,
      page: block.pageNumber,
      type: block.blockType,
      text: block.text,
    })),
  );
  if (input.length > MAX_STRUCTURE_CHARS)
    throw new Error(
      "Document too large for MVP law extraction; upload individual laws or sections",
    );
  const result = await generateText({
    model: languageModel({ provider, model: regulatoryPrimaryModel() }),
    system: renderManagedPrompt("documents.structure").system,
    prompt: input,
    output: Output.object({ schema: lawStructureSchema }),
    timeout: llmSettings().regulatoryTimeoutMs,
    maxOutputTokens: 16_000,
    maxRetries: 1,
    providerOptions: regulatoryProviderOptions({
      provider,
      model: regulatoryPrimaryModel(),
      reasoningEffort: "low",
      promptCacheKey: "law-ingestion",
    }),
    telemetry: { isEnabled: false },
  });
  return materializeLawStructure(blocks, lawStructureSchema.parse(result.output), language);
}

export async function classifyLaw(
  text: string,
  terms: Array<{ id: string; label: string; key: string }>,
) {
  const provider = regulatoryPrimaryProvider();
  if (!terms.length) return [];
  if (text.length > MAX_STRUCTURE_CHARS)
    throw new Error(
      "Document too large for MVP law classification; upload individual laws or sections",
    );
  const schema = z.object({ termIds: z.array(z.string()).max(20) });
  const result = await generateText({
    model: languageModel({ provider, model: regulatoryPrimaryModel() }),
    system: renderManagedPrompt("documents.classification").system,
    prompt: JSON.stringify({ terms, text }),
    output: Output.object({ schema }),
    timeout: llmSettings().regulatoryTimeoutMs,
    maxOutputTokens: 2_000,
    maxRetries: 1,
    providerOptions: regulatoryProviderOptions({
      provider,
      model: regulatoryPrimaryModel(),
      reasoningEffort: "low",
      promptCacheKey: "law-ingestion",
    }),
    telemetry: { isEnabled: false },
  });
  const ids = schema.parse(result.output).termIds;
  if (ids.some((id) => !terms.some((term) => term.id === id)))
    throw new Error("Law classification returned an unknown taxonomy term");
  return terms.filter((term) => ids.includes(term.id));
}
