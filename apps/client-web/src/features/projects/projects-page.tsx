import {
  ArrowRightIcon,
  Building2Icon,
  FolderKanbanIcon,
  MapPinIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";

import { useAuth } from "../../app/auth.js";

const entityLabels: Record<string, string> = {
  COMPANY: "Entreprise",
  SCHOOL: "École",
  UNIVERSITY: "Université",
  INSTITUTION: "Institution",
  ASSOCIATION: "Association",
  PUBLIC_ADMINISTRATION: "Administration publique",
  INDUSTRIAL_SITE: "Site industriel",
  OTHER: "Autre",
};

export function ProjectsPage() {
  const { projects, activeOrganization } = useAuth();
  const [search, setSearch] = useState("");
  const filteredProjects = projects.filter((project) =>
    project.name.toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr")),
  );

  return (
    <section className="mx-auto w-full max-w-[1280px] space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-700">{activeOrganization?.name}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Projets</h1>
          <p className="mt-2 text-sm text-slate-600">
            Chaque projet correspond à un périmètre QHSE distinct.
          </p>
        </div>
        <Link
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800"
          to="/projects/new"
        >
          <PlusIcon className="size-4" /> Nouveau projet
        </Link>
      </header>

      {projects.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <SearchIcon className="size-4 text-slate-400" />
          <input
            aria-label="Rechercher un projet"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="Rechercher un projet…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {projects.length} projet{projects.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="grid min-h-96 place-items-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <div>
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-violet-50 text-violet-700">
              <FolderKanbanIcon className="size-6" />
            </span>
            <h2 className="mt-5 text-lg font-semibold">Créez votre premier projet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">
              Ajoutez l’entreprise, le site ou l’établissement que vous souhaitez accompagner dans
              sa démarche ISO 9001.
            </p>
            <Link
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700"
              to="/projects/new"
            >
              <PlusIcon className="size-4" /> Configurer un projet
            </Link>
          </div>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((project) => (
            <li key={project.id}>
              <Link
                to={`/projects/${project.slug}/chat`}
                aria-label="Ouvrir le chat projet"
                className="group flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-lg hover:shadow-violet-950/5"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-11 place-items-center rounded-2xl bg-violet-50 text-violet-700">
                    {project.entityType === "INDUSTRIAL_SITE" ? (
                      <Building2Icon className="size-5" />
                    ) : (
                      <FolderKanbanIcon className="size-5" />
                    )}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    <span className="size-1.5 rounded-full bg-emerald-500" /> Actif
                  </span>
                </div>
                <h2 className="mt-5 text-lg font-semibold text-slate-950">{project.name}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>{entityLabels[project.entityType] ?? project.entityType}</span>
                  <span className="flex items-center gap-1">
                    <MapPinIcon className="size-3" /> {project.countryCode}
                  </span>
                </div>
                {project.description && (
                  <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-600">
                    {project.description}
                  </p>
                )}
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {project.activities.slice(0, 3).map((activity) => (
                    <span
                      key={activity.id}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600"
                    >
                      {activity.name}
                    </span>
                  ))}
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-5 text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-slate-600">
                    <ShieldCheckIcon className="size-4 text-violet-600" /> ISO 9001
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-violet-700">
                    Ouvrir{" "}
                    <ArrowRightIcon className="size-3.5 transition group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
