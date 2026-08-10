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
} from "@qhse/contracts";
import { apiRequest, createAxiosClient, type ApiRequestInit } from "@qhse/api-client";

import { API_BASE_URL } from "./api-url.js";

export const clientHttp = createAxiosClient({ baseUrl: API_BASE_URL });

async function request<T>(
  path: string,
  parse: (value: unknown) => T,
  init?: ApiRequestInit,
): Promise<T> {
  return parse(await apiRequest<unknown>(clientHttp, path, init));
}

export const clientApi = {
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
