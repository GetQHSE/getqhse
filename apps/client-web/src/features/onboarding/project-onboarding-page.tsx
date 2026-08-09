import { zodResolver } from "@hookform/resolvers/zod";
import { createProjectSchema } from "@qhse/contracts";
import { Button } from "@qhse/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Building2Icon, CheckIcon, PlusIcon, SparklesIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import type { z } from "zod";

import { useAuth } from "../../app/auth.js";
import { clientApi } from "../../app/client-api.js";
import { OnboardingShell } from "./onboarding-shell.js";

const suggestions = [
  "Fabrication",
  "Distribution",
  "Import / export",
  "Installation",
  "Maintenance",
  "Conseil",
  "Formation",
  "Éducation",
  "Construction",
  "Logistique",
  "Services numériques",
  "Services de santé",
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

export function ProjectOnboardingPage({ mode = "onboarding" }: { mode?: "onboarding" | "create" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeOrganization } = useAuth();
  const [customActivity, setCustomActivity] = useState("");
  const form = useForm<FormValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { countryCode: "MA", entityType: "COMPANY", activities: [] },
  });
  const selected = form.watch("activities");
  const projectName = form.watch("name");
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
    <OnboardingShell
      currentStep={3}
      eyebrow={mode === "onboarding" ? "Étape 3 sur 3 · Premier projet" : "Nouveau projet"}
      title={
        mode === "onboarding"
          ? "Quel périmètre souhaitez-vous piloter ?"
          : "Créez un nouveau périmètre QHSE"
      }
      description="Décrivez l’entité concernée. Ces premières informations personnaliseront l’assistant et serviront de point de départ au profil projet."
      finalStepLabel={mode === "onboarding" ? "Votre premier projet" : "Nouveau projet"}
      aside={
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Aperçu</p>
          <div className="mt-4 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-violet-100 text-violet-700">
              <Building2Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{projectName || "Votre projet"}</p>
              <p className="truncate text-xs text-slate-500">
                {activeOrganization?.name ?? "Organisation active"}
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Référentiel</span>
              <span className="font-medium">ISO 9001</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Activités</span>
              <span className="font-medium">{selected.length || "—"}</span>
            </div>
          </div>
          <div className="mt-5 rounded-xl bg-violet-50 p-3 text-xs leading-5 text-violet-900">
            <SparklesIcon className="mb-2 size-4 text-violet-600" />
            L’assistant poursuivra ensuite le profil avec des questions adaptées, une par une.
          </div>
        </aside>
      }
    >
      <form
        className="space-y-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <section>
          <h2 className="text-sm font-semibold text-slate-900">Identité du projet</h2>
          <p className="mt-1 text-xs text-slate-500">
            L’entreprise, le site ou l’établissement suivi.
          </p>
          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-medium">Nom de l’entité</span>
            <input
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
              placeholder="Ex. Usine Casablanca"
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <span className="mt-1 block text-sm text-red-700">
                {form.formState.errors.name.message}
              </span>
            )}
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-2 block text-sm font-medium">Type d’entité</span>
              <select
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                {...form.register("entityType")}
              >
                {entityTypes.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-2 block text-sm font-medium">Pays principal</span>
              <select
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
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
        </section>

        <section className="border-t border-slate-100 pt-6">
          <h2 className="text-sm font-semibold text-slate-900">Activités principales</h2>
          <p className="mt-1 text-xs text-slate-500">
            Sélectionnez tout ce qui décrit votre périmètre.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {suggestions.map((name) => {
              const isSelected = selected.some((item) => item.name === name);
              return (
                <button
                  key={name}
                  type="button"
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    isSelected
                      ? "border-violet-300 bg-violet-50 text-violet-800"
                      : "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700"
                  }`}
                  onClick={() => addActivity(name)}
                >
                  {isSelected && <CheckIcon className="size-3" />}
                  {name}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              aria-label="Activité personnalisée"
              className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              placeholder="Ajouter une autre activité"
              value={customActivity}
              onChange={(event) => setCustomActivity(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addActivity(customActivity);
                }
              }}
            />
            <Button type="button" variant="outline" onClick={() => addActivity(customActivity)}>
              <PlusIcon className="size-4" /> Ajouter
            </Button>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {selected.map((activity, index) => (
              <li
                key={activity.name}
                className="inline-flex items-center rounded-full bg-slate-900 py-1 pl-3 pr-1.5 text-xs text-white"
              >
                {activity.name}
                <button
                  type="button"
                  aria-label={`Retirer ${activity.name}`}
                  className="ml-1.5 grid size-5 place-items-center rounded-full text-slate-300 hover:bg-white/10 hover:text-white"
                  onClick={() =>
                    form.setValue(
                      "activities",
                      selected.filter((_, itemIndex) => itemIndex !== index),
                      { shouldValidate: true },
                    )
                  }
                >
                  <XIcon className="size-3" />
                </button>
              </li>
            ))}
          </ul>
          {form.formState.errors.activities && (
            <p className="mt-2 text-sm text-red-700">Sélectionnez au moins une activité</p>
          )}
        </section>

        <details className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Ajouter une description ou un logo (facultatif)
          </summary>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">URL du logo</span>
              <input
                type="url"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                {...form.register("logoUrl")}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Description</span>
              <textarea
                className="min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Contexte, périmètre ou précision utile…"
                {...form.register("description")}
              />
            </label>
          </div>
        </details>

        {form.formState.errors.root && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {form.formState.errors.root.message}
          </p>
        )}
        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="h-11 w-full bg-violet-600 hover:bg-violet-700"
        >
          {form.formState.isSubmitting ? "Création…" : "Créer le projet et ouvrir l’assistant"}
        </Button>
      </form>
    </OnboardingShell>
  );
}
