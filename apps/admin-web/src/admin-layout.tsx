import { SidebarInset, SidebarProvider, SidebarTrigger } from "@qhse/ui/components/sidebar";
import { ChevronRightIcon, ShieldCheckIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { useAdminAuth } from "./auth.js";
import { AppSidebar } from "./components/app-sidebar.js";

export function AdminLayout() {
  const { user, logout } = useAdminAuth();
  const location = useLocation();
  if (!user) return null;

  const section = location.pathname.startsWith("/documents")
    ? "Documents"
    : location.pathname.startsWith("/operators")
      ? "Platform operators"
      : "Overview";

  return (
    <SidebarProvider
      style={
        {
          "--sidebar": "#080c16",
          "--sidebar-foreground": "#f3f5f9",
          "--sidebar-accent": "#151827",
          "--sidebar-accent-foreground": "#ffffff",
          "--sidebar-border": "#202536",
          "--sidebar-primary": "#7c3aed",
          "--sidebar-primary-foreground": "#ffffff",
        } as CSSProperties
      }
    >
      <AppSidebar user={user} onLogout={logout} />
      <SidebarInset className="min-w-0 bg-[#f6f6f8]">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <SidebarTrigger className="text-slate-500" />
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Link
              to="/"
              className="hidden truncate font-medium text-slate-500 transition hover:text-slate-900 sm:block"
            >
              Platform administration
            </Link>
            <ChevronRightIcon className="hidden size-4 shrink-0 text-slate-300 sm:block" />
            <span className="truncate font-semibold text-slate-900">{section}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 sm:inline-flex">
              <span className="size-1.5 rounded-full bg-emerald-500" /> System operational
            </span>
            <span className="grid size-9 place-items-center rounded-xl bg-violet-50 text-violet-700">
              <ShieldCheckIcon className="size-4" />
            </span>
          </div>
        </header>
        <main className="min-w-0 flex-1 bg-[#f6f6f8] p-4 text-slate-900 sm:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
