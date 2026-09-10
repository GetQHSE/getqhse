import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { I18nextProvider } from "react-i18next";

import { AuthProvider, useAuth } from "./auth.js";
import { i18n } from "./i18n.js";
import { PermissionProvider, permissionsForRole } from "./permissions.js";

function ActiveRolePermissions({ children }: PropsWithChildren) {
  const { activeOrganization } = useAuth();
  return (
    <PermissionProvider permissions={permissionsForRole(activeOrganization?.role)}>
      {children}
    </PermissionProvider>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
    mutations: { retry: 0 },
  },
});

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ActiveRolePermissions>{children}</ActiveRolePermissions>
        </AuthProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
