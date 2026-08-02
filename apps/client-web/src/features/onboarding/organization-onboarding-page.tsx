import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@qhse/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { clientApi } from "../../app/client-api.js";

const schema = z.object({
  name: z.string().min(2, "Le nom est requis"),
  slug: z
    .string()
    .min(2, "Le slug est requis")
    .regex(/^[a-z0-9-]+$/, "Utilisez uniquement minuscules, chiffres et tirets"),
});

type FormValues = z.infer<typeof schema>;

export function OrganizationOnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const mutation = useMutation({
    mutationFn: clientApi.createOrganization,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["client"] });
      await navigate("/onboarding/project", { replace: true });
    },
  });

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <form
        aria-labelledby="organization-title"
        className="w-full max-w-xl space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
        onSubmit={(event) => void form.handleSubmit((values) => mutation.mutate(values))(event)}
      >
        <div>
          <p className="text-sm font-medium text-teal-700">Bienvenue</p>
          <h1 id="organization-title" className="mt-2 text-2xl font-semibold text-slate-900">
            Créer votre organisation
          </h1>
          <p className="mt-2 text-slate-600">
            Renseignez l’entité qui portera vos projets QHSE et vos activités.
          </p>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Nom de l’organisation</span>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2" {...form.register("name")} />
          {form.formState.errors.name && <span className="text-sm text-red-700">{form.formState.errors.name.message}</span>}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Identifiant public</span>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="mon-organisation" {...form.register("slug")} />
          {form.formState.errors.slug && <span className="text-sm text-red-700">{form.formState.errors.slug.message}</span>}
        </label>
        {mutation.isError && <p role="alert" className="text-sm text-red-700">Impossible de créer l’organisation pour le moment.</p>}
        <Button type="submit" disabled={mutation.isPending} className="w-full">
          Continuer vers le projet
        </Button>
      </form>
    </main>
  );
}
