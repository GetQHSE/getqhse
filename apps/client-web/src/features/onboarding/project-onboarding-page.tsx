import { zodResolver } from "@hookform/resolvers/zod";
import { createProjectSchema } from "@qhse/contracts";
import { Button } from "@qhse/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import type { z } from "zod";

import { clientApi } from "../../app/client-api.js";
import { Onboarding05 } from "../../components/onboarding-05.js";

const suggestions = [
  "Manufacturing",
  "Distribution",
  "Import/export",
  "Installation",
  "Maintenance",
  "Consulting",
  "Training",
  "Education",
  "Construction",
  "Logistics",
  "Software services",
  "Healthcare services",
  "Other",
];
const entityTypes = [
  ["COMPANY", "Entreprise"],
  ["SCHOOL", "École"],
  ["UNIVERSITY", "Université"],
  ["INSTITUTION", "Institution"],
  ["ASSOCIATION", "Association"],
  ["PUBLIC_ADMINISTRATION", "Administration publique"],
  ["INDUSTRIAL_SITE", "Site industriel"],
  ["OTHER", "Autre"],
] as const;

type FormValues = z.input<typeof createProjectSchema>;

export function ProjectOnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [customActivity, setCustomActivity] = useState("");
  const form = useForm<FormValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { countryCode: "MA", entityType: "COMPANY", activities: [] },
  });
  const selected = form.watch("activities");
  const addActivity = (name: string) => {
    const cleaned = name.trim().replace(/\s+/g, " ");
    if (!cleaned || selected.some((item) => item.name.toLowerCase() === cleaned.toLowerCase()))
      return;
    form.setValue("activities", [...selected, { name: cleaned }], { shouldValidate: true });
    setCustomActivity("");
  };

  async function submit(values: FormValues) {
    try {
      const project = await clientApi.createProject(createProjectSchema.parse(values));
      await queryClient.invalidateQueries();
      await navigate(`/projects/${project.slug}/chat`, { replace: true });
    } catch {
      form.setError("root", { message: "Impossible de créer le projet pour le moment." });
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[1fr_22rem]">
      <form
        className="w-full space-y-6 rounded-xl border bg-white p-8 shadow-sm"
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <div>
          <p className="text-sm font-medium text-teal-700">Étape 3 sur 3</p>
          <h1 className="mt-2 text-2xl font-semibold">Créer votre premier projet</h1>
          <p className="mt-2 text-slate-600">
            Un projet représente la vraie entreprise, école, institution ou entité qui suivra le
            processus ISO 9001.
          </p>
          <p className="mt-2 text-sm">
            <strong>Espace de travail actif</strong> : le projet métier sera créé séparément dans
            cet espace.
          </p>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Nom de l’entreprise ou de l’établissement
          </span>
          <input className="w-full rounded-md border px-3 py-2" {...form.register("name")} />
          {form.formState.errors.name && (
            <span className="text-sm text-red-700">{form.formState.errors.name.message}</span>
          )}
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-sm font-medium">Type d’entité</span>
            <select className="w-full rounded-md border px-3 py-2" {...form.register("entityType")}>
              {entityTypes.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Pays principal</span>
            <select
              className="w-full rounded-md border px-3 py-2"
              {...form.register("countryCode")}
            >
              <option value="MA">Maroc</option>
              <option value="FR">France</option>
              <option value="DZ">Algérie</option>
              <option value="TN">Tunisie</option>
              <option value="SN">Sénégal</option>
              <option value="CI">Côte d’Ivoire</option>
            </select>
          </label>
        </div>
        <div>
          <span className="mb-2 block text-sm font-medium">Activités</span>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((name) => (
              <button
                key={name}
                type="button"
                className="rounded-full border px-3 py-1 text-sm"
                onClick={() => addActivity(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              aria-label="Activité personnalisée"
              className="flex-1 rounded-md border px-3 py-2"
              value={customActivity}
              onChange={(event) => setCustomActivity(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addActivity(customActivity);
                }
              }}
            />
            <Button type="button" onClick={() => addActivity(customActivity)}>
              Ajouter
            </Button>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {selected.map((activity, index) => (
              <li key={activity.name} className="rounded-full bg-teal-50 px-3 py-1 text-sm">
                {activity.name}
                <button
                  type="button"
                  aria-label={`Retirer ${activity.name}`}
                  className="ml-2"
                  onClick={() =>
                    form.setValue(
                      "activities",
                      selected.filter((_, itemIndex) => itemIndex !== index),
                      { shouldValidate: true },
                    )
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          {form.formState.errors.activities && (
            <p className="text-sm text-red-700">Sélectionnez au moins une activité</p>
          )}
        </div>
        <div>
          <span className="text-sm font-medium">Référentiel</span>
          <p className="mt-1 inline-block rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-800">
            ISO 9001
          </p>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">URL du logo (facultatif)</span>
          <input
            type="url"
            className="w-full rounded-md border px-3 py-2"
            {...form.register("logoUrl")}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Description</span>
          <textarea
            className="min-h-24 w-full rounded-md border px-3 py-2"
            {...form.register("description")}
          />
        </label>
        {form.formState.errors.root && (
          <p role="alert" className="text-sm text-red-700">
            {form.formState.errors.root.message}
          </p>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
          {form.formState.isSubmitting ? "Création…" : "Créer le projet"}
        </Button>
      </form>
      <Onboarding05
        title="Résumé du projet"
        description="Les données saisies alimentent directement l’API projet existante."
        steps={[
          { id: "name", type: "created", description: "renseigne l’identité de l’entité", user: { name: "Projet", initial: "P", bgColor: "bg-teal-600" }, activityTime: "Requis" },
          { id: "activities", type: "in progress", description: "décrit les activités métier", user: { name: "Activités", initial: "A", bgColor: "bg-emerald-600" }, activityTime: "À compléter" },
          { id: "standard", type: "created", description: "prépare le référentiel ISO 9001", user: { name: "QHSE", initial: "Q", bgColor: "bg-sky-600" }, activityTime: "Automatique" },
        ]}
      />
      </div>
    </main>
  );
}
