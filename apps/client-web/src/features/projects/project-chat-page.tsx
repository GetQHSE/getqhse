import { Link, useParams } from "react-router-dom";

import { useAuth } from "../../app/auth.js";

export function ProjectChatPage() {
  const { projectId } = useParams();
  const { projects } = useAuth();
  const project = projects.find((item) => item.id === projectId);

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
        <p className="mt-3 text-slate-600">
          Cet espace de discussion sera connecté aux données du projet. Le placeholder est protégé par session, onboarding et organisation active.
        </p>
        <div className="mt-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-600" role="status">
          Le chat QHSE sera disponible prochainement.
        </div>
      </div>
    </section>
  );
}
