import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { openai } from "@ai-sdk/openai";
import { profileChatPrompt } from "@qhse/ai";
import { profileToolInputSchema } from "@qhse/profile";
import {
  generateText,
  pipeUIMessageStreamToResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  tool,
  type ModelMessage,
  type UserModelMessage,
} from "ai";

import {
  ProfileChatModelPort,
  type ProfileChatModelInput,
  type ProfileChatModelResult,
  type ProfileChatStreamInput,
} from "../application/profile-chat-model.port.js";

@Injectable()
export class OpenAiProfileChatAdapter extends ProfileChatModelPort {
  private prepare(input: ProfileChatModelInput) {
    if (!process.env["OPENAI_API_KEY"]) {
      throw new ServiceUnavailableException("Profile chat is not configured");
    }
    const model = process.env["OPENAI_PROFILE_MODEL"] ?? "gpt-5-mini";
    const prompt = profileChatPrompt.build({
      language: input.language,
      currentQuestion: input.currentQuestion,
      profileRevision: input.profileRevision,
      completenessPercent: input.completenessPercent,
      regulatoryReadiness: input.regulatoryReadiness,
      knownFields: input.knownFields,
    });
    const currentContent: UserModelMessage["content"] = [
      { type: "text", text: input.userMessage },
      ...(input.attachments ?? []).map((attachment) => ({
        type: "file" as const,
        data: new URL(attachment.url),
        filename: attachment.fileName,
        mediaType: attachment.contentType,
      })),
    ];
    const messages: ModelMessage[] = [
      { role: "user", content: `Structured profile context:\n${prompt.context}` },
      ...(input.history ?? []).map((message) => ({ role: message.role, content: message.content })),
      { role: "user", content: currentContent },
    ];
    const tools = {
      recordProfileAnswers: tool({
        description:
          "Record only explicit organization profile facts supplied by the user. Values must match the current profile field schema.",
        inputSchema: profileToolInputSchema,
        execute: async ({ answers }) => input.recordAnswers(answers),
      }),
    };
    return { model, prompt, messages, tools };
  }

  async runTurn(input: ProfileChatModelInput): Promise<ProfileChatModelResult> {
    const { model, prompt, messages, tools } = this.prepare(input);

    const result = await generateText({
      model: openai.responses(model),
      system: prompt.system,
      messages,
      tools,
      stopWhen: stepCountIs(3),
      maxRetries: 2,
      providerOptions: { openai: { store: false } },
    });

    return {
      text: result.text.trim(),
      model,
      promptKey: profileChatPrompt.key,
      promptVersion: profileChatPrompt.version,
      inputTokens: result.totalUsage.inputTokens ?? null,
      outputTokens: result.totalUsage.outputTokens ?? null,
      toolNames: [...new Set(result.toolCalls.map((call) => call.toolName))],
    };
  }

  streamTurn(input: ProfileChatStreamInput) {
    const { model, prompt, messages, tools } = this.prepare(input);
    const result = streamText({
      model: openai.responses(model),
      system: prompt.system,
      messages,
      tools,
      stopWhen: stepCountIs(3),
      maxRetries: 2,
      providerOptions: { openai: { store: false } },
      onEnd: async (event) => {
        await input.onComplete({
          text: event.text.trim(),
          model,
          promptKey: profileChatPrompt.key,
          promptVersion: profileChatPrompt.version,
          inputTokens: event.usage.inputTokens ?? null,
          outputTokens: event.usage.outputTokens ?? null,
          toolNames: [...new Set(event.toolCalls.map((call) => call.toolName))],
        });
      },
      onError: async (event) => input.onError(event.error),
    });
    const stream = toUIMessageStream({
      stream: result.stream,
      tools,
      generateMessageId: () => input.responseMessageId,
      sendReasoning: false,
      sendSources: false,
      onError: () => "La réponse n’a pas pu être générée.",
    });
    return {
      pipe: (response: import("node:http").ServerResponse) =>
        pipeUIMessageStreamToResponse({ response, stream }),
    };
  }
}
