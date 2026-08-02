import { createContext, type PropsWithChildren, useContext, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

import { clientApi, type OnboardingStatus, type ProjectSummary } from "./client-api.js";

export const authClient = createAuthClient({
  baseURL: import.meta.env["VITE_API_URL"] ?? "http://localhost:3000",
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
  projects: ProjectSummary[];
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
    queryFn: async (): Promise<ClientOrganization[]> => {
      const response = await fetch(
        `${import.meta.env["VITE_API_URL"] ?? "http://localhost:3000"}/api/auth-context/organizations`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Unable to load active organizations");
      return (await response.json()) as ClientOrganization[];
    },
  });
  const onboardingQuery = useQuery({
    queryKey: ["client", "onboarding-status", session.data?.user.id, activeOrganizationQuery.data?.id],
    enabled: Boolean(session.data?.user),
    queryFn: clientApi.onboardingStatus,
  });
  const projectsQuery = useQuery({
    queryKey: ["client", "projects", session.data?.user.id, activeOrganizationQuery.data?.id],
    enabled: Boolean(session.data?.user && onboardingQuery.data?.hasOrganization),
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
          (Boolean(onboardingQuery.data?.hasOrganization) && projectsQuery.isPending))),
    selectOrganization: async (organizationId) => {
      const result = await authClient.organization.setActive({ organizationId });
      if (result.error) throw new Error(result.error.message);
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
