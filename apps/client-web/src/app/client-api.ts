import {
  fileObjectSchema,
  fileTranscriptionSchema,
  fileUploadResponseSchema,
  completeProjectProfileSchema,
  onboardingStatusSchema,
  paginatedProjectsSchema,
  projectProfileConversationSchema,
  projectProfileSnapshotSchema,
  projectProfileSchema,
  projectSchema,
  createFileUploadSchema,
  updateProjectProfileSchema,
  invitationPreviewSchema,
  organizationTeamSchema,
  updateMembershipStatusSchema,
  updateUserPreferencesSchema,
  userPreferencesSchema,
  type CreateFileUpload,
  type FileTranscription,
  type FileUploadResponse,
  type CreateProject,
  type OnboardingStatus,
  type Project,
  type ProjectProfile,
  type ProjectProfileConversation,
  type ProjectProfileSnapshot,
  type UpdateProjectProfile,
  type InvitationPreview,
  type OrganizationTeam,
  type UpdateMembershipStatus,
  type UserPreferences,
} from "@qhse/contracts";
import {
  apiRequest,
  createAxiosClient,
  QhseApiClient,
  type ApiRequestInit,
} from "@qhse/api-client";

import { API_BASE_URL } from "./api-url.js";

export const clientHttp = createAxiosClient({ baseUrl: API_BASE_URL });
const qhseApi = new QhseApiClient({ baseUrl: API_BASE_URL, axios: clientHttp });

async function request<T>(
  path: string,
  parse: (value: unknown) => T,
  init?: ApiRequestInit,
): Promise<T> {
  return parse(await apiRequest<unknown>(clientHttp, path, init));
}

