import { createBrowserRouter } from "react-router-dom";

import { AdminLayout } from "./admin-layout.js";
import { DashboardPage } from "./dashboard-page.js";
import { ForbiddenPage } from "./forbidden-page.js";
import { LoginPage } from "./login-page.js";
import { AdminRoute, GuestRoute } from "./route-guards.js";
import { DocumentDetailPage } from "./features/documents/document-detail-page.js";
import { DocumentsPage } from "./features/documents/documents-page.js";
import { UploadDocumentPage } from "./features/documents/upload-document-page.js";
import { VersionComparisonPage } from "./features/documents/version-comparison-page.js";
import { PlatformUsersPage } from "./features/platform-users/platform-users-page.js";

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
      { path: "operators", element: <PlatformUsersPage /> },
      { path: "documents/:documentId", element: <DocumentDetailPage /> },
      {
        path: "documents/:documentId/compare/:beforeId/:afterId",
        element: <VersionComparisonPage />,
      },
    ],
  },
]);
