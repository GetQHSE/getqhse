import { useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ChevronDownIcon } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "@qhse/ui/components/sidebar";

export type MainNavItem = {
  title: string;
  url: string;
  icon?: ReactNode;
  end?: boolean;
  children?: { title: string; url: string }[];
};

function NavigationItem({ item }: { item: MainNavItem }) {
  const location = useLocation();
  const { state, setOpen } = useSidebar();
  const active = item.end ? location.pathname === item.url : location.pathname.startsWith(item.url);
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const open = expanded ?? active;
  const step = new URLSearchParams(location.search).get("step") ?? "1";
  const style =
    "h-10 text-slate-400 hover:bg-white/[0.06] hover:text-white data-active:bg-violet-500/15 data-active:text-violet-200";
  if (!item.children)
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={active}
          tooltip={item.title}
          className={style}
          render={<NavLink to={item.url} end={item.end ?? false} />}
        >
          {item.icon}
          <span className="whitespace-normal text-start leading-5">{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={item.title}
        className={`${style} h-auto min-h-10 py-2`}
        aria-expanded={open}
        onClick={() => {
          if (state === "collapsed") {
            setOpen(true);
            setExpanded(true);
          } else {
            setExpanded(!open);
          }
        }}
      >
        {item.icon}
        <span className="whitespace-normal text-start leading-5">{item.title}</span>
        <ChevronDownIcon className={`ms-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </SidebarMenuButton>
      {open && (
        <SidebarMenuSub className="border-white/10 group-data-[collapsible=icon]:hidden">
          {item.children.map((child) => (
            <SidebarMenuSubItem key={child.url}>
              <SidebarMenuSubButton
                className="h-auto min-h-8 py-1 text-slate-400 hover:text-white data-active:text-violet-200"
                isActive={
                  active &&
                  (new URLSearchParams(child.url.split("?")[1]).get("step") ?? "1") === step
                }
                aria-current={
                  active &&
                  (new URLSearchParams(child.url.split("?")[1]).get("step") ?? "1") === step
                    ? "step"
                    : undefined
                }
                render={<Link to={child.url} />}
              >
                <span className="whitespace-normal text-clip">{child.title}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}

export function NavMain({ items, label }: { items: MainNavItem[]; label: string }) {
  return (
    <SidebarGroup className="px-3 py-3">
      <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </SidebarGroupLabel>
      <SidebarMenu className="mt-2 gap-1">
        {items.map((item) => (
          <NavigationItem key={item.url} item={item} />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
