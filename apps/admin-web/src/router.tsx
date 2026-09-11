import { createBrowserRouter, Navigate } from "react-router-dom";

import { AdminLayout } from "./admin-layout.js";
import { DashboardPage } from "./dashboard-page.js";
import { ForbiddenPage } from "./forbidden-page.js";
import { LoginPage } from "./login-page.js";
import { AdminRoute, GuestRoute } from "./route-guards.js";
import { DocumentDetailPage } from "./features/documents/document-detail-page.js";
import { DocumentsPage } from "./features/documents/documents-page.js";
import { UploadDocumentPage } from "./features/documents/upload-document-page.js";
import { VersionComparisonPage } from "./features/documents/version-comparison-page.js";
import { NormativeSearchTestingPage } from "./features/normative-search-testing/normative-search-testing-page.js";
import { PlatformUsersPage } from "./features/platform-users/platform-users-page.js";
import { OrganizationDetailPage } from "./features/organizations/organization-detail-page.js";
import { OrganizationsPage } from "./features/organizations/organizations-page.js";
import { ProjectDetailPage } from "./features/organizations/project-detail-page.js";
import { SettingsPage } from "./features/settings/settings-page.js";
import { KnowledgeListPage } from "./features/knowledge/knowledge-list-page.js";
import { KnowledgeEditorPage } from "./features/knowledge/knowledge-editor-page.js";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <GuestRoute>
        <LoginPage />
      </GuestRoute>
    ),
  },
  { path: "/forbidden", element: <ForbiddenPage /> },
  {
    path: "/",
    element: (
      <AdminRoute>
        <AdminLayout />
      </AdminRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "documents", element: <DocumentsPage /> },
      { path: "documents/upload", element: <UploadDocumentPage /> },
      { path: "search-testing", element: <NormativeSearchTestingPage /> },
      { path: "operators", element: <PlatformUsersPage /> },
      { path: "organizations", element: <OrganizationsPage /> },
      { path: "knowledge", element: <Navigate to="/knowledge/discovery" replace /> },
      { path: "knowledge/discovery", element: <KnowledgeListPage feature="DISCOVERY" /> },
      { path: "knowledge/discovery/new", element: <KnowledgeEditorPage feature="DISCOVERY" /> },
      { path: "knowledge/discovery/:id", element: <KnowledgeEditorPage feature="DISCOVERY" /> },
      {
        path: "knowledge/evaluation",
        element: <KnowledgeListPage feature="CONFORMITY_EVALUATION" />,
      },
      {
        path: "knowledge/evaluation/new",
        element: <KnowledgeEditorPage feature="CONFORMITY_EVALUATION" />,
      },
      {
        path: "knowledge/evaluation/:id",
        element: <KnowledgeEditorPage feature="CONFORMITY_EVALUATION" />,
      },
      { path: "organizations/:organizationId", element: <OrganizationDetailPage /> },
      {
        path: "organizations/:organizationId/projects/:projectId",
        element: <ProjectDetailPage />,
      },
      { path: "settings", element: <SettingsPage /> },
      { path: "documents/:documentId", element: <DocumentDetailPage /> },
      {
        path: "documents/:documentId/compare/:beforeId/:afterId",
        element: <VersionComparisonPage />,
      },
    ],
  },
]);
