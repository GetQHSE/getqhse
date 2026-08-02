import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@qhse/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { clientApi } from "../../app/client-api.js";

const activities = [
  "Audit interne",
  "Gestion des incidents",
  "Actions correctives",
  "Suivi réglementaire",
  "Formation sécurité",
  "Gestion documentaire",
] as const;

const schema = z.object({
  name: z.string().min(2, "Le nom du projet est requis"),
  description: z.string().optional(),
  activities: z.array(z.string()).min(1, "Sélectionnez au moins une activité"),
});

type FormValues = z.infer<typeof schema>;

export function ProjectOnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { activities: [] },
  });
  const mutation = useMutation({
    mutationFn: clientApi.createProject,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["client"] });
      await navigate("/projects", { replace: true });
    },
  });

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <form
        aria-labelledby="project-title"
        className="w-full max-w-2xl space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
        onSubmit={(event) => void form.handleSubmit((values) => mutation.mutate(values))(event)}
      >
        <div>
          <p className="text-sm font-medium text-teal-700">Configuration initiale</p>
          <h1 id="project-title" className="mt-2 text-2xl font-semibold text-slate-900">
            Créer votre premier projet
          </h1>
          <p className="mt-2 text-slate-600">
            Choisissez les activités QHSE à suivre. La sélection multiple est accessible au clavier.
          </p>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Nom du projet</span>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2" {...form.register("name")} />
          {form.formState.errors.name && <span className="text-sm text-red-700">{form.formState.errors.name.message}</span>}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Description</span>
          <textarea className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2" {...form.register("description")} />
        </label>
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Activités</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {activities.map((activity) => (
              <label key={activity} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 focus-within:ring-2 focus-within:ring-teal-600">
                <input type="checkbox" value={activity} className="mt-1" {...form.register("activities")} />
                <span>{activity}</span>
              </label>
            ))}
          </div>
          {form.formState.errors.activities && <p className="text-sm text-red-700">{form.formState.errors.activities.message}</p>}
        </fieldset>
        {mutation.isError && <p role="alert" className="text-sm text-red-700">Impossible de créer le projet pour le moment.</p>}
        <Button type="submit" disabled={mutation.isPending} className="w-full">
          Terminer l’onboarding
        </Button>
      </form>
    </main>
  );
}
