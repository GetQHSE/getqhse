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
    <SidebarGroup>
      <SidebarGroupLabel>Plateforme</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.url}>
            <SidebarMenuButton
              isActive={
                item.end ? location.pathname === item.url : location.pathname.startsWith(item.url)
              }
              tooltip={item.title}
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
