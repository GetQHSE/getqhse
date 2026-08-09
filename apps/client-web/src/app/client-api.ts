import {
  onboardingStatusSchema,
  paginatedProjectsSchema,
  projectSchema,
  type CreateProject,
  type OnboardingStatus,
  type Project,
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
};
