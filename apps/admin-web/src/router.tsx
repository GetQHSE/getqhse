import { createBrowserRouter } from "react-router-dom";

import { AdminLayout } from "./admin-layout.js";
import { DashboardPage } from "./dashboard-page.js";
import { ForbiddenPage } from "./forbidden-page.js";
import { LoginPage } from "./login-page.js";
import { AdminRoute, GuestRoute } from "./route-guards.js";

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
    children: [{ index: true, element: <DashboardPage /> }],
  },
]);
