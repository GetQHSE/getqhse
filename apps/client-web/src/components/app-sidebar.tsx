import * as React from "react";

import { NavMain, type MainNavItem } from "#components/nav-main";
import { NavUser, type SidebarUser } from "#components/nav-user";
import { TeamSwitcher, type SidebarTeam } from "#components/team-switcher";
import { ProjectSwitcher, type SidebarProject } from "#components/project-switcher";
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
import { BrandLogo } from "@qhse/ui/components/brand-logo";
import {
  CompassIcon,
  ScanLineIcon,
  LayoutDashboardIcon,
  FolderKanbanIcon,
  MessageSquareTextIcon,
  ScaleIcon,
  SettingsIcon,
  ShieldAlertIcon,
  UsersRoundIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

export type AppSidebarProject = { name: string; slug: string };

function organizationNav(t: TFunction): MainNavItem[] {
  return [
    { title: t("nav.overview"), url: "/", icon: <LayoutDashboardIcon />, end: true },
    { title: t("nav.projects"), url: "/projects", icon: <FolderKanbanIcon /> },
    { title: t("nav.team"), url: "/team", icon: <UsersIcon /> },
  ];
}

function projectNav(
  slug: string,
  t: TFunction<["common", "context", "pip", "ro", "scope", "planning", "sheets"]>,
): MainNavItem[] {
  const base = `/projects/${slug}`;
  const module = (
    title: string,
    path: string,
    icon: React.ReactNode,
    steps: readonly string[],
  ) => ({
    title,
    url: `${base}/${path}`,
    icon,
    children: steps.map((title, i) => ({ title, url: `${base}/${path}?step=${i + 1}` })),
  });
  return [
    module(t("nav.regulatoryModule"), "regulatory-watch", <ScaleIcon />, [
      t("nav.regulatoryWatch"),
      t("nav.conformityEvaluation"),
    ]),
    module(t("nav.context"), "context", <CompassIcon />, [
      t("context:ui.steps.internal"),
      t("context:ui.steps.external"),
      t("context:ui.steps.synthesis"),
    ]),
    module(
      t("nav.interestedParties"),
      "interested-parties",
      <UsersRoundIcon />,
      t("pip:steps", { returnObjects: true }),
    ),
    module(t("nav.risks"), "risks", <ShieldAlertIcon />, t("ro:steps", { returnObjects: true })),
    module(t("nav.scope"), "scope", <ScanLineIcon />, t("scope:steps", { returnObjects: true })),
    module(
      t("planning:policyTitle"),
      "policy",
      <CompassIcon />,
      t("planning:policySteps", { returnObjects: true }),
    ),
    module(
      t("planning:processesTitle"),
      "processes",
      <FolderKanbanIcon />,
      t("planning:processSteps", { returnObjects: true }),
    ),
  ];
}

export function AppSidebar({
  user,
  teams,
  activeTeamId,
  activeProject,
  projects = [],
  onSelectTeam,
  onLogout,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: SidebarUser;
  teams: SidebarTeam[];
  activeTeamId?: string | undefined;
  activeProject?: AppSidebarProject | undefined;
  projects?: SidebarProject[] | undefined;
  onSelectTeam: (teamId: string) => void | Promise<void>;
  onLogout: () => void | Promise<void>;
}) {
  const location = useLocation();
  const { t } = useTranslation(["common", "context", "pip", "ro", "scope", "planning", "sheets"]);
  const settingsUrl = activeProject ? `/projects/${activeProject.slug}/settings` : null;

  return (
    <Sidebar collapsible="icon" className="border-slate-800" {...props}>
      <SidebarHeader className="gap-3 border-b border-white/10 p-3">
        <Link
          to="/"
          aria-label={t("homeAria")}
          className="flex h-10 items-center gap-3 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <BrandLogo
            variant="icon"
            className="hidden size-8 shrink-0 object-contain group-data-[collapsible=icon]:block"
          />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <BrandLogo
              variant="dark-background"
              className="h-6 w-auto max-w-32 object-contain object-left rtl:object-right"
            />
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
              {t("workspace")}
            </p>
          </div>
        </Link>
        <TeamSwitcher teams={teams} activeTeamId={activeTeamId} onSelectTeam={onSelectTeam} />
        {activeProject || projects.length > 0 ? (
          <ProjectSwitcher
            projects={
              projects.length > 0
                ? projects
                : activeProject
                  ? [{ id: activeProject.slug, ...activeProject }]
                  : []
            }
            activeProject={
              projects.find((project) => project.slug === activeProject?.slug) ??
              (activeProject ? { id: activeProject.slug, ...activeProject } : undefined)
            }
          />
        ) : null}
      </SidebarHeader>
      <SidebarContent>
        {activeProject ? (
          <>
            <NavMain
              label={t("nav.projectSpace")}
              items={[
                {
                  title: t("nav.chat"),
                  url: `/projects/${activeProject.slug}/chat`,
                  icon: <MessageSquareTextIcon />,
                },
                {
                  title: t("nav.profile"),
                  url: `/projects/${activeProject.slug}/profile`,
                  icon: <UserRoundIcon />,
                },
              ]}
            />
            <div className="mx-5 border-t border-white/10" />
            <NavMain label={t("nav.qualitySystem")} items={projectNav(activeProject.slug, t)} />
            <div className="mx-5 border-t border-white/10" />
            <NavMain
              label={t("sheets:module")}
              items={[
                {
                  title: t("sheets:title"),
                  url: `/projects/${activeProject.slug}/process-sheets`,
                  icon: <FolderKanbanIcon />,
                  children: t("sheets:steps", { returnObjects: true }).map((title, i) => ({
                    title,
                    url: `/projects/${activeProject.slug}/process-sheets?step=${i + 1}`,
                  })),
                },
              ]}
            />
          </>
        ) : (
          <NavMain label={t("nav.navigation")} items={organizationNav(t)} />
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-white/10 p-3">
        {settingsUrl ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={location.pathname === settingsUrl}
                tooltip={t("settings")}
                render={<Link to={settingsUrl} />}
              >
                <SettingsIcon />
                <span>{t("settings")}</span>
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
