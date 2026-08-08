import { SidebarInset, SidebarProvider, SidebarTrigger } from "@qhse/ui/components/sidebar";
import { Outlet, useMatch } from "react-router-dom";

import { AppSidebar } from "#components/app-sidebar";
import { useAuth } from "./auth.js";

export function AppLayout() {
  const { activeOrganization, organizations, projects, user, logout, selectOrganization } =
    useAuth();
  const projectMatch = useMatch("/projects/:projectId/*");
  const activeProject = projects.find(
    (project) =>
      project.id === projectMatch?.params.projectId || project.slug === projectMatch?.params.projectId,
  );
  const displayName = user?.email.split("@")[0] ?? "Utilisateur";

  return (
    <SidebarProvider>
      <AppSidebar
        activeTeamId={activeOrganization?.id}
        onLogout={logout}
        onSelectTeam={selectOrganization}
        activeProject={
          activeProject ? { name: activeProject.name, slug: activeProject.slug } : undefined
        }
        teams={organizations}
        user={{ name: displayName, email: user?.email ?? "" }}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <div>
            <p className="text-sm text-muted-foreground">
              {activeProject ? activeOrganization?.name : "Organisation active"}
            </p>
            <h1 className="font-semibold">
              {activeProject?.name ?? activeOrganization?.name ?? "QHSE Platform"}
            </h1>
          </div>
        </header>
        <main className="flex-1 bg-slate-50 p-6 text-slate-900">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
