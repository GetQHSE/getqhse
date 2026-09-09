import type { NormativeSearchRequest, NormativeSearchResponse } from "@qhse/contracts";
import type { EmbeddingProvider } from "@qhse/config";

export abstract class NormativeRetriever {
  abstract search(
    organizationId: string,
    input: NormativeSearchRequest,
  ): Promise<NormativeSearchResponse>;
}

export abstract class NormativeQueryEmbeddingPort {
  abstract embedQuery(provider: EmbeddingProvider, model: string, value: string): Promise<number[]>;
}
