import type * as React from "react";
import { Link } from "react-router-dom";

import { NavMain } from "#components/nav-main";
import { NavProjects } from "#components/nav-projects";
import { NavSecondary } from "#components/nav-secondary";
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
} from "@qhse/ui/components/sidebar";
import {
  BookOpenIcon,
  BotIcon,
  FileCheck2Icon,
  FilesIcon,
  FrameIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  SendIcon,
  Settings2Icon,
  ShieldCheckIcon,
} from "lucide-react";

const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/",
      icon: <LayoutDashboardIcon />,
      isActive: true,
    },
    {
      title: "Normative content",
      url: "#",
      icon: <BookOpenIcon />,
      items: [
        {
          title: "Sources",
          url: "#",
        },
        {
          title: "Documents",
          url: "#",
        },
        {
          title: "Versions",
          url: "#",
        },
      ],
    },
    {
      title: "Processing",
      url: "#",
      icon: <BotIcon />,
      items: [
        {
          title: "Review queue",
          url: "#",
        },
        {
          title: "Publications",
          url: "#",
        },
      ],
    },
    {
      title: "Settings",
      url: "#",
      icon: <Settings2Icon />,
      items: [
        {
          title: "Entitlements",
          url: "#",
        },
        {
          title: "Licensing",
          url: "#",
        },
      ],
    },
  ],
  navSecondary: [
    {
      title: "Support",
      url: "#",
      icon: <LifeBuoyIcon />,
    },
    {
      title: "Feedback",
      url: "#",
      icon: <SendIcon />,
    },
  ],
  projects: [
    {
      name: "Source library",
      url: "#",
      icon: <FilesIcon />,
    },
    {
      name: "Review workspace",
      url: "#",
      icon: <FileCheck2Icon />,
    },
    {
      name: "Search testing",
      url: "#",
      icon: <FrameIcon />,
    },
  ],
};

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  user: AdminUser;
  onLogout: () => Promise<void>;
};

export function AppSidebar({ user, onLogout, ...props }: AppSidebarProps) {
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <ShieldCheckIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">QHSE Platform</span>
                <span className="truncate text-xs">Administration</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} onLogout={onLogout} />
      </SidebarFooter>
    </Sidebar>
  );
}
