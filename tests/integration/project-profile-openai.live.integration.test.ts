import { createServer } from "node:http";

import { describe, expect, it, vi } from "vitest";

import { OpenAiProfileChatAdapter } from "../../apps/client-api/src/modules/project-profile/infrastructure/openai-profile-chat.adapter.js";

const enabled =
  process.env["OPENAI_LIVE_TESTS"] === "true" && Boolean(process.env["OPENAI_API_KEY"]);
const suite = describe.skipIf(!enabled);

suite("profile chat OpenAI live", () => {
  it("uses the structured profile tool through the AI SDK", async () => {
    const recorded: unknown[] = [];
    const result = await new OpenAiProfileChatAdapter().runTurn({
      language: "fr",
      userMessage: "Notre entreprise compte exactement 42 salariés.",
      currentQuestion: {
        key: "organization.employeeCount",
        prompt: "Combien de salariés compte approximativement votre entreprise ?",
      },
      profileRevision: 1,
      completenessPercent: 6,
      regulatoryReadiness: 8,
      knownFields: [
        { key: "project.name", value: "Atlas", status: "ANSWERED" },
        { key: "scope.operatingCountries", value: ["MA"], status: "ANSWERED" },
      ],
      recordAnswers: async (answers) => {
        recorded.push(...answers);
        return {
          acceptedKeys: answers.map(({ key }) => key),
          rejectedAnswers: [],
          nextQuestion: {
            key: "operations.keyProcesses",
            prompt: "Quels sont vos processus clés ?",
          },
          completenessPercent: 9,
          regulatoryReadiness: 15,
        };
      },
    });

    expect(recorded).toContainEqual(
      expect.objectContaining({
        key: "organization.employeeCount",
        valueJson: "42",
      }),
    );
    expect(result.text).not.toBe("");
    expect(result.toolNames).toContain("recordProfileAnswers");
  }, 30_000);

  it("streams an AI SDK UI-message response and completes persistence callbacks", async () => {
    const adapter = new OpenAiProfileChatAdapter();
    const onComplete = vi.fn();
    const handle = adapter.streamTurn({
      language: "fr",
      userMessage: "Je confirme que notre activité principale est la fabrication de composants.",
      currentQuestion: {
        key: "organization.offerings",
        prompt: "Quels produits ou services propose votre organisation ?",
      },
      profileRevision: 1,
      completenessPercent: 6,
      regulatoryReadiness: 8,
      knownFields: [{ key: "project.name", value: "Atlas", status: "ANSWERED" }],
      history: [
        { role: "user", content: "Nous sommes une entreprise industrielle." },
        { role: "assistant", content: "Merci. Décrivez maintenant votre offre." },
      ],
      responseMessageId: "assistant-live-1",
      recordAnswers: async (answers) => ({
        acceptedKeys: answers.map(({ key }) => key),
        rejectedAnswers: [],
        nextQuestion: null,
        completenessPercent: 10,
        regulatoryReadiness: 12,
      }),
      onComplete,
      onError: async (error) => {
        throw error;
      },
    });
    const server = createServer(async (_request, response) => handle.pipe(response));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not start");
      const response = await fetch(`http://127.0.0.1:${address.port}`);
      const body = await response.text();
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      expect(body).toContain('"type":"text-delta"');
      expect(body).toContain("[DONE]");
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({ model: process.env["OPENAI_PROFILE_MODEL"] ?? "gpt-5-mini" }),
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }, 30_000);
});
