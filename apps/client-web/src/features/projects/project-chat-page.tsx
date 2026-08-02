import { Link, useParams } from "react-router-dom";

import { useAuth } from "../../app/auth.js";

export function ProjectChatPage() {
  const { projectId } = useParams();
  const { projects } = useAuth();
  const project = projects.find((item) => item.id === projectId || item.slug === projectId);

  return (
    <section className="space-y-6">
      <Link className="text-sm font-medium text-teal-700 underline" to="/projects">
        Retour aux projets
      </Link>
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-teal-700">Chat projet protégé</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          {project ? project.name : "Projet"}
        </h1>
        <div className="mt-3 flex gap-2">
          <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-800">
            ISO 9001
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">
            {project?.status ?? "EMPTY"}
          </span>
        </div>
        <p className="mt-3 text-slate-600">
          Cet espace de discussion sera connecté aux données du projet. Le placeholder est protégé
          par session, onboarding et organisation active.
        </p>
        <div className="mt-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-600" role="status">
          Le chat QHSE sera disponible prochainement.
        </div>
      </div>
    </section>
  );
}
