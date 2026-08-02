const API_BASE_URL = import.meta.env["VITE_API_URL"] ?? "http://localhost:3000";

export type OnboardingStatus = {
  hasOrganization: boolean;
  hasProject: boolean;
  activeOrganizationId: string | null;
  activeProjectId: string | null;
};

export type ProjectSummary = {
  id: string;
  name: string;
  organizationId: string;
  description?: string | null;
  activities: string[];
};

export type OrganizationInput = {
  name: string;
  slug: string;
};

export type ProjectInput = {
  name: string;
  description?: string | undefined;
  activities: string[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error(`Client API request failed: ${response.status}`);
  return (await response.json()) as T;
}

// Temporary frontend adapter for Task 1 while client-api exposes no onboarding/project endpoints yet.
// Keep all assumed contracts isolated here so they can be replaced by generated contracts later.
export const clientApi = {
  onboardingStatus: async (): Promise<OnboardingStatus> =>
    request<OnboardingStatus>("/api/onboarding/status").catch(() => ({
      hasOrganization: false,
      hasProject: false,
      activeOrganizationId: null,
      activeProjectId: null,
    })),
  createOrganization: (input: OrganizationInput) =>
    request<{ id: string }>("/api/onboarding/organization", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  projects: async (): Promise<ProjectSummary[]> =>
    request<ProjectSummary[]>("/api/projects").catch(() => []),
  createProject: (input: ProjectInput) =>
    request<ProjectSummary>("/api/onboarding/project", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
