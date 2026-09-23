import { zodResolver } from "@hookform/resolvers/zod";
import { createProjectSchema, supportedLanguages } from "@qhse/contracts";
import { Button } from "@qhse/ui";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@qhse/ui/components/combobox";
import { MAX_PROJECT_COUNTRIES } from "@qhse/domain/countries";
import { useQueryClient } from "@tanstack/react-query";
import { Building2Icon, PlusIcon, SparklesIcon, UploadIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import type { z } from "zod";

import { useAuth } from "../../app/auth.js";
import { clientApi } from "../../app/client-api.js";
import { currentLanguage } from "../../app/i18n.js";
import { CountryMultiSelect } from "../../components/country-multi-select.js";
import { OnboardingShell } from "./onboarding-shell.js";

const suggestionKeys = [
  "manufacturing",
  "distribution",
  "importExport",
  "installation",
  "maintenance",
  "consulting",
  "training",
  "education",
  "construction",
  "logistics",
  "digital",
  "health",
] as const;
const entityTypes = [
  "COMPANY",
  "SCHOOL",
  "UNIVERSITY",
  "INSTITUTION",
  "ASSOCIATION",
  "PUBLIC_ADMINISTRATION",
  "INDUSTRIAL_SITE",
  "OTHER",
] as const;

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

type FormValues = z.input<typeof createProjectSchema>;

function readFileAsDataUrl(file: File, failure: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(failure));
    reader.readAsDataURL(file);
  });
}

