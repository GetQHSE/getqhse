import type { NormativeSearchRequest, NormativeSearchResponse } from "@qhse/contracts";

export abstract class NormativeRetriever {
  abstract search(
    organizationId: string,
    input: NormativeSearchRequest,
  ): Promise<NormativeSearchResponse>;
}

export abstract class NormativeQueryEmbeddingPort {
  abstract embedQuery(model: string, value: string): Promise<number[]>;
}
