import type { PropsWithChildren, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation } from "react-router-dom";

import { useAuth } from "./auth.js";
import { type Permission, usePermissions } from "./permissions.js";

export function AuthenticatedRoute({ children }: PropsWithChildren) {
  const { user, isPending } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  if (isPending && !user) return <p role="status">{t("loading")}</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export function OrganizationRoute({ children }: PropsWithChildren) {
  const { activeOrganization, onboarding, isPending } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  if (isPending && !activeOrganization && !onboarding) return <p role="status">{t("loading")}</p>;
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
          <h1 className="text-xl font-semibold">{t("guards.preparingTitle")}</h1>
          <p className="mt-3 text-sm text-slate-600">{t("guards.preparingBody")}</p>
          <Link className="mt-5 inline-block text-sm font-medium text-violet-700" to="/team">
            {t("guards.viewMembers")}
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
          <h1 className="text-xl font-semibold">{t("guards.noOrganizationTitle")}</h1>
          <p>{t("guards.noOrganizationBody")}</p>
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
