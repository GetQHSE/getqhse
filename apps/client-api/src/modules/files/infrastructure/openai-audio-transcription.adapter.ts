import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { isLlmConfigured, llmSettings, openAiProvider } from "@qhse/ai";
import { transcribe } from "ai";

import {
  AudioTranscriptionPort,
  type AudioTranscriptionResult,
} from "../application/audio-transcription.port.js";

@Injectable()
export class OpenAiAudioTranscriptionAdapter extends AudioTranscriptionPort {
  async transcribe(audio: Uint8Array): Promise<AudioTranscriptionResult> {
    if (!isLlmConfigured()) {
      throw new ServiceUnavailableException("Audio transcription is not configured");
    }
    const model = llmSettings().transcriptionModel;
    const result = await transcribe({
      model: openAiProvider().transcription(model),
      audio,
      maxRetries: 2,
    });
    return {
      text: result.text.trim(),
      language: result.language ?? null,
      durationMs:
        result.durationInSeconds === undefined
          ? null
          : Math.round(result.durationInSeconds * 1_000),
      model,
    };
  }
}
