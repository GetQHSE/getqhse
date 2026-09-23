import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@qhse/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@qhse/ui/components/sidebar";
import { Building2Icon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export type SidebarTeam = { id: string; name: string; slug: string };

export function TeamSwitcher({
  teams,
  activeTeamId,
  onSelectTeam,
}: {
  teams: SidebarTeam[];
  activeTeamId?: string | undefined;
  onSelectTeam: (teamId: string) => void | Promise<void>;
}) {
  const { isMobile } = useSidebar();
  const { t } = useTranslation();
  const activeTeam = React.useMemo(
    () => teams.find((team) => team.id === activeTeamId) ?? teams[0],
    [activeTeamId, teams],
  );
  if (!activeTeam) return null;
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="border border-white/10 bg-white/[0.04] data-open:bg-white/10 data-open:text-white"
              />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-300">
              <Building2Icon className="size-4" />
            </div>
            <div className="grid flex-1 text-start text-sm leading-tight">
              <span className="truncate font-medium">{activeTeam.name}</span>
              <span className="truncate text-xs text-slate-400">{t("nav.activeOrganization")}</span>
            </div>
            <ChevronsUpDownIcon className="ms-auto size-4 text-slate-500" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-fit"
            align="start"
            side={isMobile ? "bottom" : "inline-end"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t("nav.organizations")}
              </DropdownMenuLabel>
              {teams.map((team) => (
                <DropdownMenuItem
                  key={team.id}
                  onClick={() => void onSelectTeam(team.id)}
                  className="gap-2 p-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-md border">
                    <Building2Icon className="size-4" />
                  </div>
                  {team.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2" render={<Link to="/onboarding/organization" />}>
              <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                <PlusIcon className="size-4" />
              </div>
              <span className="font-medium text-muted-foreground">{t("nav.newOrganization")}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
