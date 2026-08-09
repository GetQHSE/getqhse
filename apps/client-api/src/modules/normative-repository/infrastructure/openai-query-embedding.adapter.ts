import { Injectable } from "@nestjs/common";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";

import { NormativeQueryEmbeddingPort } from "../application/normative-retriever.port.js";

@Injectable()
export class OpenAiQueryEmbeddingAdapter extends NormativeQueryEmbeddingPort {
  async embedQuery(model: string, value: string): Promise<number[]> {
    const result = await embed({
      model: openai.embedding(model),
      value,
      maxRetries: 3,
      providerOptions: {
        openai: {
          dimensions: 768,
        },
      },
      telemetry: { isEnabled: false },
    });
    if (result.embedding.length !== 768) {
      throw new Error("Query embedding dimensions do not match the active profile");
    }
    return result.embedding;
  }
}
