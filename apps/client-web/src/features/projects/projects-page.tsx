import { Link } from "react-router-dom";

import { useAuth } from "../../app/auth.js";

export function ProjectsPage() {
  const { projects, activeOrganization } = useAuth();

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-teal-700">{activeOrganization?.name}</p>
        <h1 className="text-2xl font-semibold text-slate-900">Projets</h1>
        <p className="mt-2 text-slate-600">Sélectionnez un projet pour accéder à son espace QHSE.</p>
      </div>
      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="font-semibold">Aucun projet disponible</h2>
          <p className="mt-2 text-sm text-slate-600">Créez un premier projet depuis l’onboarding.</p>
          <Link className="mt-4 inline-flex rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white" to="/onboarding/project">
            Configurer un projet
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <li key={project.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">{project.name}</h2>
              {project.description && <p className="mt-2 text-sm text-slate-600">{project.description}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {project.activities.map((activity) => (
                  <span key={activity} className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800">
                    {activity}
                  </span>
                ))}
              </div>
              <Link className="mt-5 inline-flex text-sm font-medium text-teal-700 underline" to={`/projects/${project.id}/chat`}>
                Ouvrir le chat projet
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
