import {
  processSheetRegisterSchema,
  processSheetVersionSchema,
  processSheetWriteSchema,
  type ProcessSheetWrite,
} from "@qhse/contracts";
import {
  planningRegisterSchema,
  planningWriteSchema,
  planningLaunchSchema,
  type PlanningModule,
  type PlanningWrite,
  type PlanningLaunch,
} from "@qhse/contracts";
import {
  scopeRegisterSchema,
  scopeWriteSchema,
  scopeLaunchSchema,
  scopeStatementSchema,
  type ScopeWrite,
  type ScopeLaunch,
} from "@qhse/contracts";
import {
  roRegisterSchema,
  roLaunchSchema,
  roWriteSchema,
  type RoLaunch,
  type RoWrite,
} from "@qhse/contracts";
import {
  pipRegisterSchema,
  pipJobSchema,
  pipLaunchSchema,
  pipReviewSchema,
  pipAllocationSchema,
  pipAddPartySchema,
  pipAddRequirementSchema,
  pipAnswerSchema,
  type PipLaunch,
  type PipReview,
  type PipAllocation,
  type PipAddParty,
  type PipAddRequirement,
  type PipAnswer,
} from "@qhse/contracts";
import {
  addContextIssueEvidenceSchema,
  apiErrorSchema,
  applyContextIssueOverrideSchema,
  contextAnswerAssistRequestSchema,
  contextAnswerAssistResponseSchema,
  contextAnalysisRunSummarySchema,
  contextExternalRunSummarySchema,
  contextInternalInputSchema,
  contextIssueSchema,
  contextJobSchema,
  createManualContextIssueSchema,
  projectContextSettingsSchema,
  setContextAnalysisMethodsSchema,
  upsertContextInternalInputSchema,
  saveContextInternalInputsSchema,
  contextScopeSchema,
  contextExternalFactorSchema,
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
  type AddContextIssueEvidence,
  type ApplyContextIssueOverride,
  type ContextAnswerAssistRequest,
  type ContextAnswerAssistResponse,
  type ContextAnalysisRunSummary,
  type ContextExternalRunSummary,
  type ContextInternalInput,
  type ContextIssue,
  type ContextJob,
  type CreateManualContextIssue,
  type ProjectContextSettings,
  type SetContextAnalysisMethods,
  type StartRegulatoryAnalysis,
  type UpsertContextInternalInput,
  type SaveContextInternalInputs,
  type ContextScope,
  type ContextExternalFactor,
  type UpdateRegulatoryAction,
  type UpdateRegulatoryEvaluation,
  type UpdateRegulatoryEvidence,
} from "@qhse/contracts";
import axios, { isAxiosError, type AxiosInstance, type AxiosRequestConfig } from "axios";
import { z } from "zod";

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

  publishRegulatoryBaselineAutomatically(
    projectIdOrSlug: string,
    input: PublishRegulatoryBaseline,
  ): Promise<RegulatoryWatch> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/regulatory-watch/baselines/automatic`,
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

  /* --------------------------- SMQ Contexte (§4.1) --------------------------- */

  getContextSettings(projectIdOrSlug: string): Promise<ProjectContextSettings> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/settings`,
      projectContextSettingsSchema,
    );
  }

  setContextMethods(
    projectIdOrSlug: string,
    input: SetContextAnalysisMethods,
  ): Promise<ProjectContextSettings> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/settings/methods`,
      projectContextSettingsSchema,
      { method: "POST", body: JSON.stringify(setContextAnalysisMethodsSchema.parse(input)) },
    );
  }

  listContextInternalInputs(projectIdOrSlug: string): Promise<ContextInternalInput[]> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/internal-inputs`,
      z.array(contextInternalInputSchema),
    );
  }

  upsertContextInternalInput(
    projectIdOrSlug: string,
    input: UpsertContextInternalInput,
  ): Promise<ContextInternalInput> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/internal-inputs`,
      contextInternalInputSchema,
      { method: "POST", body: JSON.stringify(upsertContextInternalInputSchema.parse(input)) },
    );
  }

  saveContextInternalInputs(
    projectIdOrSlug: string,
    input: SaveContextInternalInputs,
  ): Promise<ContextInternalInput[]> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/internal-inputs/bulk`,
      z.array(contextInternalInputSchema),
      { method: "POST", body: JSON.stringify(saveContextInternalInputsSchema.parse(input)) },
    );
  }

  getContextScope(projectIdOrSlug: string): Promise<ContextScope> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/scope`,
      contextScopeSchema,
    );
  }

  listContextExternalFactors(projectIdOrSlug: string): Promise<ContextExternalFactor[]> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/external-factors`,
      z.array(contextExternalFactorSchema),
    );
  }

  listContextExternalRuns(projectIdOrSlug: string): Promise<ContextExternalRunSummary[]> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/external-runs`,
      z.array(contextExternalRunSummarySchema),
    );
  }

  triggerContextExternalResearch(projectIdOrSlug: string): Promise<ContextJob> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/external-runs`,
      contextJobSchema,
      { method: "POST" },
    );
  }

  listContextAnalysisRuns(projectIdOrSlug: string): Promise<ContextAnalysisRunSummary[]> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/runs`,
      z.array(contextAnalysisRunSummarySchema),
    );
  }

  triggerContextSynthesis(projectIdOrSlug: string): Promise<ContextJob> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/runs`,
      contextJobSchema,
      { method: "POST" },
    );
  }

  /** Tab 1: the internal issues deduced from the declared internal context. */
  listContextInternalIssues(projectIdOrSlug: string): Promise<ContextIssue[]> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/internal-issues`,
      z.array(contextIssueSchema),
    );
  }

  triggerContextInternalIssues(projectIdOrSlug: string): Promise<ContextJob> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/internal-issues/runs`,
      contextJobSchema,
      { method: "POST" },
    );
  }

  /** "Valider la synthèse": validates the latest synthesis, which unlocks the exports. */
  validateContextSynthesis(projectIdOrSlug: string): Promise<ContextAnalysisRunSummary> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/synthesis/validate`,
      contextAnalysisRunSummarySchema,
      { method: "POST" },
    );
  }

  listContextIssues(projectIdOrSlug: string): Promise<ContextIssue[]> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/issues`,
      z.array(contextIssueSchema),
    );
  }

  createManualContextIssue(
    projectIdOrSlug: string,
    input: CreateManualContextIssue,
  ): Promise<ContextIssue> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/issues`,
      contextIssueSchema,
      { method: "POST", body: JSON.stringify(createManualContextIssueSchema.parse(input)) },
    );
  }

  applyContextIssueOverride(
    projectIdOrSlug: string,
    issueId: string,
    input: ApplyContextIssueOverride,
  ): Promise<ContextIssue> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/issues/${encodeURIComponent(issueId)}/override`,
      contextIssueSchema,
      { method: "POST", body: JSON.stringify(applyContextIssueOverrideSchema.parse(input)) },
    );
  }

  addContextIssueEvidence(
    projectIdOrSlug: string,
    issueId: string,
    input: AddContextIssueEvidence,
  ): Promise<ContextIssue> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/issues/${encodeURIComponent(issueId)}/evidence`,
      contextIssueSchema,
      { method: "POST", body: JSON.stringify(addContextIssueEvidenceSchema.parse(input)) },
    );
  }

  assistContextAnswer(
    projectIdOrSlug: string,
    input: ContextAnswerAssistRequest,
  ): Promise<ContextAnswerAssistResponse> {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/internal-inputs/assist`,
      contextAnswerAssistResponseSchema,
      { method: "POST", body: JSON.stringify(contextAnswerAssistRequestSchema.parse(input)) },
    );
  }

  scopeRegister(projectId: string) {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectId)}/scope`,
      scopeRegisterSchema,
    );
  }
  writeScope(projectId: string, input: ScopeWrite) {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectId)}/scope/review`,
      scopeRegisterSchema,
      { method: "POST", body: JSON.stringify(scopeWriteSchema.parse(input)) },
    );
  }
  launchScope(projectId: string, input: ScopeLaunch) {
    return this.#request(`/v1/projects/${encodeURIComponent(projectId)}/scope/runs`, pipJobSchema, {
      method: "POST",
      body: JSON.stringify(scopeLaunchSchema.parse(input)),
    });
  }
  exportScopeVersion(projectId: string, statementId: string) {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectId)}/scope/versions/${encodeURIComponent(statementId)}/export`,
      scopeStatementSchema,
    );
  }
  roRegister(projectId: string) {
    return this.#request(`/v1/projects/${encodeURIComponent(projectId)}/ro`, roRegisterSchema);
  }
  launchRo(projectId: string, input: RoLaunch) {
    return this.#request(`/v1/projects/${encodeURIComponent(projectId)}/ro/runs`, pipJobSchema, {
      method: "POST",
      body: JSON.stringify(roLaunchSchema.parse(input)),
    });
  }
  writeRo(projectId: string, input: RoWrite) {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectId)}/ro/review`,
      roRegisterSchema,
      { method: "POST", body: JSON.stringify(roWriteSchema.parse(input)) },
    );
  }
  validateRo(projectId: string) {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectId)}/ro/validate`,
      roRegisterSchema,
      { method: "POST" },
    );
  }
  async exportRoRegister(projectId: string): Promise<ArrayBuffer> {
    const response = await this.#axios.get<ArrayBuffer>(
      `/v1/projects/${encodeURIComponent(projectId)}/ro/export.xlsx`,
      { responseType: "arraybuffer" },
    );
    return response.data;
  }
  pipRegister(projectId: string) {
    return this.#request(`/v1/projects/${encodeURIComponent(projectId)}/pip`, pipRegisterSchema);
  }
  launchPip(projectId: string, input: PipLaunch) {
    return this.#request(`/v1/projects/${encodeURIComponent(projectId)}/pip/runs`, pipJobSchema, {
      method: "POST",
      body: JSON.stringify(pipLaunchSchema.parse(input)),
    });
  }
  reviewPip(projectId: string, input: PipReview) {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectId)}/pip/review`,
      pipRegisterSchema,
      { method: "POST", body: JSON.stringify(pipReviewSchema.parse(input)) },
    );
  }
  allocatePip(projectId: string, input: PipAllocation) {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectId)}/pip/allocation`,
      pipRegisterSchema,
      { method: "POST", body: JSON.stringify(pipAllocationSchema.parse(input)) },
    );
  }
  addPipParty(projectId: string, input: PipAddParty) {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectId)}/pip/parties`,
      pipRegisterSchema,
      { method: "POST", body: JSON.stringify(pipAddPartySchema.parse(input)) },
    );
  }
  addPipRequirement(projectId: string, input: PipAddRequirement) {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectId)}/pip/requirements`,
      pipRegisterSchema,
      { method: "POST", body: JSON.stringify(pipAddRequirementSchema.parse(input)) },
    );
  }
  answerPip(projectId: string, input: PipAnswer) {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectId)}/pip/clarifications`,
      pipRegisterSchema,
      { method: "POST", body: JSON.stringify(pipAnswerSchema.parse(input)) },
    );
  }
  validatePip(projectId: string) {
    return this.#request(
      `/v1/projects/${encodeURIComponent(projectId)}/pip/validate`,
      pipRegisterSchema,
      { method: "POST" },
    );
  }
  async exportPipRegister(projectId: string): Promise<ArrayBuffer> {
    const response = await this.#axios.get<ArrayBuffer>(
      `/v1/projects/${encodeURIComponent(projectId)}/pip/export.xlsx`,
      { responseType: "arraybuffer" },
    );
    return response.data;
  }

  async exportContextRegister(projectIdOrSlug: string): Promise<ArrayBuffer> {
    const response = await this.#axios.get<ArrayBuffer>(
      `/v1/projects/${encodeURIComponent(projectIdOrSlug)}/context/export.xlsx`,
      { responseType: "arraybuffer" },
    );
    return response.data;
  }

  processSheets(id: string) {
    return this.#request(
      `/v1/projects/${encodeURIComponent(id)}/process-sheets`,
      processSheetRegisterSchema,
    );
  }
  prepareProcessSheet(id: string, processId: string) {
    return this.#request(
      `/v1/projects/${encodeURIComponent(id)}/process-sheets`,
      processSheetRegisterSchema,
      { method: "POST", body: JSON.stringify({ processId }) },
    );
  }
  writeProcessSheet(id: string, sheetId: string, input: ProcessSheetWrite) {
    return this.#request(
      `/v1/projects/${encodeURIComponent(id)}/process-sheets/${encodeURIComponent(sheetId)}/review`,
      processSheetRegisterSchema,
      { method: "POST", body: JSON.stringify(processSheetWriteSchema.parse(input)) },
    );
  }
  launchProcessSheet(id: string, sheetId: string, revision: number) {
    return this.#request(
      `/v1/projects/${encodeURIComponent(id)}/process-sheets/${encodeURIComponent(sheetId)}/runs`,
      processSheetRegisterSchema,
      { method: "POST", body: JSON.stringify({ revision }) },
    );
  }
  exportProcessSheet(id: string, versionId: string) {
    return this.#request(
      `/v1/projects/${encodeURIComponent(id)}/process-sheets/versions/${encodeURIComponent(versionId)}/export`,
      processSheetVersionSchema,
    );
  }

  planningRegister(id: string, module: PlanningModule) {
    return this.#request(
      `/v1/projects/${encodeURIComponent(id)}/planning/${module}`,
      planningRegisterSchema,
    );
  }
  writePlanning(id: string, module: PlanningModule, input: PlanningWrite) {
    return this.#request(
      `/v1/projects/${encodeURIComponent(id)}/planning/${module}/review`,
      planningRegisterSchema,
      { method: "POST", body: JSON.stringify(planningWriteSchema.parse(input)) },
    );
  }
  launchPlanning(id: string, module: PlanningModule, input: PlanningLaunch) {
    return this.#request(
      `/v1/projects/${encodeURIComponent(id)}/planning/${module}/runs`,
      planningRegisterSchema,
      { method: "POST", body: JSON.stringify(planningLaunchSchema.parse(input)) },
    );
  }
  async exportPlanningExcel(
    id: string,
    module: PlanningModule,
    versionId: string,
  ): Promise<ArrayBuffer> {
    return (
      await this.#axios.get<ArrayBuffer>(
        `/v1/projects/${encodeURIComponent(id)}/planning/${module}/versions/${encodeURIComponent(versionId)}/export.xlsx`,
        { responseType: "arraybuffer" },
      )
    ).data;
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
