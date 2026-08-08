import { createBrowserRouter } from "react-router-dom";

import { AppLayout } from "./layout.js";
import { AuthenticatedRoute, OrganizationRoute, PermissionRoute } from "./route-guards.js";
import { AcceptInvitationPage } from "../features/auth/accept-invitation-page.js";
import { LoginPage } from "../features/auth/login-page.js";
import { DashboardPage } from "../features/dashboard/dashboard-page.js";
import { OrganizationOnboardingPage } from "../features/onboarding/organization-onboarding-page.js";
import { ProjectOnboardingPage } from "../features/onboarding/project-onboarding-page.js";
import { ProjectChatPage } from "../features/projects/project-chat-page.js";
import { ProjectsPage } from "../features/projects/projects-page.js";
import { SitesPage } from "../features/sites/sites-page.js";

function Placeholder({ title }: { title: string }) {
  return <h1 className="text-2xl font-semibold">{title}</h1>;
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/sign-up", element: <LoginPage /> },
  {
    path: "/onboarding/organization",
    element: (
      <AuthenticatedRoute>
        <OrganizationOnboardingPage />
      </AuthenticatedRoute>
    ),
  },
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
      { path: "onboarding/project", element: <ProjectOnboardingPage /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "projects/:projectId/chat", element: <ProjectChatPage /> },
      { path: "projects/:projectId/profile", element: <Placeholder title="Profil du projet" /> },
      {
        path: "projects/:projectId/regulatory-watch",
        element: <Placeholder title="Veille réglementaire" />,
      },
      { path: "projects/:projectId/settings", element: <Placeholder title="Paramètres du projet" /> },
      { path: "team", element: <Placeholder title="Équipe" /> },
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
