import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@qhse/ui/components/breadcrumb";
import { Separator } from "@qhse/ui/components/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@qhse/ui/components/sidebar";
import { Outlet } from "react-router-dom";

import { useAdminAuth } from "./auth.js";
import { AppSidebar } from "./components/app-sidebar.js";

export function AdminLayout() {
  const { user, logout } = useAdminAuth();
  if (!user) return null;

  return (
    <SidebarProvider>
      <AppSidebar user={user} onLogout={logout} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator className="mr-2 h-4" orientation="vertical" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Platform administration</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
