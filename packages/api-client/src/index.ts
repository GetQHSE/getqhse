import {
  apiErrorSchema,
  createSiteSchema,
  paginatedSitesSchema,
  siteSchema,
  type CreateSite,
  type Site,
} from "@qhse/contracts";
import type { z } from "zod";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

export type ApiClientOptions = {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
};

export class QhseApiClient {
  readonly #fetch: typeof globalThis.fetch;

  constructor(private readonly options: ApiClientOptions) {
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async #request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
    const response = await this.#fetch(`${this.options.baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: { "content-type": "application/json", ...init.headers },
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(body);
      throw new ApiClientError(
        parsed.success ? parsed.data.message : "The API request failed",
        response.status,
        body,
      );
    }
    return schema.parse(body);
  }

  listSites(): Promise<{ data: Site[]; meta: { nextCursor: string | null; hasMore: boolean } }> {
    return this.#request("/v1/sites", paginatedSitesSchema);
  }

  createSite(input: CreateSite): Promise<Site> {
    return this.#request("/v1/sites", siteSchema, {
      method: "POST",
      body: JSON.stringify(createSiteSchema.parse(input)),
    });
  }
}
