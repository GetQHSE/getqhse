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
  importProjectProfileSchema,
  portableProjectProfileSchema,
  siteSchema,
  updateProjectProfileSchema,
  answerRegulatoryClarificationsSchema,
  createRegulatoryActionSchema,
  createRegulatoryEvidenceSchema,
  decideRegulatoryCandidateSchema,
  decideRegulatoryCandidatesSchema,
  publishRegulatoryBaselineSchema,
  regulatoryAnalysisJobSchema,
  regulatoryEvaluationJobSchema,
  reviewRegulatoryAnalysisSchema,
  regulatoryWatchSchema,
  startRegulatoryAnalysisSchema,
  updateRegulatoryActionSchema,
  updateRegulatoryEvaluationSchema,
  updateRegulatoryEvidenceSchema,
  type CreateSite,
  type CreateFileUpload,
  type FileTranscription,
  type FileUploadResponse,
  type ImportProjectProfile,
  type NormativeSearchRequest,
  type NormativeSearchResponse,
  type ProjectProfile,
  type ProjectProfileChatRequest,
  type ProjectProfileChatResponse,
  type ProjectProfileConversation,
  type ProjectProfileSnapshot,
  type PortableProjectProfile,
  type Site,
  type UpdateProjectProfile,
  type AnswerRegulatoryClarifications,
  type CreateRegulatoryAction,
  type CreateRegulatoryEvidence,
  type DecideRegulatoryCandidate,
  type DecideRegulatoryCandidates,
  type PublishRegulatoryBaseline,
  type RegulatoryAnalysisJob,
  type RegulatoryEvaluationJob,
  type ReviewRegulatoryAnalysis,
  type RegulatoryWatch,
  type StartRegulatoryAnalysis,
  type UpdateRegulatoryAction,
  type UpdateRegulatoryEvaluation,
  type UpdateRegulatoryEvidence,
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

  exportProjectProfile(projectIdOrSlug: string): Promise<PortableProjectProfile> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/profile/export.json`,
      portableProjectProfileSchema,
    );
  }

  importProjectProfile(
    projectIdOrSlug: string,
    input: ImportProjectProfile,
  ): Promise<ProjectProfile> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/profile/import`,
      projectProfileSchema,
      {
        method: "POST",
        body: JSON.stringify(importProjectProfileSchema.parse(input)),
      },
    );
  }

  getProjectProfileConversation(
    projectIdOrSlug: string,
    conversationId?: string,
  ): Promise<ProjectProfileConversation | null> {
    const query = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : "";
    return apiRequest<unknown>(
      this.#axios,
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/profile/conversation${query}`,
    ).then((value) => {
      if (value === undefined || value === null || value === "") return null;
      return projectProfileConversationSchema.parse(value);
    });
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

  getRegulatoryWatch(projectIdOrSlug: string): Promise<RegulatoryWatch> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/regulatory-watch`,
      regulatoryWatchSchema,
    );
  }

  startRegulatoryAnalysis(
    projectIdOrSlug: string,
    input: StartRegulatoryAnalysis,
  ): Promise<RegulatoryAnalysisJob> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/regulatory-watch/analysis-runs`,
      regulatoryAnalysisJobSchema,
      { method: "POST", body: JSON.stringify(startRegulatoryAnalysisSchema.parse(input)) },
    );
  }

  answerRegulatoryClarifications(
    projectIdOrSlug: string,
    runId: string,
    input: AnswerRegulatoryClarifications,
  ): Promise<RegulatoryAnalysisJob> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/regulatory-watch/analysis-runs/${encodeURIComponent(runId)}/clarifications`,
      regulatoryAnalysisJobSchema,
      {
        method: "POST",
        body: JSON.stringify(answerRegulatoryClarificationsSchema.parse(input)),
      },
    );
  }

  reviewRegulatoryAnalysis(
    projectIdOrSlug: string,
    runId: string,
    input: ReviewRegulatoryAnalysis,
  ): Promise<RegulatoryWatch> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/regulatory-watch/analysis-runs/${encodeURIComponent(runId)}/review`,
      regulatoryWatchSchema,
      {
        method: "PUT",
        body: JSON.stringify(reviewRegulatoryAnalysisSchema.parse(input)),
      },
    );
  }

  decideRegulatoryCandidate(
    projectIdOrSlug: string,
    candidateId: string,
    input: DecideRegulatoryCandidate,
  ): Promise<RegulatoryWatch> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/regulatory-watch/candidates/${encodeURIComponent(candidateId)}`,
      regulatoryWatchSchema,
      { method: "PATCH", body: JSON.stringify(decideRegulatoryCandidateSchema.parse(input)) },
    );
  }

  decideRegulatoryCandidates(
    projectIdOrSlug: string,
    input: DecideRegulatoryCandidates,
  ): Promise<RegulatoryWatch> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/regulatory-watch/candidates`,
      regulatoryWatchSchema,
      { method: "PATCH", body: JSON.stringify(decideRegulatoryCandidatesSchema.parse(input)) },
    );
  }

  publishRegulatoryBaseline(
    projectIdOrSlug: string,
    input: PublishRegulatoryBaseline,
  ): Promise<RegulatoryWatch> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/regulatory-watch/baselines`,
      regulatoryWatchSchema,
      { method: "POST", body: JSON.stringify(publishRegulatoryBaselineSchema.parse(input)) },
    );
  }

  startRegulatoryEvaluation(projectIdOrSlug: string): Promise<RegulatoryEvaluationJob> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/regulatory-watch/evaluation-runs`,
      regulatoryEvaluationJobSchema,
      { method: "POST" },
    );
  }

  updateRegulatoryEvaluation(
    projectIdOrSlug: string,
    evaluationId: string,
    input: UpdateRegulatoryEvaluation,
  ): Promise<RegulatoryWatch> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/regulatory-watch/evaluations/${encodeURIComponent(evaluationId)}`,
      regulatoryWatchSchema,
      { method: "PATCH", body: JSON.stringify(updateRegulatoryEvaluationSchema.parse(input)) },
    );
  }

  addRegulatoryEvidence(
    projectIdOrSlug: string,
    evaluationId: string,
    input: CreateRegulatoryEvidence,
  ): Promise<RegulatoryWatch> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/regulatory-watch/evaluations/${encodeURIComponent(evaluationId)}/evidence`,
      regulatoryWatchSchema,
      { method: "POST", body: JSON.stringify(createRegulatoryEvidenceSchema.parse(input)) },
    );
  }

  updateRegulatoryEvidence(
    projectIdOrSlug: string,
    evidenceId: string,
    input: UpdateRegulatoryEvidence,
  ): Promise<RegulatoryWatch> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/regulatory-watch/evidence/${encodeURIComponent(evidenceId)}`,
      regulatoryWatchSchema,
      { method: "PATCH", body: JSON.stringify(updateRegulatoryEvidenceSchema.parse(input)) },
    );
  }

  deleteRegulatoryEvidence(projectIdOrSlug: string, evidenceId: string): Promise<RegulatoryWatch> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/regulatory-watch/evidence/${encodeURIComponent(evidenceId)}`,
      regulatoryWatchSchema,
      { method: "DELETE" },
    );
  }

  addRegulatoryAction(
    projectIdOrSlug: string,
    evaluationId: string,
    input: CreateRegulatoryAction,
  ): Promise<RegulatoryWatch> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/regulatory-watch/evaluations/${encodeURIComponent(evaluationId)}/actions`,
      regulatoryWatchSchema,
      { method: "POST", body: JSON.stringify(createRegulatoryActionSchema.parse(input)) },
    );
  }

  updateRegulatoryAction(
    projectIdOrSlug: string,
    actionId: string,
    input: UpdateRegulatoryAction,
  ): Promise<RegulatoryWatch> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/regulatory-watch/actions/${encodeURIComponent(actionId)}`,
      regulatoryWatchSchema,
      { method: "PATCH", body: JSON.stringify(updateRegulatoryActionSchema.parse(input)) },
    );
  }

  async exportRegulatoryWatch(projectIdOrSlug: string): Promise<ArrayBuffer> {
    const response = await this.#axios.get<ArrayBuffer>(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/regulatory-watch/export.xlsx`,
      { responseType: "arraybuffer" },
    );
    return response.data;
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
