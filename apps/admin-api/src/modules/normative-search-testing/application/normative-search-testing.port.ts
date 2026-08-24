import type { AdminNormativeSearchResponse, NormativeSearchRequest } from "@qhse/contracts";

export abstract class NormativeSearchTester {
  abstract search(input: NormativeSearchRequest): Promise<AdminNormativeSearchResponse>;
}

export abstract class NormativeQueryEmbeddingPort {
  abstract embedQuery(model: string, value: string): Promise<number[]>;
}
