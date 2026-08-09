import type { ProfileFieldKey, ProfileToolAnswer } from "@qhse/profile";
import type { ServerResponse } from "node:http";

export type ProfileChatToolResult = {
  acceptedKeys: ProfileFieldKey[];
  rejectedAnswers: Array<{ key: ProfileFieldKey; reason: string }>;
  nextQuestion: { key: ProfileFieldKey; prompt: string } | null;
  completenessPercent: number;
  regulatoryReadiness: number;
};

export type ProfileChatModelInput = {
  language: "fr" | "ar";
  userMessage: string;
  currentQuestion: { key: ProfileFieldKey; prompt: string } | null;
  profileRevision: number;
  completenessPercent: number;
  regulatoryReadiness: number;
  knownFields: Array<{ key: ProfileFieldKey; value: unknown; status: string }>;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  attachments?: Array<{
    fileId: string;
    fileName: string;
    contentType: string;
    url: string;
  }>;
  recordAnswers: (answers: ProfileToolAnswer[]) => Promise<ProfileChatToolResult>;
};

export type ProfileChatModelResult = {
  text: string;
  model: string;
  promptKey: string;
  promptVersion: number;
  inputTokens: number | null;
  outputTokens: number | null;
  toolNames: string[];
};

export type ProfileChatStreamHandle = {
  pipe(response: ServerResponse): Promise<void>;
};

export type ProfileChatStreamInput = ProfileChatModelInput & {
  responseMessageId: string;
  onComplete: (result: ProfileChatModelResult) => Promise<void>;
  onError: (error: unknown) => Promise<void>;
};

export abstract class ProfileChatModelPort {
  abstract runTurn(input: ProfileChatModelInput): Promise<ProfileChatModelResult>;
  abstract streamTurn(input: ProfileChatStreamInput): ProfileChatStreamHandle;
}
