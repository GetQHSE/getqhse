import { createContext, type PropsWithChildren, useContext, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

import type { OnboardingStatus, Project } from "@qhse/contracts";

import { apiRequest } from "@qhse/api-client";

import { clientApi, clientHttp } from "./client-api.js";

import { API_BASE_URL } from "./api-url.js";

export const authClient = createAuthClient({
  baseURL: API_BASE_URL,
  fetchOptions: { credentials: "include" },
  plugins: [
    organizationClient({
      schema: {
        organization: {
          additionalFields: {
            status: { type: ["active", "suspended", "archived"] },
            countryCode: { type: "string" },
            locale: { type: "string" },
            timezone: { type: "string" },
            icon: { type: "string" },
          },
        },
        member: {
          additionalFields: {
            status: { type: ["active", "suspended"] },
          },
        },
      },
    }),
  ],
});

export type ClientOrganization = {
  id: string;
  name: string;
  slug: string;
};

type AuthContextValue = {
  user: { id: string; email: string } | null;
  organizations: ClientOrganization[];
  activeOrganization: ClientOrganization | null;
  onboarding: OnboardingStatus | null;
  projects: Project[];
  isPending: boolean;
  selectOrganization: (organizationId: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const session = authClient.useSession();
  const activeOrganizationQuery = authClient.useActiveOrganization();
  const activeMemberships = useQuery({
    queryKey: ["auth", "organizations", session.data?.user.id],
    enabled: Boolean(session.data?.user),
    queryFn: () => apiRequest<ClientOrganization[]>(clientHttp, "/api/auth-context/organizations"),
  });
  const onboardingQuery = useQuery({
    queryKey: [
      "client",
      "onboarding-status",
      session.data?.user.id,
      activeOrganizationQuery.data?.id,
    ],
    enabled: Boolean(session.data?.user),
    queryFn: clientApi.onboardingStatus,
  });
  const projectsQuery = useQuery({
    queryKey: ["client", "projects", session.data?.user.id, activeOrganizationQuery.data?.id],
    enabled: Boolean(session.data?.user && activeOrganizationQuery.data?.id),
    queryFn: clientApi.projects,
  });
  const organizations = useMemo(() => activeMemberships.data ?? [], [activeMemberships.data]);
  const activeOrganization =
    activeOrganizationQuery.data &&
    organizations.some((organization) => organization.id === activeOrganizationQuery.data?.id)
      ? {
          id: activeOrganizationQuery.data.id,
          name: activeOrganizationQuery.data.name,
          slug: activeOrganizationQuery.data.slug,
        }
      : null;

  useEffect(() => {
    if (
      session.data?.user &&
      !activeOrganizationQuery.isPending &&
      !activeOrganizationQuery.data &&
      organizations.length === 1 &&
      organizations[0]
    ) {
      void authClient.organization.setActive({ organizationId: organizations[0].id });
    }
  }, [
    activeOrganizationQuery.data,
    activeOrganizationQuery.isPending,
    organizations,
    session.data?.user,
  ]);

  const value: AuthContextValue = {
    user: session.data?.user ? { id: session.data.user.id, email: session.data.user.email } : null,
    organizations,
    activeOrganization,
    onboarding: onboardingQuery.data ?? null,
    projects: projectsQuery.data ?? [],
    isPending:
      session.isPending ||
      (Boolean(session.data?.user) &&
        (activeMemberships.isPending ||
          activeOrganizationQuery.isPending ||
          onboardingQuery.isPending ||
          (Boolean(activeOrganizationQuery.data?.id) && projectsQuery.isPending))),
    selectOrganization: async (organizationId) => {
      const result = await authClient.organization.setActive({ organizationId });
      if (result.error) throw new Error(result.error.message);
      await Promise.all([activeOrganizationQuery.refetch(), onboardingQuery.refetch()]);
      await projectsQuery.refetch();
    },
    logout: async () => {
      await authClient.signOut();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
