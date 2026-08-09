import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@qhse/ui";
import { useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusinessIcon,
  Building2Icon,
  FolderKanbanIcon,
  Layers3Icon,
  MapPinIcon,
  SparklesIcon,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { authClient } from "../../app/auth.js";
import { OnboardingShell } from "./onboarding-shell.js";

const icons = ["building", "briefcase", "layers", "folder", "sparkles"] as const;
const iconOptions = [
  { value: "building", label: "Entreprise", icon: Building2Icon },
  { value: "briefcase", label: "Cabinet", icon: BriefcaseBusinessIcon },
  { value: "layers", label: "Groupe", icon: Layers3Icon },
  { value: "folder", label: "Portefeuille", icon: FolderKanbanIcon },
  { value: "sparkles", label: "Autre", icon: SparklesIcon },
] as const;
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
  const selectedIcon = form.watch("icon");

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
    <OnboardingShell
      currentStep={2}
      eyebrow="Étape 2 sur 3 · Organisation"
      title="Créez votre espace de travail"
      description="Une organisation rassemble vos collaborateurs et vos projets. Vous pourrez en créer d’autres et passer de l’une à l’autre à tout moment."
      aside={
        <aside className="h-fit rounded-2xl border border-violet-100 bg-violet-50/70 p-5">
          <span className="grid size-9 place-items-center rounded-xl bg-violet-600 text-white">
            <Building2Icon className="size-4" />
          </span>
          <h2 className="mt-4 font-semibold">Pourquoi une organisation ?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Elle définit votre équipe, vos droits d’accès et le périmètre partagé entre plusieurs
            projets.
          </p>
          <div className="mt-5 border-t border-violet-100 pt-4 text-xs leading-5 text-slate-500">
            Exemple : « Groupe Atlas » peut contenir les projets « Usine Casablanca » et « Siège
            Rabat ».
          </div>
        </aside>
      }
    >
      <form
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-800">
            Nom de l’organisation
          </span>
          <input
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
            placeholder="Ex. Groupe Atlas"
            autoFocus
            {...form.register("name")}
          />
          <span className="mt-2 block text-xs text-slate-500">
            Utilisez le nom reconnu par votre équipe. Vous pourrez le modifier plus tard.
          </span>
          {form.formState.errors.name && (
            <span className="mt-1 block text-sm text-red-700">
              {form.formState.errors.name.message}
            </span>
          )}
        </label>

        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-slate-800">Icône de l’espace</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {iconOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = selectedIcon === option.value;
              return (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-xl border p-3 text-center transition ${
                    isSelected
                      ? "border-violet-500 bg-violet-50 text-violet-800 ring-2 ring-violet-100"
                      : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    value={option.value}
                    {...form.register("icon")}
                  />
                  <Icon className="mx-auto size-5" />
                  <span className="mt-2 block truncate text-[11px] font-medium">
                    {option.label}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <MapPinIcon className="size-4 text-slate-400" /> Pays principal
          </span>
          <select
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
            {...form.register("countryCode")}
          >
            <option value="MA">Maroc</option>
            <option value="FR">France</option>
            <option value="DZ">Algérie</option>
            <option value="TN">Tunisie</option>
            <option value="SN">Sénégal</option>
            <option value="CI">Côte d’Ivoire</option>
          </select>
          <span className="mt-2 block text-xs text-slate-500">
            Ce choix aide à préparer la veille réglementaire adaptée.
          </span>
        </label>

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
          {form.formState.isSubmitting ? "Création…" : "Créer et continuer"}
        </Button>
      </form>
    </OnboardingShell>
  );
}
