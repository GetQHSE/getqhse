import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "@qhse/ui/styles.css";

import { AdminAuthProvider } from "./auth.js";
import { router } from "./router.js";

const root = document.getElementById("root");
if (!root) throw new Error("Application root was not found");

createRoot(root).render(
  <StrictMode>
    <AdminAuthProvider>
      <RouterProvider router={router} />
    </AdminAuthProvider>
  </StrictMode>,
);
