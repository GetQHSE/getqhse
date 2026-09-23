import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@qhse/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@qhse/ui/components/popover";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2Icon,
  BriefcaseBusinessIcon,
  ChevronDownIcon,
  ClipboardCheckIcon,
  FactoryIcon,
  FlaskConicalIcon,
  FolderKanbanIcon,
  GlobeIcon,
  GraduationCapIcon,
  HandshakeIcon,
  HardHatIcon,
  HeartPulseIcon,
  LandmarkIcon,
  LeafIcon,
  Layers3Icon,
  RecycleIcon,
  RocketIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StoreIcon,
  TargetIcon,
  TruckIcon,
  UsersRoundIcon,
  WarehouseIcon,
  WrenchIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { authClient } from "../../app/auth.js";
import { currentLanguage } from "../../app/i18n.js";
import { OnboardingShell } from "./onboarding-shell.js";

const iconOptions = [
  { value: "building", icon: Building2Icon },
  { value: "briefcase", icon: BriefcaseBusinessIcon },
  { value: "layers", icon: Layers3Icon },
  { value: "folder", icon: FolderKanbanIcon },
  { value: "shield", icon: ShieldCheckIcon },
  { value: "factory", icon: FactoryIcon },
  { value: "warehouse", icon: WarehouseIcon },
  { value: "hard-hat", icon: HardHatIcon },
  { value: "truck", icon: TruckIcon },
  { value: "wrench", icon: WrenchIcon },
  { value: "flask", icon: FlaskConicalIcon },
  { value: "leaf", icon: LeafIcon },
  { value: "recycle", icon: RecycleIcon },
  { value: "heart-pulse", icon: HeartPulseIcon },
  { value: "graduation-cap", icon: GraduationCapIcon },
  { value: "landmark", icon: LandmarkIcon },
  { value: "handshake", icon: HandshakeIcon },
  { value: "store", icon: StoreIcon },
  { value: "users", icon: UsersRoundIcon },
  { value: "clipboard-check", icon: ClipboardCheckIcon },
  { value: "target", icon: TargetIcon },
  { value: "globe", icon: GlobeIcon },
  { value: "rocket", icon: RocketIcon },
  { value: "sparkles", icon: SparklesIcon },
] as const;
const icons = iconOptions.map((option) => option.value) as [string, ...string[]];
function organizationSchema(nameRequired: string) {
  return z.object({
    name: z.string().trim().min(2, nameRequired).max(160),
    icon: z.enum(icons),
  });
}
type FormValues = z.infer<ReturnType<typeof organizationSchema>>;
type IconValue = (typeof iconOptions)[number]["value"];

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
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const { t, i18n } = useTranslation("onboarding");
  const schema = useMemo(
    () => organizationSchema(t("organization.nameRequired")),
    [t, i18n.language],
  );
  const iconLabel = (value: string) => t(`organization.icons.${value as IconValue}`);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { icon: "building" },
  });
  const selectedIcon = form.watch("icon");
  const SelectedIcon =
    iconOptions.find((option) => option.value === selectedIcon)?.icon ?? Building2Icon;

  async function submit(values: FormValues) {
    const baseSlug = slugify(values.name);
    const result = await authClient.organization.create({
      name: values.name.trim(),
      slug: `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`,
      icon: values.icon,
      status: "active",
      locale: currentLanguage(),
      timezone: "Africa/Casablanca",
    });
    if (result.error || !result.data) {
      form.setError("root", { message: result.error?.message ?? t("organization.createFailed") });
      return;
    }
    const active = await authClient.organization.setActive({ organizationId: result.data.id });
    if (active.error) {
      form.setError("root", {
        message: active.error.message ?? t("organization.activationFailed"),
      });
      return;
    }
    await queryClient.invalidateQueries();
    await navigate("/onboarding/project", { replace: true });
  }

  return (
    <OnboardingShell
      currentStep={2}
      eyebrow={t("organization.eyebrow")}
      title={t("organization.title")}
      description={t("organization.description")}
      aside={
        <aside className="h-fit rounded-2xl border border-violet-100 bg-violet-50/70 p-5">
          <span className="grid size-9 place-items-center rounded-xl bg-violet-600 text-white">
            <Building2Icon className="size-4" />
          </span>
          <h2 className="mt-4 font-semibold">{t("organization.whyTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t("organization.whyBody")}</p>
          <div className="mt-5 border-t border-violet-100 pt-4 text-xs leading-5 text-slate-500">
            {t("organization.example")}
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
            {t("organization.name")}
          </span>
          <input
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
            placeholder={t("organization.namePlaceholder")}
            autoFocus
            {...form.register("name")}
          />
          <span className="mt-2 block text-xs text-slate-500">{t("organization.nameHelp")}</span>
          {form.formState.errors.name && (
            <span className="mt-1 block text-sm text-red-700">
              {form.formState.errors.name.message}
            </span>
          )}
        </label>

        <div>
          <span className="mb-2 block text-sm font-semibold text-slate-800">
            {t("organization.icon")}
          </span>
          <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 gap-2 rounded-xl border-slate-200 bg-slate-50/70 px-3 text-sm font-normal text-slate-700"
                />
              }
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700">
                <SelectedIcon className="size-3.5" />
              </span>
              {iconOptions.some((option) => option.value === selectedIcon)
                ? iconLabel(selectedIcon)
                : t("organization.chooseIcon")}
              <ChevronDownIcon className="ms-auto size-4 text-slate-400" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72">
              <div className="grid grid-cols-6 gap-1.5">
                {iconOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = selectedIcon === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-label={iconLabel(option.value)}
                      title={iconLabel(option.value)}
                      className={`grid size-9 place-items-center rounded-xl border transition ${
                        isSelected
                          ? "border-violet-500 bg-violet-50 text-violet-700 ring-2 ring-violet-100"
                          : "border-transparent text-slate-600 hover:bg-slate-100"
                      }`}
                      onClick={() => {
                        form.setValue("icon", option.value, { shouldValidate: true });
                        setIconPickerOpen(false);
                      }}
                    >
                      <Icon className="size-4" />
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>

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
          {form.formState.isSubmitting ? t("organization.creating") : t("organization.submit")}
        </Button>
      </form>
    </OnboardingShell>
  );
}
