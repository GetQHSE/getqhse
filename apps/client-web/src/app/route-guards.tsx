import type { PropsWithChildren, ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";

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
  if (onboarding?.nextStep === "WAIT_FOR_PROJECT" && location.pathname !== "/team") {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold">Votre espace est en cours de préparation</h1>
          <p className="mt-3 text-sm text-slate-600">
            Un propriétaire ou administrateur doit créer le premier projet avant que vous puissiez
            commencer.
          </p>
          <Link className="mt-5 inline-block text-sm font-medium text-violet-700" to="/team">
            Voir les membres de l’organisation
          </Link>
        </div>
      </main>
    );
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
