import {
  onboardingStatusSchema,
  paginatedProjectsSchema,
  projectSchema,
  type CreateProject,
  type OnboardingStatus,
  type Project,
} from "@qhse/contracts";

import { apiUrl } from "./api-url.js";

async function request<T>(
  path: string,
  parse: (value: unknown) => T,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(`Client API request failed: ${response.status}`);
  return parse(body);
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
