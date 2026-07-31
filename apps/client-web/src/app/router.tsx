import { createBrowserRouter } from "react-router-dom";

import { AppLayout } from "./layout.js";
import { AuthenticatedRoute, OrganizationRoute, PermissionRoute } from "./route-guards.js";
import { AcceptInvitationPage } from "../features/auth/accept-invitation-page.js";
import { LoginPage } from "../features/auth/login-page.js";
import { DashboardPage } from "../features/dashboard/dashboard-page.js";
import { SitesPage } from "../features/sites/sites-page.js";

function Placeholder({ title }: { title: string }) {
  return <h1 className="text-2xl font-semibold">{title}</h1>;
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/accept-invitation/:invitationId",
    element: (
      <AuthenticatedRoute>
        <AcceptInvitationPage />
      </AuthenticatedRoute>
    ),
  },
  {
    path: "/",
    element: (
      <AuthenticatedRoute>
        <OrganizationRoute>
          <AppLayout />
        </OrganizationRoute>
      </AuthenticatedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      {
        path: "sites",
        element: (
          <PermissionRoute permission="site:read">
            <SitesPage />
          </PermissionRoute>
        ),
      },
      { path: "audits", element: <Placeholder title="Audits" /> },
      { path: "evidence", element: <Placeholder title="Éléments de preuve" /> },
      { path: "notifications", element: <Placeholder title="Notifications" /> },
      { path: "forbidden", element: <Placeholder title="Accès refusé" /> },
    ],
  },
]);
