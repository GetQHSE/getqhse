import type { PropsWithChildren, ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "./auth.js";
import { type Permission, usePermissions } from "./permissions.js";

export function AuthenticatedRoute({ children }: PropsWithChildren) {
  const { user, isPending } = useAuth();
  const location = useLocation();
  if (isPending && !user) return <p role="status">Chargement…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export function OrganizationRoute({ children }: PropsWithChildren) {
  const { activeOrganization, onboarding, isPending } = useAuth();
  const location = useLocation();
  if (isPending && !activeOrganization && !onboarding) return <p role="status">Chargement…</p>;
  if (onboarding?.nextStep === "CREATE_ORGANIZATION") {
    return <Navigate to="/onboarding/organization" replace />;
  }
  if (onboarding?.nextStep === "CREATE_PROJECT" && location.pathname !== "/onboarding/project") {
    return <Navigate to="/onboarding/project" replace />;
  }
  if (location.pathname.startsWith("/onboarding") && onboarding?.nextStep === "OPEN_PROJECTS") {
    return <Navigate to="/projects" replace />;
  }
  if (!activeOrganization) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div>
          <h1 className="text-xl font-semibold">Aucune organisation active</h1>
          <p>Contactez un administrateur pour obtenir une adhésion active.</p>
        </div>
      </main>
    );
  }
  return children;
}

export function PermissionRoute({
  permission,
  children,
  fallback = <Navigate to="/forbidden" replace />,
}: PropsWithChildren<{ permission: Permission; fallback?: ReactNode }>) {
  return usePermissions().has(permission) ? children : fallback;
}
