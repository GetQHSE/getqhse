import * as React from "react";

import { NavMain, type MainNavItem } from "#components/nav-main";
import { NavProjects } from "#components/nav-projects";
import { NavUser, type SidebarUser } from "#components/nav-user";
import { TeamSwitcher, type SidebarTeam } from "#components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@qhse/ui/components/sidebar";
import {
  BellIcon,
  Building2Icon,
  ClipboardCheckIcon,
  FolderKanbanIcon,
  GaugeIcon,
} from "lucide-react";

export type AppSidebarProject = { name: string; slug: string };

const mainNav: MainNavItem[] = [
  { title: "Tableau de bord", url: "/", icon: <GaugeIcon />, end: true },
  { title: "Projets", url: "/projects", icon: <FolderKanbanIcon /> },
  { title: "Sites", url: "/sites", icon: <Building2Icon /> },
  { title: "Audits", url: "/audits", icon: <ClipboardCheckIcon /> },
  { title: "Notifications", url: "/notifications", icon: <BellIcon /> },
];

export function AppSidebar({
  user,
  teams,
  activeTeamId,
  projects,
  onSelectTeam,
  onLogout,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: SidebarUser;
  teams: SidebarTeam[];
  activeTeamId?: string | undefined;
  projects: AppSidebarProject[];
  onSelectTeam: (teamId: string) => void | Promise<void>;
  onLogout: () => void | Promise<void>;
}) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={teams} activeTeamId={activeTeamId} onSelectTeam={onSelectTeam} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={mainNav} />
        <NavProjects
          projects={projects.map((project) => ({
            name: project.name,
            url: `/projects/${project.slug}/chat`,
          }))}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} onLogout={onLogout} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
