import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toSupportedLanguage } from "@qhse/contracts";
import { DirectionProvider } from "@qhse/ui/components/direction";
import type { PropsWithChildren } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";

import { AuthProvider, useAuth } from "./auth.js";
import { i18n, languageDirection } from "./i18n.js";
import { PermissionProvider, permissionsForRole } from "./permissions.js";

function ActiveRolePermissions({ children }: PropsWithChildren) {
  const { activeOrganization } = useAuth();
  return (
    <PermissionProvider permissions={permissionsForRole(activeOrganization?.role)}>
      {children}
    </PermissionProvider>
  );
}

/** Lets Base UI popovers, menus and sliders mirror themselves in Arabic. */
function LanguageDirection({ children }: PropsWithChildren) {
  const { i18n: instance } = useTranslation();
  return (
    <DirectionProvider direction={languageDirection(toSupportedLanguage(instance.language))}>
      {children}
    </DirectionProvider>
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
      <LanguageDirection>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ActiveRolePermissions>{children}</ActiveRolePermissions>
          </AuthProvider>
        </QueryClientProvider>
      </LanguageDirection>
    </I18nextProvider>
  );
}
