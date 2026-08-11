import { openai } from "@ai-sdk/openai";
import { regulatoryApplicabilityPrompt } from "@qhse/ai";
import { generateText, Output } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const enabled =
  process.env["OPENAI_LIVE_TESTS"] === "true" && Boolean(process.env["OPENAI_API_KEY"]);

describe.skipIf(!enabled)("regulatory applicability OpenAI live", () => {
  it("returns source-bound structured applicability through the AI SDK", async () => {
    const prompt = regulatoryApplicabilityPrompt.build({
      profileContext: {
        sector: "Fabrication métallique",
        activities: ["Découpe", "Soudage", "Peinture"],
        country: "MA",
      },
      previousProfileContext: null,
      profileChanges: [],
      clarificationContext: [],
      previousDecisions: [],
      candidates: [
        {
          provisionId: "synthetic-provision-1",
          previousEntryId: null,
          changeType: "ADDED",
          document: "SYN 9001 — Norme synthétique de test",
          identifier: "4.1",
          title: "Contexte",
          content: "L’organisme détermine les enjeux pertinents pour son activité.",
        },
      ],
    });
    const result = await generateText({
      model: openai.responses(process.env["OPENAI_REGULATORY_MODEL"] ?? "gpt-5-mini"),
      system: prompt.system,
      prompt: prompt.context,
      output: Output.object({
        schema: z.object({
          results: z.array(
            z.object({
              provisionId: z.literal("synthetic-provision-1"),
              suggestion: z.enum(["APPLICABLE", "TO_CONFIRM", "NOT_APPLICABLE"]),
              rationale: z.string().min(1),
              matchedProfileKeys: z.array(z.string()),
              confidence: z.number().min(0).max(1),
              clarificationQuestion: z.string().nullable(),
            }),
          ),
        }),
      }),
      providerOptions: { openai: { store: false } },
    });
    expect(result.output.results).toHaveLength(1);
    expect(result.output.results[0]?.provisionId).toBe("synthetic-provision-1");
  }, 60_000);
});
