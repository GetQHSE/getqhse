import { describe, expect, it } from "vitest";

import {
  contextAnswerAssistPrompt,
  contextExternalStructurePrompt,
  contextSynthesisPrompt,
  outputLanguageRule,
  profileChatPrompt,
  regulatoryApplicabilityPrompt,
  regulatoryConformityPrompt,
  toOutputLanguage,
} from "./index.js";

describe("output language", () => {
  it("normalizes unknown values to French", () => {
    expect(toOutputLanguage("en")).toBe("en");
    expect(toOutputLanguage("ar")).toBe("ar");
    expect(toOutputLanguage("de")).toBe("fr");
    expect(toOutputLanguage(undefined)).toBe("fr");
  });

  it("keeps enum values untranslated for non-French output", () => {
    expect(outputLanguageRule("en")).toContain("en anglais");
    expect(outputLanguageRule("en")).toContain("sans traduction");
    expect(outputLanguageRule("fr")).not.toContain("sans traduction");
  });

  it.each(["en", "ar"] as const)("removes every French-only rule from %s prompts", (language) => {
    const systems = [
      contextSynthesisPrompt.build({ digest: "", externalMaterial: "", method: "SWOT", language })
        .system,
      contextExternalStructurePrompt.build({ digest: "", researchText: "", sources: [], language })
        .system,
      contextAnswerAssistPrompt.build({
        sectionTitle: "",
        questionLabel: "",
        savedAnswer: null,
        history: [],
        message: "",
        language,
      }).system,
      regulatoryConformityPrompt.build({
        profileContext: {},
        requirement: {
          text: "",
          applicabilityRationale: "",
          document: "",
          provisionIdentifier: null,
          sourceText: "",
          supportingExcerpts: [],
        },
        evidence: [],
        knowledgeExamples: [],
        currentDate: "2026-09-22",
        language,
      }).system,
    ];
    for (const system of systems) {
      expect(system).not.toContain("en français");
      expect(system).toContain(outputLanguageRule(language));
    }
  });

  it("asks the clarification question in the project language", () => {
    const { system, context } = regulatoryApplicabilityPrompt.build({
      profileContext: {},
      previousProfileContext: {},
      profileChanges: [],
      clarificationContext: [],
      previousDecision: null,
      candidate: {
        provisionId: "p",
        previousEntryId: null,
        changeType: "ADDED",
        documentFamily: "regulation",
        provisionType: "article",
        document: "Loi",
        identifier: "1",
        title: null,
        content: "",
      },
      verifierFeedback: [],
      language: "ar",
    });
    expect(system).toContain("courte question en arabe standard moderne");
    expect(JSON.parse(context)).not.toHaveProperty("language");
  });

  it("drives the profile chat reply language", () => {
    const { system } = profileChatPrompt.build({
      language: "en",
      currentQuestion: null,
      profileRevision: 1,
      completenessPercent: 0,
      regulatoryReadiness: 0,
      knownFields: [],
    });
    expect(system).toContain("Reply in professional English");
  });
});