export function ProjectOnboardingPage({ mode = "onboarding" }: { mode?: "onboarding" | "create" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeOrganization } = useAuth();
  const { t, i18n } = useTranslation("onboarding");
  const suggestions = useMemo(
    () => suggestionKeys.map((key) => t(`project.suggestions.${key}`)),
    [t, i18n.language],
  );
  const [activityQuery, setActivityQuery] = useState("");
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoDragActive, setLogoDragActive] = useState(false);
  const activityAnchor = useComboboxAnchor();
  const form = useForm<FormValues>({
    resolver: zodResolver(createProjectSchema),
    // No default country: the user chooses every country the project covers.
    // The project language defaults to the interface language but is chosen explicitly.
    defaultValues: {
      countryCodes: [],
      entityType: "COMPANY",
      activities: [],
      language: currentLanguage(),
    },
  });
  const selected = form.watch("activities");
  const countryCodes = form.watch("countryCodes");
  const projectName = form.watch("name");
  // `logoUrl` is wrapped in `z.preprocess`, so its zod *input* type is
  // `unknown`; the resolver's output type is always `string | null | undefined`.
  const logoUrl = form.watch("logoUrl") as string | null | undefined;
  const addActivity = (name: string) => {
    const cleaned = name.trim().replace(/\s+/g, " ");
    if (!cleaned || selected.some((item) => item.name.toLowerCase() === cleaned.toLowerCase()))
      return;
    form.setValue("activities", [...selected, { name: cleaned }], { shouldValidate: true });
    setActivityQuery("");
  };
  const availableSuggestions = suggestions.filter(
    (name) => !selected.some((item) => item.name.toLowerCase() === name.toLowerCase()),
  );
  const normalizedQuery = activityQuery.trim().toLowerCase();
  const hasMatchingSuggestion = availableSuggestions.some((name) =>
    name.toLowerCase().includes(normalizedQuery),
  );
  const canCreateActivity = normalizedQuery.length > 0 && !hasMatchingSuggestion;

  async function handleLogoFile(file: File | undefined) {
    setLogoError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError(t("project.notAnImage"));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(t("project.imageTooLarge"));
      return;
    }
    const dataUrl = await readFileAsDataUrl(file, t("project.readFailed"));
    form.setValue("logoUrl", dataUrl, { shouldValidate: true });
  }

  async function submit(values: FormValues) {
    try {
      const project = await clientApi.createProject(createProjectSchema.parse(values));
      await queryClient.invalidateQueries();
      await navigate(`/projects/${project.slug}/chat`, { replace: true });
    } catch {
      form.setError("root", { message: t("project.createFailed") });
    }
  }

  return (
    <OnboardingShell
      currentStep={3}
      eyebrow={mode === "onboarding" ? t("project.eyebrowOnboarding") : t("project.eyebrowCreate")}
      title={mode === "onboarding" ? t("project.titleOnboarding") : t("project.titleCreate")}
      description={t("project.description")}
      finalStepLabel={mode === "onboarding" ? undefined : t("project.finalStepCreate")}
      aside={
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            {t("project.preview")}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-violet-100 text-violet-700">
              <Building2Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{projectName || t("project.yourProject")}</p>
              <p className="truncate text-xs text-slate-500">
                {activeOrganization?.name ?? t("project.activeOrganization")}
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">{t("project.standard")}</span>
              <span className="font-medium">ISO 9001</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">{t("project.activities")}</span>
              <span className="font-medium">{selected.length || "—"}</span>
            </div>
          </div>
          <div className="mt-5 rounded-xl bg-violet-50 p-3 text-xs leading-5 text-violet-900">
            <SparklesIcon className="mb-2 size-4 text-violet-600" />
            {t("project.previewHint")}
          </div>
        </aside>
      }
    >
      <form
        className="space-y-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <section>
          <h2 className="text-sm font-semibold text-slate-900">{t("project.identity")}</h2>
          <p className="mt-1 text-xs text-slate-500">{t("project.identityHelp")}</p>
          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-medium">{t("project.entityName")}</span>
            <input
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
              placeholder={t("project.entityNamePlaceholder")}
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <span className="mt-1 block text-sm text-red-700">
                {form.formState.errors.name.message}
              </span>
            )}
          </label>
          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-medium">{t("project.entityType")}</span>
            <select
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              {...form.register("entityType")}
            >
              {entityTypes.map((value) => (
                <option key={value} value={value}>
                  {t(`entityTypes.${value}`, { ns: "common" })}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-medium">{t("project.language")}</span>
            <select
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              {...form.register("language")}
            >
              {supportedLanguages.map((value) => (
                <option key={value} value={value}>
                  {t(`projectLanguage.${value}`, { ns: "common" })}
                </option>
              ))}
            </select>
            <span className="mt-1.5 block text-xs text-slate-500">{t("project.languageHelp")}</span>
          </label>
        </section>

        <section className="border-t border-slate-100 pt-6">
          <h2 className="text-sm font-semibold text-slate-900">{t("project.mainActivities")}</h2>
          <p className="mt-1 text-xs text-slate-500">{t("project.mainActivitiesHelp")}</p>
          <Combobox
            multiple
            items={availableSuggestions}
            value={selected.map((item) => item.name)}
            onValueChange={(values) =>
              form.setValue(
                "activities",
                values.map((name) => ({ name })),
                { shouldValidate: true },
              )
            }
            inputValue={activityQuery}
            onInputValueChange={setActivityQuery}
          >
            <ComboboxChips
              ref={activityAnchor}
              className="mt-4 min-h-11 rounded-xl border-slate-200 bg-slate-50/70 px-2.5 focus-within:border-violet-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-100"
            >
              {selected.map((activity) => (
                <ComboboxChip
                  key={activity.name}
                  showRemove={false}
                  className="rounded-full bg-slate-900 py-1 ps-3 pe-1.5 text-white"
                >
                  {activity.name}
                  <button
                    type="button"
                    aria-label={t("project.removeActivity", { activity: activity.name })}
                    className="ms-1 grid size-4.5 place-items-center rounded-full text-slate-300 hover:bg-white/10 hover:text-white"
                    onClick={() =>
                      form.setValue(
                        "activities",
                        selected.filter((item) => item.name !== activity.name),
                        { shouldValidate: true },
                      )
                    }
                  >
                    <XIcon className="size-3" />
                  </button>
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                aria-label={t("project.customActivity")}
                placeholder={
                  selected.length ? t("project.addAnotherActivity") : t("project.searchActivity")
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canCreateActivity) {
                    event.preventDefault();
                    addActivity(activityQuery);
                  }
                }}
              />
            </ComboboxChips>
            <ComboboxContent anchor={activityAnchor}>
              <ComboboxList>
                <ComboboxCollection>
                  {(item: string) => (
                    <ComboboxItem key={item} value={item}>
                      {item}
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
                <ComboboxEmpty>
                  {canCreateActivity ? (
                    <button
                      type="button"
                      className="flex w-full items-center justify-center gap-1.5 py-1.5 text-sm font-medium text-violet-700"
                      onClick={() => addActivity(activityQuery)}
                    >
                      <PlusIcon className="size-3.5" />{" "}
                      {t("project.addActivity", { activity: activityQuery.trim() })}
                    </button>
                  ) : (
                    t("project.noActivity")
                  )}
                </ComboboxEmpty>
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          {form.formState.errors.activities && (
            <p className="mt-2 text-sm text-red-700">{t("project.activityRequired")}</p>
          )}
        </section>

        <section className="border-t border-slate-100 pt-6">
          <h2 className="text-sm font-semibold text-slate-900">{t("project.countries")}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {t("project.countriesHelp", { max: MAX_PROJECT_COUNTRIES })}
          </p>
          <div className="mt-4">
            <CountryMultiSelect
              label={t("project.countries")}
              value={countryCodes}
              onChange={(codes) => form.setValue("countryCodes", codes, { shouldValidate: true })}
            />
          </div>
          {form.formState.errors.countryCodes && (
            <p className="mt-2 text-sm text-red-700">{t("project.countryRequired")}</p>
          )}
        </section>

        <section className="border-t border-slate-100 pt-6">
          <h2 className="text-sm font-semibold text-slate-900">
            {t("project.descriptionAndLogo")}
          </h2>
          <div className="mt-4 space-y-4">
            <div>
              <span className="mb-2 block text-sm font-medium">{t("project.logo")}</span>
              <div
                className={`flex items-center gap-4 rounded-xl border-2 border-dashed p-4 transition ${
                  logoDragActive
                    ? "border-violet-400 bg-violet-50"
                    : "border-slate-200 bg-slate-50/60 hover:border-slate-300"
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setLogoDragActive(true);
                }}
                onDragLeave={() => setLogoDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setLogoDragActive(false);
                  void handleLogoFile(event.dataTransfer.files[0]);
                }}
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={t("project.logoAlt")}
                    className="size-14 shrink-0 rounded-xl border border-slate-200 object-cover"
                  />
                ) : (
                  <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-white text-slate-400">
                    <UploadIcon className="size-5" />
                  </span>
                )}
                <div className="min-w-0 text-xs text-slate-500">
                  <p>
                    {t("project.dropImage")}{" "}
                    <label className="cursor-pointer font-medium text-violet-700 hover:underline">
                      {t("project.browse")}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(event) => void handleLogoFile(event.target.files?.[0])}
                      />
                    </label>
                  </p>
                  <p className="mt-1">{t("project.logoFormats")}</p>
                  {logoUrl && (
                    <button
                      type="button"
                      className="mt-1 inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-700 hover:underline"
                      onClick={() => form.setValue("logoUrl", undefined, { shouldValidate: true })}
                    >
                      <XIcon className="size-3" /> {t("project.removeLogo")}
                    </button>
                  )}
                </div>
              </div>
              {logoError && <p className="mt-1 text-xs text-red-700">{logoError}</p>}
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                {t("project.descriptionLabel")}
              </span>
              <textarea
                className="min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder={t("project.descriptionPlaceholder")}
                {...form.register("description")}
              />
            </label>
          </div>
        </section>

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
          {form.formState.isSubmitting ? t("project.creating") : t("project.submit")}
        </Button>
      </form>
    </OnboardingShell>
  );
}
