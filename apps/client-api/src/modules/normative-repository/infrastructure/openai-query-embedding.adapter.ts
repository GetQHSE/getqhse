import { Injectable } from "@nestjs/common";
import { embeddingModel, embeddingProviderOptions } from "@qhse/ai";
import type { EmbeddingProvider } from "@qhse/config";
import { embed } from "ai";

import { NormativeQueryEmbeddingPort } from "../application/normative-retriever.port.js";
@Injectable()
export class OpenAiQueryEmbeddingAdapter extends NormativeQueryEmbeddingPort {
  async embedQuery(provider: EmbeddingProvider, model: string, value: string): Promise<number[]> {
    const result = await embed({
      model: embeddingModel({ provider, model, purpose: "query" }),
      value,
      maxRetries: 3,
      providerOptions: embeddingProviderOptions(provider, "query"),
      telemetry: { isEnabled: false },
    });
    if (result.embedding.length !== 768) {
      throw new Error("Query embedding dimensions do not match the active profile");
    }
    return result.embedding;
  }
}
