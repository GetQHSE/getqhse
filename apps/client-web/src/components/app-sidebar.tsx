import * as React from "react";

import { NavMain, type MainNavItem } from "#components/nav-main";
import { NavUser, type SidebarUser } from "#components/nav-user";
import { TeamSwitcher, type SidebarTeam } from "#components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarRail,
} from "@qhse/ui/components/sidebar";
import {
  ArrowLeftIcon,
  FolderKanbanIcon,
  MessageSquareTextIcon,
  ScaleIcon,
  SettingsIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

export type AppSidebarProject = { name: string; slug: string };

const organizationNav: MainNavItem[] = [
  { title: "Projets", url: "/projects", icon: <FolderKanbanIcon /> },
  { title: "Équipe", url: "/team", icon: <UsersIcon /> },
];

function projectNav(slug: string): MainNavItem[] {
  const baseUrl = `/projects/${slug}`;
  return [
    { title: "Chat", url: `${baseUrl}/chat`, icon: <MessageSquareTextIcon /> },
    { title: "Profil", url: `${baseUrl}/profile`, icon: <UserRoundIcon /> },
    {
      title: "Veille réglementaire",
      url: `${baseUrl}/regulatory-watch`,
      icon: <ScaleIcon />,
    },
  ];
}

export function AppSidebar({
  user,
  teams,
  activeTeamId,
  activeProject,
  onSelectTeam,
  onLogout,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: SidebarUser;
  teams: SidebarTeam[];
  activeTeamId?: string | undefined;
  activeProject?: AppSidebarProject | undefined;
  onSelectTeam: (teamId: string) => void | Promise<void>;
  onLogout: () => void | Promise<void>;
}) {
  const location = useLocation();
  const settingsUrl = activeProject ? `/projects/${activeProject.slug}/settings` : null;

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        {activeProject ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip="Retour aux projets"
                render={<Link to="/projects" />}
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <FolderKanbanIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{activeProject.name}</span>
                  <span className="flex items-center gap-1 truncate text-xs">
                    <ArrowLeftIcon className="size-3" /> Organisation
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : (
          <TeamSwitcher teams={teams} activeTeamId={activeTeamId} onSelectTeam={onSelectTeam} />
        )}
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={activeProject ? projectNav(activeProject.slug) : organizationNav} />
      </SidebarContent>
      <SidebarFooter>
        {settingsUrl ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={location.pathname === settingsUrl}
                tooltip="Paramètres"
                render={<Link to={settingsUrl} />}
              >
                <SettingsIcon />
                <span>Paramètres</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : null}
        <NavUser user={user} onLogout={onLogout} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
