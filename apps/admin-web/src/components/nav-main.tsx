import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@qhse/ui/components/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@qhse/ui/components/sidebar";
import { ChevronRightIcon } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

export function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon: React.ReactNode;
    isActive?: boolean;
    items?: {
      title: string;
      url: string;
    }[];
  }[];
}) {
  const location = useLocation();

  return (
    <SidebarGroup className="px-3 py-5">
      <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        Navigation
      </SidebarGroupLabel>
      <SidebarMenu className="mt-2 gap-1">
        {items.map((item) => (
          <Collapsible
            key={item.title}
            defaultOpen={item.isActive || location.pathname.startsWith(item.url)}
            render={<SidebarMenuItem />}
          >
            <SidebarMenuButton
              tooltip={item.title}
              isActive={
                item.url === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(item.url)
              }
              className="h-10 text-slate-400 hover:bg-white/[0.06] hover:text-white data-active:bg-violet-500/15 data-active:text-violet-200"
              render={<NavLink to={item.url} end={item.url === "/"} />}
            >
              {item.icon}
              <span>{item.title}</span>
            </SidebarMenuButton>
            {item.items?.length ? (
              <>
                <CollapsibleTrigger
                  render={<SidebarMenuAction className="aria-expanded:rotate-90" />}
                >
                  <ChevronRightIcon />
                  <span className="sr-only">Toggle</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items?.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton render={<NavLink to={subItem.url} />}>
                          <span>{subItem.title}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </>
            ) : null}
          </Collapsible>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
