import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@qhse/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { authClient } from "../../app/auth.js";

const icons = ["building", "briefcase", "layers", "folder", "sparkles"] as const;
const schema = z.object({
  name: z.string().trim().min(2, "Le nom de l’espace est requis").max(160),
  icon: z.enum(icons),
  countryCode: z.enum(["MA", "FR", "DZ", "TN", "SN", "CI"]),
});
type FormValues = z.infer<typeof schema>;

function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "espace"
  );
}

export function OrganizationOnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { icon: "building", countryCode: "MA" },
  });

  async function submit(values: FormValues) {
    const baseSlug = slugify(values.name);
    const result = await authClient.organization.create({
      name: values.name.trim(),
      slug: `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`,
      icon: values.icon,
      countryCode: values.countryCode,
      status: "active",
      locale: "fr-MA",
      timezone: "Africa/Casablanca",
    });
    if (result.error || !result.data) {
      form.setError("root", { message: result.error?.message ?? "Création impossible" });
      return;
    }
    const active = await authClient.organization.setActive({ organizationId: result.data.id });
    if (active.error) {
      form.setError("root", { message: active.error.message ?? "Activation impossible" });
      return;
    }
    await queryClient.invalidateQueries();
    await navigate("/onboarding/project", { replace: true });
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <form
        className="w-full max-w-xl space-y-6 rounded-xl border bg-white p-8 shadow-sm"
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <div>
          <p className="text-sm font-medium text-teal-700">Étape 2 sur 3</p>
          <h1 className="mt-2 text-2xl font-semibold">Créer votre espace</h1>
          <p className="mt-2 text-slate-600">
            Votre espace regroupe vos utilisateurs et vos projets. Il ne représente pas
            nécessairement votre entreprise.
          </p>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Nom de l’espace</span>
          <input className="w-full rounded-md border px-3 py-2" {...form.register("name")} />
          {form.formState.errors.name && (
            <span className="text-sm text-red-700">{form.formState.errors.name.message}</span>
          )}
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Icône</legend>
          <div className="flex flex-wrap gap-2">
            {icons.map((icon) => (
              <label key={icon} className="rounded-md border px-3 py-2">
                <input className="mr-2" type="radio" value={icon} {...form.register("icon")} />
                {icon}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Pays</span>
          <select className="w-full rounded-md border px-3 py-2" {...form.register("countryCode")}>
            <option value="MA">Maroc</option>
            <option value="FR">France</option>
            <option value="DZ">Algérie</option>
            <option value="TN">Tunisie</option>
            <option value="SN">Sénégal</option>
            <option value="CI">Côte d’Ivoire</option>
          </select>
        </label>
        {form.formState.errors.root && (
          <p role="alert" className="text-sm text-red-700">
            {form.formState.errors.root.message}
          </p>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
          {form.formState.isSubmitting ? "Création…" : "Continuer"}
        </Button>
      </form>
    </main>
  );
}
