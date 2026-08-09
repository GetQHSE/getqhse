import type { ProjectProfile, ProjectProfileField } from "@qhse/contracts";
import {
  profileQuestions,
  validateProfileFieldValue,
  type ProfileFieldKey,
  type ProfileQuestion,
  type ProfileSection,
} from "@qhse/profile";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@qhse/ui/components/alert-dialog";
import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@qhse/ui/components/dialog";
import { Progress } from "@qhse/ui/components/progress";
import { ScrollArea } from "@qhse/ui/components/scroll-area";
import { cn } from "@qhse/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BotIcon,
  CheckCircle2Icon,
  CheckIcon,
  CircleDotIcon,
  FileCheck2Icon,
  LoaderCircleIcon,
  LockKeyholeIcon,
  PencilIcon,
  ScaleIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { clientApi } from "../../app/client-api.js";
import {
  cleanEditorValue,
  initialEditorValue,
  ProfileFieldEditor,
  profileEditorSchemas,
} from "./profile-field-editor.js";

const sections: Array<{ key: ProfileSection; label: string; shortLabel: string }> = [
  { key: "IDENTITY_ACTIVITY", label: "Identité et activité", shortLabel: "Identité" },
  { key: "SCOPE_GEOGRAPHY", label: "Périmètre et géographie", shortLabel: "Périmètre" },
  { key: "OPERATIONS_RESOURCES", label: "Opérations et ressources", shortLabel: "Opérations" },
  { key: "EXTERNAL_CONTEXT", label: "Contexte externe", shortLabel: "Contexte" },
  { key: "INTERESTED_PARTIES", label: "Parties intéressées", shortLabel: "Parties" },
  { key: "STRATEGY_OBJECTIVES", label: "Stratégie et objectifs", shortLabel: "Stratégie" },
];

const sourceLabels: Record<string, string> = {
  ONBOARDING: "Onboarding",
  USER_CHAT: "Assistant",
  USER_EDIT: "Modification manuelle",
  AI_INFERRED: "Suggestion IA",
  IMPORTED: "Import",
  SYSTEM: "Système",
};

function answered(field: ProjectProfileField | undefined): boolean {
  return Boolean(field && ["ANSWERED", "CONFIRMED", "NOT_APPLICABLE"].includes(field.status));
}

function statusInfo(field: ProjectProfileField | undefined) {
  if (!field || field.status === "UNANSWERED") {
    return { label: "À renseigner", className: "border-amber-200 bg-amber-50 text-amber-800" };
  }
  if (field.status === "NEEDS_CLARIFICATION") {
    return { label: "À préciser", className: "border-orange-200 bg-orange-50 text-orange-800" };
  }
  if (field.status === "NOT_APPLICABLE") {
    return { label: "Non applicable", className: "border-slate-200 bg-slate-50 text-slate-600" };
  }
  if (field.status === "CONFIRMED") {
    return { label: "Confirmé", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  return { label: "Enregistré", className: "border-blue-200 bg-blue-50 text-blue-700" };
}

function displayValue(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  if (typeof value === "boolean") return [value ? "Oui" : "Non"];
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => displayValue(item))
      .filter(Boolean)
      .slice(0, 5);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferred = ["name", "label", "description", "party", "customerType", "reference"];
    const selected = preferred.flatMap((key) => displayValue(record[key])).filter(Boolean);
    if (selected.length) return selected.slice(0, 5);
    return Object.values(record)
      .flatMap((item) => displayValue(item))
      .filter(Boolean)
      .slice(0, 5);
  }
  return [];
}

function ProfileValue({ field }: { field: ProjectProfileField | undefined }) {
  if (!field || field.status === "UNANSWERED") {
    return <p className="text-sm italic text-slate-400">Aucune réponse enregistrée.</p>;
  }
  if (field.status === "NOT_APPLICABLE") {
    return (
      <p className="text-sm text-slate-500">
        {field.notApplicableReason ?? "Cette information ne s’applique pas."}
      </p>
    );
  }
  const values = displayValue(field.value);
  if (!values.length)
    return <p className="text-sm text-slate-500">Information structurée enregistrée.</p>;
  if (values.length === 1)
    return <p className="line-clamp-3 text-sm leading-6 text-slate-700">{values[0]}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
        >
          {value}
        </span>
      ))}
    </div>
  );
}

