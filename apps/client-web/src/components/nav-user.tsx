import { Avatar, AvatarFallback } from "@qhse/ui/components/avatar";
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
import { BellIcon, ChevronsUpDownIcon, LogOutIcon, UserIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { LanguageMenu } from "./language-switcher.js";

export type SidebarUser = { name: string; email: string };

function initials(name: string, email: string) {
  return (name || email).slice(0, 2).toUpperCase();
}

export function NavUser({
  user,
  onLogout,
}: {
  user: SidebarUser;
  onLogout: () => void | Promise<void>;
}) {
  const { isMobile } = useSidebar();
  const { t } = useTranslation();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" className="text-slate-300 aria-expanded:bg-white/10" />
            }
          >
            <Avatar>
              <AvatarFallback className="bg-violet-500/20 text-violet-200">
                {initials(user.name, user.email)}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-start text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-slate-500">{user.email}</span>
            </div>
            <ChevronsUpDownIcon className="ms-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-fit"
            side={isMobile ? "bottom" : "inline-end"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
                  <Avatar>
                    <AvatarFallback>{initials(user.name, user.email)}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-start text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link to="/" />}>
                <UserIcon />
                {t("dashboard")}
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link to="/notifications" />}>
                <BellIcon />
                {t("notifications")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <LanguageMenu />
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void onLogout()}>
              <LogOutIcon />
              {t("logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
