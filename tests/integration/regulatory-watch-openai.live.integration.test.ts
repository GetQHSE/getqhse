import { openai } from "@ai-sdk/openai";
import { regulatoryApplicabilityPrompt } from "@qhse/ai";
import { generateText, Output } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const enabled =
  process.env["OPENAI_LIVE_TESTS"] === "true" && Boolean(process.env["OPENAI_API_KEY"]);

const schema = z.object({
  suggestion: z.enum(["APPLICABLE", "TO_CONFIRM", "NOT_APPLICABLE"]),
  rationale: z.string().min(1),
  matchedProfileKeys: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  clarificationQuestion: z.string().nullable(),
  sourceQuality: z.enum(["PASS", "BLOCKED"]),
  normativeRequirement: z.boolean(),
  requirementText: z.string().min(20).nullable(),
  supportingExcerpts: z.array(z.string()).max(3),
  qualityIssues: z.array(z.string()),
});

function normalizedWords(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function containsCopiedSequence(source: string, draft: string, wordCount = 25): boolean {
  const sourceText = ` ${normalizedWords(source).join(" ")} `;
  const draftWords = normalizedWords(draft);
  return draftWords.some((_, index) => {
    if (index + wordCount > draftWords.length) return false;
    return sourceText.includes(` ${draftWords.slice(index, index + wordCount).join(" ")} `);
  });
}

describe.skipIf(!enabled)("regulatory applicability OpenAI live", () => {
  it.each([
    {
      language: "fr" as const,
      identifier: "Article 24",
      content:
        "Article 24 — L’employeur est tenu de prendre les mesures nécessaires pour préserver la sécurité et la santé des salariés sur le lieu de travail.",
    },
    {
      language: "ar" as const,
      identifier: "المادة 24",
      content:
        "المادة 24 — يجب على المشغل اتخاذ التدابير الضرورية للمحافظة على سلامة الأجراء وصحتهم وكرامتهم داخل مكان العمل.",
    },
  ])(
    "drafts and supports a French requirement from a synthetic $language article",
    async (source) => {
      const prompt = regulatoryApplicabilityPrompt.build({
        profileContext: {
          fields: {
            "organization.primarySector": "Fabrication métallique",
            "organization.employeeCount": 25,
            "scope.operatingCountries": ["MA"],
          },
        },
        previousProfileContext: null,
        profileChanges: [],
        clarificationContext: [],
        previousDecision: null,
        candidate: {
          provisionId: `synthetic-${source.language}`,
          previousEntryId: null,
          changeType: "ADDED",
          documentFamily: "regulation",
          provisionType: "article",
          document: "Loi synthétique marocaine de test",
          identifier: source.identifier,
          title: null,
          content: source.content,
        },
        verifierFeedback: [],
      });
      const result = await generateText({
        model: openai.responses(process.env["OPENAI_REGULATORY_MODEL"] ?? "gpt-5.6-sol"),
        system: prompt.system,
        prompt: prompt.context,
        output: Output.object({ schema }),
        providerOptions: {
          openai: {
            store: false,
            reasoningEffort: process.env["OPENAI_REGULATORY_REASONING_EFFORT"] ?? "xhigh",
          },
        },
      });
      expect(result.output.sourceQuality).toBe("PASS");
      expect(result.output.normativeRequirement).toBe(true);
      expect(result.output.requirementText).not.toBeNull();
      const requirementText = result.output.requirementText ?? "";
      expect(requirementText).not.toBe(source.content);
      expect(containsCopiedSequence(source.content, requirementText)).toBe(false);
      expect(requirementText).not.toMatch(/[\u0600-\u06ff]/u);
      expect(
        requirementText.split(/[.!?]+/u).filter((sentence) => sentence.trim()).length,
      ).toBeLessThanOrEqual(3);
      expect(result.output.supportingExcerpts.length).toBeGreaterThan(0);
      expect(
        result.output.supportingExcerpts.every((excerpt) => source.content.includes(excerpt)),
      ).toBe(true);
      if (process.env["OPENAI_LIVE_TEST_LOG_OUTPUT"] === "true") {
        console.info(
          JSON.stringify({
            language: source.language,
            requirementText,
            supportingExcerpts: result.output.supportingExcerpts,
          }),
        );
      }
    },
    120_000,
  );
});
