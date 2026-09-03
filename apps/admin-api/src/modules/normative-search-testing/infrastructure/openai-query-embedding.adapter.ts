import { Injectable } from "@nestjs/common";
import { embed } from "ai";

import { NormativeQueryEmbeddingPort } from "../application/normative-search-testing.port.js";
import { openAiProvider } from "@qhse/ai";

@Injectable()
export class OpenAiQueryEmbeddingAdapter extends NormativeQueryEmbeddingPort {
  async embedQuery(model: string, value: string): Promise<number[]> {
    const result = await embed({
      model: openAiProvider().embedding(model),
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
