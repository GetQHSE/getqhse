import { useState } from "react";

import type { AdminUser } from "../auth.js";
import { Avatar, AvatarFallback, AvatarImage } from "@qhse/ui/components/avatar";
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
import { BadgeCheckIcon, ChevronsUpDownIcon, LogOutIcon } from "lucide-react";

function initials(user: AdminUser) {
  const source = user.name.trim() || user.email;
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function roleLabel(role: AdminUser["platformRole"]) {
  return role.replaceAll("_", " ");
}

export function NavUser({ user, onLogout }: { user: AdminUser; onLogout: () => Promise<void> }) {
  const { isMobile } = useSidebar();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function handleLogout() {
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      await onLogout();
    } catch {
      setSignOutError("Unable to sign out. Please try again.");
      setIsSigningOut(false);
    }
  }

  const userInitials = initials(user);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="text-slate-300 hover:bg-white/[0.06] hover:text-white aria-expanded:bg-white/[0.08]"
              />
            }
          >
            <Avatar className="border border-white/10">
              {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
              <AvatarFallback>{userInitials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-slate-500">{user.email}</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar>
                    {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
                    <AvatarFallback>{userInitials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <BadgeCheckIcon />
              <span className="capitalize">{roleLabel(user.platformRole)}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={isSigningOut} onClick={() => void handleLogout()}>
              <LogOutIcon />
              {isSigningOut ? "Signing out…" : "Log out"}
            </DropdownMenuItem>
            {signOutError ? (
              <p className="px-2 py-1 text-xs text-destructive" role="alert">
                {signOutError}
              </p>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
