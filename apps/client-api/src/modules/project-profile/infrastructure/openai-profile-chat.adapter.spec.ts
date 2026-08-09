import { afterEach, describe, expect, it } from "vitest";

import { OpenAiProfileChatAdapter } from "./openai-profile-chat.adapter.js";

describe("OpenAiProfileChatAdapter", () => {
  const originalKey = process.env["OPENAI_API_KEY"];

  afterEach(() => {
    if (originalKey) process.env["OPENAI_API_KEY"] = originalKey;
    else delete process.env["OPENAI_API_KEY"];
  });

  it("fails safely without sending a request when OpenAI is not configured", async () => {
    delete process.env["OPENAI_API_KEY"];
    await expect(
      new OpenAiProfileChatAdapter().runTurn({
        language: "fr",
        userMessage: "Bonjour",
        currentQuestion: null,
        profileRevision: 1,
        completenessPercent: 0,
        regulatoryReadiness: 0,
        knownFields: [],
        recordAnswers: async () => ({
          acceptedKeys: [],
          rejectedAnswers: [],
          nextQuestion: null,
          completenessPercent: 0,
          regulatoryReadiness: 0,
        }),
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
});