function EditProfileFieldDialog({
  question,
  field,
  profile,
  projectIdOrSlug,
  open,
  onOpenChange,
}: {
  question: ProfileQuestion | null;
  field: ProjectProfileField | undefined;
  profile: ProjectProfile;
  projectIdOrSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const schema = question ? profileEditorSchemas[question.key] : null;
  const [value, setValue] = useState<unknown>();
  const [notApplicable, setNotApplicable] = useState(false);
  const [notApplicableReason, setNotApplicableReason] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!question || !schema || !open) return;
    setValue(initialEditorValue(schema, field?.value));
    setNotApplicable(field?.status === "NOT_APPLICABLE");
    setNotApplicableReason(field?.notApplicableReason ?? "");
    setError(undefined);
  }, [field, open, question, schema]);

  async function save() {
    if (!question || !schema) return;
    let answer:
      | { key: ProfileFieldKey; status: "NOT_APPLICABLE"; notApplicableReason: string }
      | { key: ProfileFieldKey; status: "ANSWERED"; value: unknown };
    if (notApplicable) {
      if (notApplicableReason.trim().length < 3) {
        setError("Indiquez brièvement pourquoi cette information ne s’applique pas.");
        return;
      }
      answer = {
        key: question.key,
        status: "NOT_APPLICABLE",
        notApplicableReason: notApplicableReason.trim(),
      };
    } else {
      const cleaned = cleanEditorValue(schema, value);
      const parsed = validateProfileFieldValue(question.key, cleaned);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Vérifiez les informations saisies.");
        return;
      }
      answer = { key: question.key, status: "ANSWERED", value: parsed.data };
    }
    setSaving(true);
    setError(undefined);
    try {
      const updated = await clientApi.updateProjectProfile(projectIdOrSlug, {
        revision: profile.profile.revision,
        answers: [answer],
        changeReason: "Mise à jour depuis la page profil",
      });
      queryClient.setQueryData(["project-profile", projectIdOrSlug], updated);
      await queryClient.invalidateQueries({
        queryKey: ["project-profile-conversation", projectIdOrSlug],
      });
      onOpenChange(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "La modification n’a pas pu être enregistrée.",
      );
      await queryClient.invalidateQueries({ queryKey: ["project-profile", projectIdOrSlug] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,820px)] overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-slate-100 px-6 py-5 pr-14">
          <DialogTitle className="text-lg">Modifier une information</DialogTitle>
          <DialogDescription>{question?.prompt.fr}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(min(90vh,820px)-12rem)]">
          <div className="space-y-5 px-6 py-5">
            {question?.allowNotApplicable && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Cette information ne s’applique pas</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Utilisez cette option uniquement si elle est réellement hors périmètre.
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-pressed={notApplicable}
                    onClick={() => setNotApplicable((current) => !current)}
                    className={cn(
                      "relative h-6 w-11 rounded-full transition",
                      notApplicable ? "bg-violet-600" : "bg-slate-300",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-1 size-4 rounded-full bg-white transition",
                        notApplicable ? "left-6" : "left-1",
                      )}
                    />
                  </button>
                </div>
                {notApplicable && (
                  <textarea
                    aria-label="Motif de non-applicabilité"
                    className="mt-3 min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    placeholder="Expliquez brièvement pourquoi…"
                    value={notApplicableReason}
                    onChange={(event) => setNotApplicableReason(event.target.value)}
                  />
                )}
              </div>
            )}
            {!notApplicable && schema && (
              <ProfileFieldEditor schema={schema} value={value} onChange={setValue} />
            )}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700"
              >
                <AlertCircleIcon className="mt-0.5 size-4 shrink-0" /> {error}
              </div>
            )}
          </div>
        </ScrollArea>
        <DialogFooter className="border-t border-slate-100 bg-slate-50 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Annuler
          </Button>
          <Button
            type="button"
            disabled={saving}
            className="bg-violet-600 hover:bg-violet-700"
            onClick={() => void save()}
          >
            {saving && <LoaderCircleIcon className="size-4 animate-spin" />}
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectProfilePage() {
  const { projectId } = useParams();
  const projectIdOrSlug = projectId ?? "";
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["project-profile", projectIdOrSlug],
    enabled: Boolean(projectIdOrSlug),
    queryFn: () => clientApi.projectProfile(projectIdOrSlug),
  });
  const [selectedSection, setSelectedSection] = useState<ProfileSection>("IDENTITY_ACTIVITY");
  const [missingOnly, setMissingOnly] = useState(false);
  const [editingKey, setEditingKey] = useState<ProfileFieldKey | null>(null);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [pageError, setPageError] = useState<string>();

  const profile = profileQuery.data;
  const fieldsByKey = useMemo(
    () => new Map(profile?.fields.map((field) => [field.key, field]) ?? []),
    [profile?.fields],
  );

  useEffect(() => {
    if (profile?.nextQuestion) setSelectedSection(profile.nextQuestion.section);
  }, [profile?.profile.id]);

  if (profileQuery.isPending) {
    return (
      <div className="grid min-h-[28rem] place-items-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <LoaderCircleIcon className="size-5 animate-spin text-violet-600" /> Chargement du profil…
        </div>
      </div>
    );
  }
  if (!profile || profileQuery.error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
        <h1 className="font-semibold">Le profil ne peut pas être chargé</h1>
        <Button className="mt-4" variant="outline" onClick={() => void profileQuery.refetch()}>
          Réessayer
        </Button>
      </div>
    );
  }

  const currentQuestions = profileQuestions.filter((question) => {
    if (question.section !== selectedSection) return false;
    return !missingOnly || !answered(fieldsByKey.get(question.key));
  });
  const currentSection = sections.find((section) => section.key === selectedSection)!;
  const readyToFinalize =
    profile.completion.completenessPercent === 100 &&
    profile.completion.regulatoryReadiness === 100;
  const editingQuestion = profileQuestions.find((question) => question.key === editingKey) ?? null;

  async function finalize() {
    if (!profile) return;
    const revision = profile.profile.revision;
    setFinalizing(true);
    setPageError(undefined);
    try {
      await clientApi.completeProjectProfile(projectIdOrSlug, revision);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-profile", projectIdOrSlug] }),
        queryClient.invalidateQueries({ queryKey: ["client", "projects"] }),
      ]);
      setFinalizeOpen(false);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Le profil ne peut pas être finalisé.");
    } finally {
      setFinalizing(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-[1380px] space-y-6">
      <header className="relative overflow-hidden rounded-3xl bg-[#0a0e18] p-6 text-white sm:p-8">
        <div className="absolute -right-20 -top-24 size-80 rounded-full bg-violet-600/25 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-white/10 bg-white/10 text-slate-200" variant="outline">
                ISO 9001
              </Badge>
              <Badge
                className={cn(
                  "border-0",
                  profile.profile.status === "COMPLETE"
                    ? "bg-emerald-400/15 text-emerald-300"
                    : "bg-violet-400/15 text-violet-200",
                )}
              >
                {profile.profile.status === "COMPLETE"
                  ? "Profil finalisé"
                  : "Profil en construction"}
              </Badge>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">
              Profil de {profile.project.name}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Vérifiez et complétez les informations utilisées par l’assistant et la veille
              réglementaire.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              nativeButton={false}
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              render={<Link to={`/projects/${profile.project.slug}/chat`} />}
            >
              <BotIcon /> Continuer avec l’assistant
            </Button>
            <AlertDialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
              <AlertDialogTrigger
                render={
                  <Button
                    disabled={!readyToFinalize || profile.profile.status === "COMPLETE"}
                    className="bg-violet-600 hover:bg-violet-500"
                  />
                }
              >
                <FileCheck2Icon />{" "}
                {profile.profile.status === "COMPLETE" ? "Profil finalisé" : "Finaliser le profil"}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia className="bg-emerald-50 text-emerald-700">
                    <ShieldCheckIcon />
                  </AlertDialogMedia>
                  <AlertDialogTitle>Finaliser cette version ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Un instantané immuable du profil sera créé. Toute modification ultérieure
                    rouvrira le profil pour révision.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={finalizing}>Annuler</AlertDialogCancel>
                  <AlertDialogAction disabled={finalizing} onClick={() => void finalize()}>
                    {finalizing && <LoaderCircleIcon className="animate-spin" />}Confirmer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </header>

      {pageError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircleIcon className="size-4" /> {pageError}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Complétude du profil</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">
                {profile.completion.completenessPercent}%
              </p>
            </div>
            <span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700">
              <CheckCircle2Icon className="size-5" />
            </span>
          </div>
          <Progress
            value={profile.completion.completenessPercent}
            className="mt-4 [&_[data-slot=progress-indicator]]:bg-violet-600"
          />
          <p className="mt-3 text-xs text-slate-500">
            {profile.completion.answeredRequired} réponses sur {profile.completion.totalRequired}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Préparation réglementaire</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">
                {profile.completion.regulatoryReadiness}%
              </p>
            </div>
            <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <ScaleIcon className="size-5" />
            </span>
          </div>
          <Progress
            value={profile.completion.regulatoryReadiness}
            className="mt-4 [&_[data-slot=progress-indicator]]:bg-blue-600"
          />
          <p className="mt-3 text-xs text-slate-500">
            {profile.completion.answeredRegulatory} réponses critiques sur{" "}
            {profile.completion.totalRegulatory}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-1">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <LockKeyholeIcon className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Révision {profile.profile.revision}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Chaque modification est historisée. Les informations confirmées manuellement
                prennent priorité sur les suggestions de l’assistant.
              </p>
            </div>
          </div>
        </article>
      </div>

      <nav
        aria-label="Sections du profil"
        className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
      >
        <div className="flex min-w-max gap-1">
          {sections.map((section) => {
            const questions = profileQuestions.filter(
              (question) => question.section === section.key && question.required,
            );
            const completed = questions.filter((question) =>
              answered(fieldsByKey.get(question.key)),
            ).length;
            const selected = selectedSection === section.key;
            return (
              <button
                type="button"
                key={section.key}
                onClick={() => setSelectedSection(section.key)}
                className={cn(
                  "flex min-w-36 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                  selected ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-semibold",
                    selected
                      ? "bg-violet-500 text-white"
                      : completed === questions.length
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500",
                  )}
                >
                  {completed === questions.length ? <CheckIcon className="size-3.5" /> : completed}
                </span>
                <span>
                  <span className="block text-xs font-semibold">{section.shortLabel}</span>
                  <span
                    className={cn(
                      "mt-0.5 block text-[10px]",
                      selected ? "text-slate-400" : "text-slate-400",
                    )}
                  >
                    {completed}/{questions.length}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-violet-700">
              Section
            </p>
            <h2 className="mt-1 text-xl font-semibold">{currentSection.label}</h2>
          </div>
          <button
            type="button"
            aria-pressed={missingOnly}
            onClick={() => setMissingOnly((current) => !current)}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition",
              missingOnly
                ? "border-violet-300 bg-violet-50 text-violet-800"
                : "border-slate-200 text-slate-600 hover:bg-slate-50",
            )}
          >
            <SearchIcon className="size-3.5" /> Afficher uniquement les informations manquantes
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {currentQuestions.map((question) => {
            const field = fieldsByKey.get(question.key);
            const status = statusInfo(field);
            return (
              <article
                key={question.key}
                className="grid gap-4 px-5 py-5 transition hover:bg-slate-50/50 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-6"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "grid size-7 place-items-center rounded-full",
                        answered(field)
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-slate-100 text-slate-400",
                      )}
                    >
                      {answered(field) ? (
                        <CheckIcon className="size-3.5" />
                      ) : (
                        <CircleDotIcon className="size-3.5" />
                      )}
                    </span>
                    <Badge variant="outline" className={status.className}>
                      {status.label}
                    </Badge>
                    {question.regulatoryCritical && (
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                        <ScaleIcon className="size-3" /> Réglementaire
                      </Badge>
                    )}
                    {!question.required && <Badge variant="secondary">Facultatif</Badge>}
                  </div>
                  <h3 className="mt-3 text-sm font-semibold leading-6 text-slate-900">
                    {question.prompt.fr}
                  </h3>
                  <div className="mt-2">
                    <ProfileValue field={field} />
                  </div>
                  {field?.source && (
                    <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
                      <SparklesIcon className="size-3" /> Source :{" "}
                      {sourceLabels[field.source] ?? field.source}
                    </p>
                  )}
                </div>
                <div className="flex items-start sm:justify-end">
                  <Button
                    type="button"
                    variant={answered(field) ? "outline" : "default"}
                    className={cn(!answered(field) && "bg-violet-600 hover:bg-violet-700")}
                    onClick={() => setEditingKey(question.key)}
                  >
                    <PencilIcon className="size-4" /> {answered(field) ? "Modifier" : "Renseigner"}
                  </Button>
                </div>
              </article>
            );
          })}
          {!currentQuestions.length && (
            <div className="grid place-items-center px-6 py-14 text-center">
              <CheckCircle2Icon className="size-8 text-emerald-500" />
              <h3 className="mt-3 font-semibold">Cette section est complète</h3>
              <p className="mt-1 text-sm text-slate-500">
                Désactivez le filtre pour revoir les informations enregistrées.
              </p>
            </div>
          )}
        </div>
      </div>

      {!readyToFinalize && (
        <div className="flex flex-col gap-4 rounded-2xl border border-violet-100 bg-violet-50/70 p-5 sm:flex-row sm:items-center">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700">
            <SparklesIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-violet-950">
              Besoin d’aide pour compléter les informations restantes ?
            </p>
            <p className="mt-1 text-xs leading-5 text-violet-900/70">
              L’assistant peut vous guider question par question et analyser vos documents.
            </p>
          </div>
          <Button
            nativeButton={false}
            render={<Link to={`/projects/${profile.project.slug}/chat`} />}
            className="bg-violet-600 hover:bg-violet-700"
          >
            Ouvrir l’assistant <ArrowRightIcon />
          </Button>
        </div>
      )}

      <EditProfileFieldDialog
        question={editingQuestion}
        field={editingKey ? fieldsByKey.get(editingKey) : undefined}
        profile={profile}
        projectIdOrSlug={projectIdOrSlug}
        open={Boolean(editingKey)}
        onOpenChange={(open) => {
          if (!open) setEditingKey(null);
        }}
      />
    </section>
  );
}
