import { SidebarInset, SidebarProvider, SidebarTrigger } from "@qhse/ui/components/sidebar";
import { BellIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Outlet, useMatch } from "react-router-dom";

import { AppSidebar } from "#components/app-sidebar";
import { useAuth } from "./auth.js";

export function AppLayout() {
  const { activeOrganization, organizations, projects, user, logout, selectOrganization } =
    useAuth();
  const { t } = useTranslation();
  const projectMatch = useMatch("/projects/:projectId/*");
  const activeProject = projects.find(
    (project) =>
      project.id === projectMatch?.params.projectId ||
      project.slug === projectMatch?.params.projectId,
  );
  const displayName = user?.email.split("@")[0] ?? t("userFallback");

  return (
    <SidebarProvider
      style={
        {
          "--sidebar": "#080c16",
          "--sidebar-foreground": "#f3f5f9",
          "--sidebar-accent": "#151827",
          "--sidebar-accent-foreground": "#ffffff",
          "--sidebar-border": "#202536",
          "--sidebar-primary": "#7c3aed",
          "--sidebar-primary-foreground": "#ffffff",
        } as CSSProperties
      }
    >
      <AppSidebar
        activeTeamId={activeOrganization?.id}
        onLogout={logout}
        onSelectTeam={selectOrganization}
        activeProject={
          activeProject ? { name: activeProject.name, slug: activeProject.slug } : undefined
        }
        projects={projects.map(({ id, name, slug }) => ({ id, name, slug }))}
        teams={organizations}
        user={{ name: displayName, email: user?.email ?? "" }}
      />
      <SidebarInset className="min-w-0 bg-[#f6f6f8]">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <SidebarTrigger className="text-slate-500" />
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Link
              to="/"
              className="hidden truncate font-medium text-slate-500 hover:text-slate-900 sm:block"
            >
              {activeOrganization?.name ?? "GetQHSE"}
            </Link>
            {activeProject && (
              <>
                <ChevronRightIcon className="hidden size-4 shrink-0 text-slate-300 sm:block rtl:rotate-180" />
                <span className="truncate font-semibold text-slate-900">{activeProject.name}</span>
              </>
            )}
            {!activeProject && (
              <span className="truncate font-semibold text-slate-900 sm:hidden">
                {activeOrganization?.name ?? "GetQHSE"}
              </span>
            )}
          </div>
          <div className="ms-auto flex items-center gap-2">
            <button
              className="hidden h-9 w-52 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-start text-xs text-slate-400 lg:flex"
              type="button"
            >
              <SearchIcon className="size-4" /> {t("search")}
              <span className="ms-auto rounded border bg-white px-1.5 py-0.5 text-[10px]">⌘ K</span>
            </button>
            <Link
              to="/notifications"
              aria-label={t("notifications")}
              className="relative grid size-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <BellIcon className="size-4" />
              <span className="absolute end-2 top-2 size-1.5 rounded-full bg-violet-600 ring-2 ring-white" />
            </Link>
          </div>
        </header>
        <main className="min-w-0 flex-1 bg-[#f6f6f8] p-6 text-slate-900">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
