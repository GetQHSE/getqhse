import type * as React from "react";
import { Link } from "react-router-dom";

import { NavMain } from "#components/nav-main";
import { NavUser } from "#components/nav-user";
import type { AdminUser } from "../auth.js";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@qhse/ui/components/sidebar";
import { BrandLogo } from "@qhse/ui/components/brand-logo";
import { FilesIcon, LayoutDashboardIcon, UsersRoundIcon } from "lucide-react";

const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/",
      icon: <LayoutDashboardIcon />,
      isActive: true,
    },
    {
      title: "Documents",
      url: "/documents",
      icon: <FilesIcon />,
    },
    {
      title: "Operators",
      url: "/operators",
      icon: <UsersRoundIcon />,
    },
  ],
};

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  user: AdminUser;
  onLogout: () => Promise<void>;
};

export function AppSidebar({ user, onLogout, ...props }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" className="border-slate-800" {...props}>
      <SidebarHeader className="gap-3 border-b border-white/10 p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="h-12 hover:bg-white/[0.06]"
              render={<Link to="/" aria-label="GetQHSE administration home" />}
            >
              <BrandLogo
                variant="icon"
                className="hidden size-8 shrink-0 object-contain group-data-[collapsible=icon]:block"
              />
              <div className="grid flex-1 text-left leading-tight">
                <BrandLogo
                  variant="dark-background"
                  className="h-6 w-auto max-w-32 object-contain object-left"
                />
                <span className="truncate text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  Administration
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter className="border-t border-white/10 p-3">
        <NavUser user={user} onLogout={onLogout} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
