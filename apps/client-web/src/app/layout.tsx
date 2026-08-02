import { Bell, Building2, ClipboardCheck, FolderKanban, Gauge } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "./auth.js";

const links = [
  { to: "/", label: "dashboard", icon: Gauge },
  { to: "/projects", label: "projects", icon: FolderKanban },
  { to: "/sites", label: "sites", icon: Building2 },
  { to: "/audits", label: "Audits", icon: ClipboardCheck },
  { to: "/notifications", label: "Notifications", icon: Bell },
];

export function AppLayout() {
  const { t, i18n } = useTranslation();
  const { activeOrganization, organizations, logout, selectOrganization } = useAuth();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <strong className="text-lg text-teal-800">{t("appName")}</strong>
          <div className="flex items-center gap-3">
            <label>
              <span className="sr-only">Organisation active</span>
              <select
                aria-label="Organisation active"
                className="rounded border border-slate-300 px-3 py-1 text-sm"
                value={activeOrganization?.id ?? ""}
                onChange={(event) => void selectOrganization(event.target.value)}
              >
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="rounded border border-slate-300 px-3 py-1 text-sm"
              onClick={() => void i18n.changeLanguage(i18n.language === "ar" ? "fr" : "ar")}
            >
              {i18n.language === "ar" ? "Français" : "العربية"}
            </button>
            <button
              className="rounded border border-slate-300 px-3 py-1 text-sm"
              onClick={() => void logout()}
            >
              Se déconnecter
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-8 md:grid-cols-[14rem_1fr]">
        <nav aria-label="Navigation principale">
          <ul className="space-y-2">
            {links.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 ${
                      isActive ? "bg-teal-50 font-medium text-teal-800" : "text-slate-600"
                    }`
                  }
                >
                  <Icon aria-hidden size={18} />
                  {t(label)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
