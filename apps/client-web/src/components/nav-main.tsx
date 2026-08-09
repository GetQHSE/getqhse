import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@qhse/ui/components/sidebar";

export type MainNavItem = {
  title: string;
  url: string;
  icon?: ReactNode;
  end?: boolean;
};

export function NavMain({ items }: { items: MainNavItem[] }) {
  const location = useLocation();

  return (
    <SidebarGroup className="px-3 py-5">
      <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        Navigation
      </SidebarGroupLabel>
      <SidebarMenu className="mt-2 gap-1">
        {items.map((item) => (
          <SidebarMenuItem key={item.url}>
            <SidebarMenuButton
              isActive={
                item.end ? location.pathname === item.url : location.pathname.startsWith(item.url)
              }
              tooltip={item.title}
              className="h-10 text-slate-400 hover:bg-white/[0.06] hover:text-white data-active:bg-violet-500/15 data-active:text-violet-200"
              render={<NavLink to={item.url} end={item.end ?? false} />}
            >
              {item.icon}
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
