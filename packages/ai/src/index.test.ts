import { describe, expect, it } from "vitest";

import { profileChatPrompt } from "./index.js";

describe("modular prompt registry", () => {
  it("builds a versioned profile-only prompt with typed dynamic context", () => {
    const prompt = profileChatPrompt.build({
      language: "fr",
      currentQuestion: { key: "organization.mission", prompt: "Quelle est votre mission ?" },
      profileRevision: 3,
      completenessPercent: 20,
      regulatoryReadiness: 30,
      knownFields: [],
    });
    expect(profileChatPrompt.key).toBe("profile.chat");
    expect(profileChatPrompt.version).toBe(3);
    expect(prompt.system).toContain("recordProfileAnswers");
    expect(prompt.system).toContain("exactly once");
    expect(prompt.system).not.toContain("determine regulatory applicability");
    expect(JSON.parse(prompt.context)).toMatchObject({
      profileRevision: 3,
      currentFieldValueSchema: { type: "string" },
    });
  });
});
