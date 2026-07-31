import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { I18nextProvider } from "react-i18next";

import { AuthProvider } from "./auth.js";
import { i18n } from "./i18n.js";
import { PermissionProvider } from "./permissions.js";

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
          <PermissionProvider
            permissions={new Set(["site:read", "site:write", "audit:read", "audit:write"])}
          >
            {children}
          </PermissionProvider>
        </AuthProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