export const clientApi = {
  preferences: (): Promise<UserPreferences> =>
    request("/api/auth-context/preferences", (value) => userPreferencesSchema.parse(value)),
  updatePreferences: (input: UserPreferences): Promise<UserPreferences> =>
    request("/api/auth-context/preferences", (value) => userPreferencesSchema.parse(value), {
      method: "PATCH",
      body: JSON.stringify(updateUserPreferencesSchema.parse(input)),
    }),
  invitationPreview: (id: string): Promise<InvitationPreview> =>
    request(`/v1/organization-invitations/${encodeURIComponent(id)}/preview`, (value) =>
      invitationPreviewSchema.parse(value),
    ),
  organizationTeam: (): Promise<OrganizationTeam> =>
    request("/v1/organization-team", (value) => organizationTeamSchema.parse(value)),
  updateMembershipStatus: (
    memberId: string,
    input: UpdateMembershipStatus,
  ): Promise<OrganizationTeam> =>
    request(
      `/v1/organization-members/${encodeURIComponent(memberId)}/status`,
      (value) => organizationTeamSchema.parse(value),
      { method: "PATCH", body: JSON.stringify(updateMembershipStatusSchema.parse(input)) },
    ),
  onboardingStatus: (): Promise<OnboardingStatus> =>
    request("/v1/onboarding/status", (value) => onboardingStatusSchema.parse(value)),
  projects: (): Promise<Project[]> =>
    request("/v1/projects", (value) => paginatedProjectsSchema.parse(value).data),
  project: (idOrSlug: string): Promise<Project> =>
    request(`/v1/projects/${encodeURIComponent(idOrSlug)}`, (value) => projectSchema.parse(value)),
  createProject: (input: CreateProject): Promise<Project> =>
    request("/v1/projects", (value) => projectSchema.parse(value), {
      method: "POST",
      body: JSON.stringify(input),
    }),
  projectProfile: (idOrSlug: string): Promise<ProjectProfile> =>
    request(`/v1/projects/${encodeURIComponent(idOrSlug)}/profile`, (value) =>
      projectProfileSchema.parse(value),
    ),
  projectProfileConversation: (idOrSlug: string): Promise<ProjectProfileConversation | null> =>
    request(`/v1/projects/${encodeURIComponent(idOrSlug)}/profile/conversation`, (value) => {
      if (value === undefined || value === null || value === "") return null;
      return projectProfileConversationSchema.parse(value);
    }),
  updateProjectProfile: (idOrSlug: string, input: UpdateProjectProfile): Promise<ProjectProfile> =>
    request(
      `/v1/projects/${encodeURIComponent(idOrSlug)}/profile`,
      (value) => projectProfileSchema.parse(value),
      {
        method: "PATCH",
        body: JSON.stringify(updateProjectProfileSchema.parse(input)),
      },
    ),
  completeProjectProfile: (idOrSlug: string, revision: number): Promise<ProjectProfileSnapshot> =>
    request(
      `/v1/projects/${encodeURIComponent(idOrSlug)}/profile/complete`,
      (value) => projectProfileSnapshotSchema.parse(value),
      {
        method: "POST",
        body: JSON.stringify(completeProjectProfileSchema.parse({ revision })),
      },
    ),
  exportProjectProfile: (idOrSlug: string) => qhseApi.exportProjectProfile(idOrSlug),
  importProjectProfile: (
    idOrSlug: string,
    input: Parameters<QhseApiClient["importProjectProfile"]>[1],
  ) => qhseApi.importProjectProfile(idOrSlug, input),
  regulatoryWatch: (idOrSlug: string) => qhseApi.getRegulatoryWatch(idOrSlug),
  startRegulatoryAnalysis: (
    idOrSlug: string,
    input: Parameters<QhseApiClient["startRegulatoryAnalysis"]>[1],
  ) => qhseApi.startRegulatoryAnalysis(idOrSlug, input),
  answerRegulatoryClarifications: (
    idOrSlug: string,
    runId: string,
    input: Parameters<QhseApiClient["answerRegulatoryClarifications"]>[2],
  ) => qhseApi.answerRegulatoryClarifications(idOrSlug, runId, input),
  reviewRegulatoryAnalysis: (
    idOrSlug: string,
    runId: string,
    input: Parameters<QhseApiClient["reviewRegulatoryAnalysis"]>[2],
  ) => qhseApi.reviewRegulatoryAnalysis(idOrSlug, runId, input),
  decideRegulatoryCandidate: (
    idOrSlug: string,
    candidateId: string,
    input: Parameters<QhseApiClient["decideRegulatoryCandidate"]>[2],
  ) => qhseApi.decideRegulatoryCandidate(idOrSlug, candidateId, input),
  decideRegulatoryCandidates: (
    idOrSlug: string,
    input: Parameters<QhseApiClient["decideRegulatoryCandidates"]>[1],
  ) => qhseApi.decideRegulatoryCandidates(idOrSlug, input),
  publishRegulatoryBaseline: (
    idOrSlug: string,
    input: Parameters<QhseApiClient["publishRegulatoryBaseline"]>[1],
  ) => qhseApi.publishRegulatoryBaseline(idOrSlug, input),
  publishRegulatoryBaselineAutomatically: (
    idOrSlug: string,
    input: Parameters<QhseApiClient["publishRegulatoryBaselineAutomatically"]>[1],
  ) => qhseApi.publishRegulatoryBaselineAutomatically(idOrSlug, input),
  startRegulatoryEvaluation: (idOrSlug: string) => qhseApi.startRegulatoryEvaluation(idOrSlug),
  updateRegulatoryEvaluation: (
    idOrSlug: string,
    evaluationId: string,
    input: Parameters<QhseApiClient["updateRegulatoryEvaluation"]>[2],
  ) => qhseApi.updateRegulatoryEvaluation(idOrSlug, evaluationId, input),
  addRegulatoryAction: (
    idOrSlug: string,
    evaluationId: string,
    input: Parameters<QhseApiClient["addRegulatoryAction"]>[2],
  ) => qhseApi.addRegulatoryAction(idOrSlug, evaluationId, input),
  updateRegulatoryAction: (
    idOrSlug: string,
    actionId: string,
    input: Parameters<QhseApiClient["updateRegulatoryAction"]>[2],
  ) => qhseApi.updateRegulatoryAction(idOrSlug, actionId, input),
  addRegulatoryEvidence: (
    idOrSlug: string,
    evaluationId: string,
    input: Parameters<QhseApiClient["addRegulatoryEvidence"]>[2],
  ) => qhseApi.addRegulatoryEvidence(idOrSlug, evaluationId, input),
  updateRegulatoryEvidence: (
    idOrSlug: string,
    evidenceId: string,
    input: Parameters<QhseApiClient["updateRegulatoryEvidence"]>[2],
  ) => qhseApi.updateRegulatoryEvidence(idOrSlug, evidenceId, input),
  deleteRegulatoryEvidence: (idOrSlug: string, evidenceId: string) =>
    qhseApi.deleteRegulatoryEvidence(idOrSlug, evidenceId),
  exportRegulatoryWatch: (idOrSlug: string) => qhseApi.exportRegulatoryWatch(idOrSlug),

  // SMQ Contexte (§4.1)
  contextSettings: (idOrSlug: string) => qhseApi.getContextSettings(idOrSlug),
  setContextMethod: (idOrSlug: string, input: Parameters<QhseApiClient["setContextMethod"]>[1]) =>
    qhseApi.setContextMethod(idOrSlug, input),
  contextInternalInputs: (idOrSlug: string) => qhseApi.listContextInternalInputs(idOrSlug),
  upsertContextInternalInput: (
    idOrSlug: string,
    input: Parameters<QhseApiClient["upsertContextInternalInput"]>[1],
  ) => qhseApi.upsertContextInternalInput(idOrSlug, input),
  saveContextInternalInputs: (
    idOrSlug: string,
    input: Parameters<QhseApiClient["saveContextInternalInputs"]>[1],
  ) => qhseApi.saveContextInternalInputs(idOrSlug, input),
  contextScope: (idOrSlug: string) => qhseApi.getContextScope(idOrSlug),
  contextExternalFactors: (idOrSlug: string) => qhseApi.listContextExternalFactors(idOrSlug),
  contextExternalRuns: (idOrSlug: string) => qhseApi.listContextExternalRuns(idOrSlug),
  triggerContextExternalResearch: (idOrSlug: string) =>
    qhseApi.triggerContextExternalResearch(idOrSlug),
  contextAnalysisRuns: (idOrSlug: string) => qhseApi.listContextAnalysisRuns(idOrSlug),
  triggerContextSynthesis: (idOrSlug: string) => qhseApi.triggerContextSynthesis(idOrSlug),
  contextIssues: (idOrSlug: string) => qhseApi.listContextIssues(idOrSlug),
  createManualContextIssue: (
    idOrSlug: string,
    input: Parameters<QhseApiClient["createManualContextIssue"]>[1],
  ) => qhseApi.createManualContextIssue(idOrSlug, input),
  applyContextIssueOverride: (
    idOrSlug: string,
    issueId: string,
    input: Parameters<QhseApiClient["applyContextIssueOverride"]>[2],
  ) => qhseApi.applyContextIssueOverride(idOrSlug, issueId, input),
  addContextIssueEvidence: (
    idOrSlug: string,
    issueId: string,
    input: Parameters<QhseApiClient["addContextIssueEvidence"]>[2],
  ) => qhseApi.addContextIssueEvidence(idOrSlug, issueId, input),
  exportContextRegister: (idOrSlug: string) => qhseApi.exportContextRegister(idOrSlug),
  assistContextAnswer: (
    idOrSlug: string,
    input: Parameters<QhseApiClient["assistContextAnswer"]>[1],
  ) => qhseApi.assistContextAnswer(idOrSlug, input),
  createFileUpload: (input: CreateFileUpload): Promise<FileUploadResponse> =>
    request("/v1/files/uploads", (value) => fileUploadResponseSchema.parse(value), {
      method: "POST",
      body: JSON.stringify(createFileUploadSchema.parse(input)),
    }),
  completeFileUpload: (fileId: string) =>
    request(
      `/v1/files/${encodeURIComponent(fileId)}/complete`,
      (value) => fileObjectSchema.parse(value),
      { method: "POST" },
    ),
  transcribeVoiceNote: (fileId: string): Promise<FileTranscription> =>
    request(
      `/v1/files/${encodeURIComponent(fileId)}/transcription`,
      (value) => fileTranscriptionSchema.parse(value),
      { method: "POST" },
    ),
};
