import { SidebarInset, SidebarProvider, SidebarTrigger } from "@qhse/ui/components/sidebar";
import { Outlet } from "react-router-dom";

import { AppSidebar } from "#components/app-sidebar";
import { useAuth } from "./auth.js";

export function AppLayout() {
  const { activeOrganization, organizations, projects, user, logout, selectOrganization } = useAuth();
  const displayName = user?.email.split("@")[0] ?? "Utilisateur";

  return (
    <SidebarProvider>
      <AppSidebar
        activeTeamId={activeOrganization?.id}
        onLogout={logout}
        onSelectTeam={selectOrganization}
        projects={projects.map((project) => ({ name: project.name, slug: project.slug }))}
        teams={organizations}
        user={{ name: displayName, email: user?.email ?? "" }}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <div>
            <p className="text-sm text-muted-foreground">Organisation active</p>
            <h1 className="font-semibold">{activeOrganization?.name ?? "QHSE Platform"}</h1>
          </div>
        </header>
        <main className="flex-1 bg-slate-50 p-6 text-slate-900">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
