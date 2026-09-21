import { Injectable } from "@nestjs/common";
import {
  contextAnswerAssistPrompt,
  languageModel,
  languageProviderOptions,
  llmSettings,
} from "@qhse/ai";
import {
  contextAnswerAssistResponseSchema,
  type ContextAnswerAssistResponse,
} from "@qhse/contracts";
import { Output, generateText } from "ai";

import {
  ContextAnswerAssistModelPort,
  type ContextAnswerAssistModelInput,
} from "../application/context-answer-assist-model.port.js";

@Injectable()
export class AiContextAnswerAssistAdapter extends ContextAnswerAssistModelPort {
  async assess(input: ContextAnswerAssistModelInput): Promise<ContextAnswerAssistResponse> {
    const provider = llmSettings().profileProvider;
    const model = llmSettings().profileModel;
    const prompt = contextAnswerAssistPrompt.build(input);

    const result = await generateText({
      model: languageModel({ provider, model }),
      system: prompt.system,
      prompt: prompt.context,
      output: Output.object({ schema: contextAnswerAssistResponseSchema }),
      timeout: llmSettings().regulatoryTimeoutMs,
      maxOutputTokens: 800,
      maxRetries: 2,
      providerOptions: languageProviderOptions(provider, { model }),
      telemetry: { isEnabled: false },
    });
    return contextAnswerAssistResponseSchema.parse(result.output);
  }
}
