import type { AdminNormativeSearchResponse, NormativeSearchRequest } from "@qhse/contracts";
import type { EmbeddingProvider } from "@qhse/config";

export abstract class NormativeSearchTester {
  abstract search(input: NormativeSearchRequest): Promise<AdminNormativeSearchResponse>;
}

export abstract class NormativeQueryEmbeddingPort {
  abstract embedQuery(provider: EmbeddingProvider, model: string, value: string): Promise<number[]>;
}
