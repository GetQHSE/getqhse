import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";
import { createBrowserRouter } from "react-router-dom";

import { AppLayout } from "./layout.js";
import { AuthenticatedRoute, OrganizationRoute, PermissionRoute } from "./route-guards.js";
import { AcceptInvitationPage } from "../features/auth/accept-invitation-page.js";
import { LoginPage } from "../features/auth/login-page.js";
import { DashboardPage } from "../features/dashboard/dashboard-page.js";
import { OrganizationOnboardingPage } from "../features/onboarding/organization-onboarding-page.js";
import { ProjectOnboardingPage } from "../features/onboarding/project-onboarding-page.js";
import { ProjectChatPage } from "../features/projects/project-chat-page.js";
import { ProjectProfilePage } from "../features/projects/project-profile-page.js";
import { ProjectsPage } from "../features/projects/projects-page.js";
import { SitesPage } from "../features/sites/sites-page.js";
import { TestAiChatPage } from "../features/ai-chat/test-ai-chat-page.js";
import { TestAiChatPage2 } from "../features/ai-chat/test-ai-chat-page-2.js";
import { TestAiChatPage3 } from "../features/ai-chat/test-ai-chat-page-3.js";
import { ContextPage } from "../features/context/context-page.js";
import { RegulatoryWatchTestPage } from "../features/regulatory-watch/regulatory-watch-test-page.js";
import { RegulatoryWatchPage } from "../features/regulatory-watch/regulatory-watch-page.js";
import { TeamPage } from "../features/organizations/team-page.js";

function Placeholder({ title }: { title: ParseKeys<"common"> }) {
  const { t } = useTranslation();
  return <h1 className="text-2xl font-semibold">{t(title)}</h1>;
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/sign-up", element: <LoginPage /> },
  { path: "/veille-test", element: <RegulatoryWatchTestPage /> },
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
    element: <AcceptInvitationPage />,
  },
  {
    path: "/onboarding/project",
    element: (
      <AuthenticatedRoute>
        <OrganizationRoute>
          <ProjectOnboardingPage />
        </OrganizationRoute>
      </AuthenticatedRoute>
    ),
  },
  {
    path: "/projects/new",
    element: (
      <AuthenticatedRoute>
        <OrganizationRoute>
          <ProjectOnboardingPage mode="create" />
        </OrganizationRoute>
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
      { path: "test-ai-chat", element: <TestAiChatPage /> },
      { path: "test-ai-chat-2", element: <TestAiChatPage2 /> },
      { path: "test-ai-chat-3", element: <TestAiChatPage3 /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "projects/:projectId/chat", element: <ProjectChatPage /> },
      { path: "projects/:projectId/profile", element: <ProjectProfilePage /> },
      { path: "projects/:projectId/context", element: <ContextPage /> },
      {
        path: "projects/:projectId/regulatory-watch",
        element: <RegulatoryWatchPage />,
      },
      {
        path: "projects/:projectId/settings",
        element: <Placeholder title="pages.projectSettings" />,
      },
      { path: "team", element: <TeamPage /> },
      {
        path: "sites",
        element: (
          <PermissionRoute permission="site:read">
            <SitesPage />
          </PermissionRoute>
        ),
      },
      { path: "audits", element: <Placeholder title="pages.audits" /> },
      { path: "evidence", element: <Placeholder title="pages.evidence" /> },
      { path: "notifications", element: <Placeholder title="pages.notifications" /> },
      { path: "forbidden", element: <Placeholder title="pages.forbidden" /> },
    ],
  },
]);
