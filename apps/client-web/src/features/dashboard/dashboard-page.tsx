import {
  ArrowRightIcon,
  CheckCircle2Icon,
  FileSearchIcon,
  FolderKanbanIcon,
  MessageSquareTextIcon,
  PlusIcon,
  ScaleIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useAuth } from "../../app/auth.js";

export function DashboardPage() {
  const { activeOrganization, projects, user } = useAuth();
  const { t } = useTranslation("workspace");
  const displayName = user?.email.split("@")[0] ?? t("dashboard.greetingFallback");
  const firstProject = projects[0];

  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-700">{activeOrganization?.name}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {t("dashboard.greeting", { name: displayName })}
          </h1>
          <p className="mt-2 text-sm text-slate-600">{t("dashboard.subtitle")}</p>
        </div>
        <Link
          to="/projects/new"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          <PlusIcon className="size-4" /> {t("dashboard.newProject")}
        </Link>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)]">
        <article className="relative overflow-hidden rounded-3xl bg-[#0a0e18] p-6 text-white shadow-sm sm:p-8">
          <div className="absolute -end-16 -top-20 size-72 rounded-full bg-violet-600/25 blur-3xl" />
          <div className="absolute bottom-0 end-1/4 size-40 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1.5 text-xs font-medium text-violet-200">
              <SparklesIcon className="size-3.5" /> {t("dashboard.assistant")}
            </span>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
              {firstProject
                ? t("dashboard.continueProfile", { project: firstProject.name })
                : t("dashboard.createFirst")}
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-slate-400">
              {firstProject ? t("dashboard.continueBody") : t("dashboard.createBody")}
            </p>
            <Link
              to={firstProject ? `/projects/${firstProject.slug}/chat` : "/projects/new"}
              className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white transition hover:bg-violet-500"
            >
              {firstProject ? t("dashboard.resume") : t("dashboard.setUp")}
              <ArrowRightIcon className="size-4 rtl:rotate-180" />
            </Link>
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            {t("dashboard.yourSpace")}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-violet-50 p-4">
              <FolderKanbanIcon className="size-5 text-violet-700" />
              <p className="mt-4 text-2xl font-semibold">{projects.length}</p>
              <p className="mt-1 text-xs text-slate-600">
                {t("dashboard.projects", { count: projects.length })}
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4">
              <UsersIcon className="size-5 text-emerald-700" />
              <p className="mt-4 text-2xl font-semibold">1</p>
              <p className="mt-1 text-xs text-slate-600">{t("dashboard.organization")}</p>
            </div>
          </div>
          <div className="mt-5 flex items-start gap-3 border-t border-slate-100 pt-5">
            <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            <p className="text-xs leading-5 text-slate-600">{t("dashboard.configured")}</p>
          </div>
        </article>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">{t("dashboard.yourProjects")}</h2>
              <p className="mt-1 text-xs text-slate-500">{t("dashboard.yourProjectsHelp")}</p>
            </div>
            <Link
              to="/projects"
              className="text-xs font-semibold text-violet-700 hover:text-violet-900"
            >
              {t("dashboard.viewAll")}
            </Link>
          </div>
          {projects.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-7 text-center">
              <FolderKanbanIcon className="mx-auto size-6 text-slate-400" />
              <p className="mt-3 text-sm font-medium">{t("dashboard.noProjects")}</p>
              <p className="mt-1 text-xs text-slate-500">{t("dashboard.noProjectsHelp")}</p>
            </div>
          ) : (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {projects.slice(0, 4).map((project) => (
                <li key={project.id}>
                  <Link
                    to={`/projects/${project.slug}/chat`}
                    className="group flex items-center gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-violet-200 hover:bg-violet-50/40"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 group-hover:bg-violet-100 group-hover:text-violet-700">
                      <FolderKanbanIcon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{project.name}</span>
                      <span className="mt-1 block truncate text-xs text-slate-500">
                        {project.activities
                          .slice(0, 2)
                          .map((activity) => activity.name)
                          .join(" · ") || "ISO 9001"}
                      </span>
                    </span>
                    <ArrowRightIcon className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-600 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold">{t("dashboard.modules")}</h2>
          <p className="mt-1 text-xs text-slate-500">{t("dashboard.modulesHelp")}</p>
          <div className="mt-5 space-y-2">
            {[
              {
                icon: MessageSquareTextIcon,
                label: t("dashboard.moduleProfile"),
                status: t("dashboard.available"),
                color: "text-violet-700 bg-violet-50",
              },
              {
                icon: ScaleIcon,
                label: t("dashboard.moduleWatch"),
                status: t("dashboard.comingSoon"),
                color: "text-blue-700 bg-blue-50",
              },
              {
                icon: FileSearchIcon,
                label: t("dashboard.moduleAudits"),
                status: t("dashboard.comingSoon"),
                color: "text-emerald-700 bg-emerald-50",
              },
            ].map((module) => (
              <div
                key={module.label}
                className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-slate-50"
              >
                <span className={`grid size-9 place-items-center rounded-xl ${module.color}`}>
                  <module.icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{module.label}</p>
                  <p className="text-[11px] text-slate-500">{module.status}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
