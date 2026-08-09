import { openai } from "@ai-sdk/openai";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { transcribe } from "ai";

import {
  AudioTranscriptionPort,
  type AudioTranscriptionResult,
} from "../application/audio-transcription.port.js";

@Injectable()
export class OpenAiAudioTranscriptionAdapter extends AudioTranscriptionPort {
  async transcribe(audio: Uint8Array): Promise<AudioTranscriptionResult> {
    if (!process.env["OPENAI_API_KEY"]) {
      throw new ServiceUnavailableException("Audio transcription is not configured");
    }
    const model = process.env["OPENAI_TRANSCRIPTION_MODEL"] ?? "gpt-4o-mini-transcribe";
    const result = await transcribe({
      model: openai.transcription(model),
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
