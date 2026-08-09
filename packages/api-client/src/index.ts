import {
  apiErrorSchema,
  createFileUploadSchema,
  createSiteSchema,
  completeProjectProfileSchema,
  normativeSearchRequestSchema,
  normativeSearchResponseSchema,
  paginatedSitesSchema,
  projectProfileChatRequestSchema,
  projectProfileChatResponseSchema,
  projectProfileConversationSchema,
  projectProfileSchema,
  projectProfileSnapshotSchema,
  fileObjectSchema,
  fileTranscriptionSchema,
  fileUploadResponseSchema,
  siteSchema,
  updateProjectProfileSchema,
  type CreateSite,
  type CreateFileUpload,
  type FileTranscription,
  type FileUploadResponse,
  type NormativeSearchRequest,
  type NormativeSearchResponse,
  type ProjectProfile,
  type ProjectProfileChatRequest,
  type ProjectProfileChatResponse,
  type ProjectProfileConversation,
  type ProjectProfileSnapshot,
  type Site,
  type UpdateProjectProfile,
} from "@qhse/contracts";
import axios, { isAxiosError, type AxiosInstance, type AxiosRequestConfig } from "axios";
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
  axios?: AxiosInstance;
};

function errorMessage(body: unknown): string {
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) return parsed.data.message;
  if (typeof body === "object" && body !== null && "message" in body) {
    const message = body.message;
    if (typeof message === "string") return message;
  }
  return "The API request failed";
}

export function createAxiosClient({ baseUrl }: Pick<ApiClientOptions, "baseUrl">): AxiosInstance {
  const client = axios.create({
    baseURL: baseUrl.replace(/\/+$/, ""),
    withCredentials: true,
    headers: { "Content-Type": "application/json" },
  });

  client.interceptors.response.use(undefined, (reason: unknown) => {
    if (!isAxiosError(reason)) {
      return Promise.reject(reason instanceof Error ? reason : new Error("The API request failed"));
    }
    const body: unknown = reason.response?.data;
    return Promise.reject(
      new ApiClientError(
        reason.response ? errorMessage(body) : reason.message || "Unable to reach the API",
        reason.response?.status ?? 0,
        body,
      ),
    );
  });

  return client;
}

export type ApiRequestInit = Omit<AxiosRequestConfig, "url" | "baseURL" | "data"> & {
  body?: BodyInit | null;
};

export async function apiRequest<T>(
  client: AxiosInstance,
  path: string,
  init: ApiRequestInit = {},
): Promise<T> {
  const { body, ...config } = init;
  const response = await client.request<T>({
    ...config,
    url: path,
    data: body,
  });
  return response.data;
}

export class QhseApiClient {
  readonly #axios: AxiosInstance;

  constructor(private readonly options: ApiClientOptions) {
    this.#axios = options.axios ?? createAxiosClient(options);
  }

  async #request<T>(path: string, schema: z.ZodType<T>, init: ApiRequestInit = {}): Promise<T> {
    return schema.parse(await apiRequest<unknown>(this.#axios, path, init));
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

  searchNormative(input: NormativeSearchRequest): Promise<NormativeSearchResponse> {
    return this.#request("/v1/normative/search", normativeSearchResponseSchema, {
      method: "POST",
      body: JSON.stringify(normativeSearchRequestSchema.parse(input)),
    });
  }

  getProjectProfile(projectIdOrSlug: string): Promise<ProjectProfile> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/profile`,
      projectProfileSchema,
    );
  }

  updateProjectProfile(
    projectIdOrSlug: string,
    input: UpdateProjectProfile,
  ): Promise<ProjectProfile> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/profile`,
      projectProfileSchema,
      {
        method: "PATCH",
        body: JSON.stringify(updateProjectProfileSchema.parse(input)),
      },
    );
  }

  getProjectProfileConversation(
    projectIdOrSlug: string,
    conversationId?: string,
  ): Promise<ProjectProfileConversation | null> {
    const query = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : "";
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/profile/conversation${query}`,
      projectProfileConversationSchema.nullable(),
    );
  }

  chatProjectProfile(
    projectIdOrSlug: string,
    input: ProjectProfileChatRequest,
  ): Promise<ProjectProfileChatResponse> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/profile/chat`,
      projectProfileChatResponseSchema,
      {
        method: "POST",
        body: JSON.stringify(projectProfileChatRequestSchema.parse(input)),
      },
    );
  }

  completeProjectProfile(
    projectIdOrSlug: string,
    revision: number,
  ): Promise<ProjectProfileSnapshot> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/profile/complete`,
      projectProfileSnapshotSchema,
      {
        method: "POST",
        body: JSON.stringify(completeProjectProfileSchema.parse({ revision })),
      },
    );
  }

  createFileUpload(input: CreateFileUpload): Promise<FileUploadResponse> {
    return this.#request("/v1/files/uploads", fileUploadResponseSchema, {
      method: "POST",
      body: JSON.stringify(createFileUploadSchema.parse(input)),
    });
  }

  completeFileUpload(fileId: string) {
    return this.#request(`/v1/files/${encodeURIComponent(fileId)}/complete`, fileObjectSchema, {
      method: "POST",
    });
  }

  transcribeVoiceNote(fileId: string): Promise<FileTranscription> {
    return this.#request(
      `/v1/files/${encodeURIComponent(fileId)}/transcription`,
      fileTranscriptionSchema,
      { method: "POST" },
    );
  }
}
