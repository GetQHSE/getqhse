import {
  regulatoryAnalysisErrorMessages,
  regulatoryAnalysisErrorCodeSchema,
  type ProjectProfile,
  type RegulatoryWatch,
} from "@qhse/contracts";
import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Input } from "@qhse/ui/components/input";
import { Progress } from "@qhse/ui/components/progress";
import { Skeleton } from "@qhse/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@qhse/ui/components/tabs";
import { cn } from "@qhse/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BotIcon,
  CheckCircle2Icon,
  CheckIcon,
  CircleAlertIcon,
  Clock3Icon,
  DownloadIcon,
  FileCheck2Icon,
  FileTextIcon,
  ListChecksIcon,
  LoaderCircleIcon,
  MessageSquareTextIcon,
  RefreshCwIcon,
  ScaleIcon,
  SearchCheckIcon,
  ShieldCheckIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { clientApi } from "../../app/client-api.js";
import {
  DetailSheet,
  DocumentList,
  EvaluationList,
  MetricCard,
  type RegulatoryDocument,
  type RegulatoryEvaluation,
} from "./regulatory-watch-test-page.js";

const activeAnalysisStatuses = new Set(["QUEUED", "RUNNING"]);

/**
 * Failure reasons only an operator can clear from server configuration
 * (env vars, deployment) — retrying cannot fix these, so no retry button.
 * Embedding-profile codes are excluded: an admin can now build/activate/
 * reindex a profile from Settings, so retrying after that fix works.
 */
const administrativeErrorCodes = new Set(["NORMATIVE_RAG_DISABLED", "OPENAI_KEY_MISSING"]);

/** Translates a persisted `errorCode` into customer-facing French copy. */
export function analysisErrorMessage(code: string | null | undefined): string {
  const parsed = regulatoryAnalysisErrorCodeSchema.safeParse(code);
  if (!parsed.success) return regulatoryAnalysisErrorMessages.ANALYSIS_FAILED;
  return regulatoryAnalysisErrorMessages[parsed.data];
}

export function analysisIsRetryable(code: string | null | undefined): boolean {
  return !code || !administrativeErrorCodes.has(code);
}

function useDelayedVisibility(active: boolean, delay = 500): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [active, delay]);
  return visible;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00.000Z`));
}

function mapEvaluationStatus(
  result: "CONFORMING" | "PARTIAL" | "NON_CONFORMING" | "NOT_ASSESSED",
): RegulatoryEvaluation["status"] {
  const labels = {
    CONFORMING: "Conforme",
    PARTIAL: "Partiel",
    NON_CONFORMING: "Non conforme",
    NOT_ASSESSED: "À évaluer",
  } as const;
  return labels[result];
}

export function regulatoryViewData(watch: RegulatoryWatch) {
  const entries = watch.currentBaseline?.entries ?? [];
  const groupedDocuments = new Map<string, RegulatoryDocument>();

  for (const entry of entries) {
    const key = entry.source.revisionId;
    const provision = entry.source.provisionIdentifier ?? entry.source.provisionType;
    const existing = groupedDocuments.get(key);
    if (existing) {
      existing.requirements += 1;
      if (!existing.provisions.split(" · ").includes(provision)) {
        existing.provisions = `${existing.provisions} · ${provision}`;
      }
      continue;
    }
    groupedDocuments.set(key, {
      id: key,
      kind: entry.source.documentFamily === "standard" ? "Norme" : "Réglementation",
      reference: entry.source.referenceNumber ?? entry.source.documentTitle,
      title: entry.source.documentTitle,
      jurisdiction:
        entry.source.countryCode === "MA" ? "Maroc" : entry.source.jurisdiction || "International",
      provisions: provision,
      requirements: 1,
      source: entry.source.citationLabel,
      status: "Validé",
      reason: entry.applicabilityRationale,
    });
  }

  const evaluationItems: RegulatoryEvaluation[] = entries.map((entry) => {
    const evidence = entry.evaluation.evidence[0];
    const action = entry.evaluation.actions[0];
    return {
      id: entry.evaluation.id,
      source: entry.source.referenceNumber ?? entry.source.documentTitle,
      provision: entry.source.provisionIdentifier ?? entry.source.provisionType,
      requirement: entry.source.excerpt,
      status: mapEvaluationStatus(entry.evaluation.result),
      evidence: evidence?.label ?? evidence?.note ?? evidence?.url ?? "Aucune preuve liée",
      action: action?.title ?? "Aucune action définie",
      owner: action?.assigneeName ?? "Non attribué",
      dueDate: formatDate(action?.dueDate),
      effectiveness:
        action?.effectiveness === "EFFECTIVE"
          ? "Action efficace"
          : action?.effectiveness === "INEFFECTIVE"
            ? "Action non efficace"
            : "À vérifier",
    };
  });

  const evaluated = evaluationItems.filter((item) => item.status !== "À évaluer").length;
  const conforming = evaluationItems.filter((item) => item.status === "Conforme").length;
  const partial = evaluationItems.filter((item) => item.status === "Partiel").length;
  const nonConforming = evaluationItems.filter((item) => item.status === "Non conforme").length;
  const openActions = entries
    .flatMap((entry) => entry.evaluation.actions)
    .filter((action) => action.status !== "DONE" && action.status !== "VERIFIED").length;

  return {
    documents: [...groupedDocuments.values()],
    evaluations: evaluationItems,
    summary: {
      total: evaluationItems.length,
      evaluated,
      conforming,
      partial,
      nonConforming,
      compliancePercent: evaluated === 0 ? 0 : Math.round((conforming / evaluated) * 100),
      openActions,
    },
  };
}

function PageSkeleton() {
  return (
    <section
      aria-label="Chargement de la veille réglementaire"
      className="mx-auto w-full max-w-[1440px] space-y-5"
    >
      <div className="space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-4 w-[34rem] max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton className="h-28 rounded-2xl" key={index} />
        ))}
      </div>
      <Skeleton className="h-14 rounded-2xl" />
      <Skeleton className="h-12 rounded-2xl" />
      <Skeleton className="h-96 rounded-3xl" />
    </section>
  );
}

function StateShell({
  children,
  tone = "dark",
}: {
  children: React.ReactNode;
  tone?: "dark" | "light";
}) {
  return (
    <section
      className={cn(
        "relative mx-auto min-h-[620px] w-full max-w-[1180px] overflow-hidden rounded-[32px] border p-6 sm:p-10 lg:p-14",
        tone === "dark"
          ? "border-slate-800 bg-[#090d18] text-white"
          : "border-slate-200 bg-white text-slate-950",
      )}
    >
      {tone === "dark" && (
        <>
          <div className="absolute -right-24 -top-24 size-96 rounded-full bg-violet-600/20 blur-3xl" />
          <div className="absolute -bottom-32 left-1/4 size-80 rounded-full bg-blue-500/10 blur-3xl" />
        </>
      )}
      <div className="relative">{children}</div>
    </section>
  );
}

function IncompleteProfileState({ profile }: { profile: ProjectProfile }) {
  return (
    <StateShell>
      <div className="mx-auto flex max-w-3xl flex-col items-center py-8 text-center sm:py-14">
        <span className="grid size-16 place-items-center rounded-3xl border border-violet-400/20 bg-violet-400/10 text-violet-300">
          <BotIcon className="size-7" />
        </span>
        <Badge className="mt-6 border-white/10 bg-white/10 text-slate-200" variant="outline">
          Étape 1 sur 2 · Profil du projet
        </Badge>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
          Complétez d’abord le profil de {profile.project.name}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">
          La veille utilise vos activités, implantations, effectifs, procédés et risques pour
          identifier uniquement les textes réellement applicables.
        </p>
        <div className="mt-8 w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-5 text-left">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-300">Préparation réglementaire</span>
            <span className="font-semibold text-white">
              {profile.completion.regulatoryReadiness}%
            </span>
          </div>
          <Progress
            className="mt-4 [&_[data-slot=progress-indicator]]:bg-violet-500 [&_[data-slot=progress-track]]:bg-white/10"
            value={profile.completion.regulatoryReadiness}
          />
          <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
            <span>
              {profile.completion.answeredRegulatory} réponses critiques sur{" "}
              {profile.completion.totalRegulatory}
            </span>
            <span>{profile.completion.missingRegulatoryKeys.length} informations restantes</span>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row">
          <Button
            nativeButton={false}
            className="h-11 rounded-xl bg-violet-600 px-5 hover:bg-violet-500"
            render={<Link to={`/projects/${profile.project.slug}/chat`} />}
          >
            <MessageSquareTextIcon /> Continuer avec l’assistant <ArrowRightIcon />
          </Button>
          <Button
            nativeButton={false}
            className="h-11 border-white/15 bg-white/5 text-white hover:bg-white/10"
            variant="outline"
            render={<Link to={`/projects/${profile.project.slug}/profile`} />}
          >
            Ouvrir le profil
          </Button>
        </div>
      </div>
    </StateShell>
  );
}

function ReadyState({
  profile,
  pending,
  error,
  onStart,
}: {
  profile: ProjectProfile;
  pending: boolean;
  error: string | undefined;
  onStart: () => void;
}) {
  return (
    <StateShell>
      <div className="mx-auto max-w-4xl py-4 sm:py-10">
        <div className="text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-3xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
            <ShieldCheckIcon className="size-7" />
          </span>
          <Badge
            className="mt-6 border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
            variant="outline"
          >
            <CheckIcon /> Profil finalisé
          </Badge>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
            Tout est prêt pour construire votre veille
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-400">
            L’assistant va analyser le profil de {profile.project.name}, interroger le fonds
            documentaire et préparer une proposition que vous validerez avant publication.
          </p>
        </div>
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {[
            {
              icon: SearchCheckIcon,
              title: "Recherche ciblée",
              text: "Textes marocains et normes ISO liés au périmètre.",
            },
            {
              icon: SparklesIcon,
              title: "Analyse d’applicabilité",
              text: "Chaque exigence est reliée aux faits du profil.",
            },
            {
              icon: FileCheck2Icon,
              title: "Validation humaine",
              text: "Aucun référentiel n’est publié sans votre revue.",
            },
          ].map((step, index) => (
            <article className="rounded-2xl border border-white/10 bg-white/5 p-5" key={step.title}>
              <span className="grid size-9 place-items-center rounded-xl bg-white/10 text-violet-300">
                <step.icon className="size-4" />
              </span>
              <p className="mt-4 text-sm font-semibold">
                {index + 1}. {step.title}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{step.text}</p>
            </article>
          ))}
        </div>
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200"
          >
            {error}
          </p>
        )}
        <div className="mt-8 text-center">
          <Button
            className="h-12 rounded-xl bg-violet-600 px-6 text-base hover:bg-violet-500"
            disabled={pending}
            onClick={onStart}
          >
            {pending ? <LoaderCircleIcon className="animate-spin" /> : <ScaleIcon />}{" "}
            {pending ? "Démarrage…" : "Démarrer la veille réglementaire"}
          </Button>
          <p className="mt-3 text-[11px] text-slate-500">
            L’analyse se déroule en arrière-plan. Vous pourrez quitter cette page.
          </p>
        </div>
      </div>
    </StateShell>
  );
}

function ProcessingState({ watch }: { watch: RegulatoryWatch }) {
  const analysis = watch.currentAnalysis;
  const progress = analysis?.progressPercent ?? 5;
  const phaseLabels: Record<string, string> = {
    queued: "Préparation de l’analyse",
    planning: "Lecture du profil",
    retrieval: "Recherche dans le fonds documentaire",
    classification: "Analyse de l’applicabilité",
    finalizing: "Préparation de la revue",
  };
  return (
    <StateShell>
      <div className="mx-auto flex max-w-2xl flex-col items-center py-16 text-center">
        <span className="relative grid size-20 place-items-center rounded-full border border-violet-400/20 bg-violet-400/10 text-violet-300">
          <LoaderCircleIcon className="size-8 animate-spin" />
          <span className="absolute inset-[-9px] rounded-full border border-violet-400/10" />
        </span>
        <Badge className="mt-8 border-white/10 bg-white/10 text-slate-300" variant="outline">
          Analyse en cours
        </Badge>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">
          Nous préparons votre référentiel
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          {phaseLabels[analysis?.phase ?? "queued"] ?? "Analyse des exigences applicables"}
        </p>
        <div className="mt-8 w-full rounded-3xl border border-white/10 bg-white/5 p-5 text-left">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Progression</span>
            <span className="font-semibold text-white">{progress}%</span>
          </div>
          <Progress
            className="mt-3 [&_[data-slot=progress-indicator]]:bg-violet-500 [&_[data-slot=progress-track]]:bg-white/10"
            value={progress}
          />
        </div>
        <p className="mt-5 flex items-center gap-2 text-xs text-slate-500">
          <Clock3Icon className="size-3.5" /> Cette page se met à jour automatiquement.
        </p>
      </div>
    </StateShell>
  );
}

function ClarificationState({
  watch,
  pending,
  error,
  onSubmit,
}: {
  watch: RegulatoryWatch;
  pending: boolean;
  error: string | undefined;
  onSubmit: (answers: Array<{ key: string; answer: string }>) => void;
}) {
  const questions = (watch.currentAnalysis?.clarifications ?? []).filter(
    (item) => item.answer == null,
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const complete = questions.length > 0 && questions.every((item) => answers[item.key]?.trim());
  return (
    <StateShell tone="light">
      <div className="mx-auto max-w-2xl py-8">
        <span className="grid size-12 place-items-center rounded-2xl bg-amber-50 text-amber-700">
          <CircleAlertIcon className="size-5" />
        </span>
        <Badge className="mt-5 border-amber-200 bg-amber-50 text-amber-800" variant="outline">
          Précision nécessaire
        </Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          L’analyse a besoin de votre aide
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Quelques réponses permettront de décider correctement si certains textes sont applicables.
        </p>
        <div className="mt-7 space-y-4">
          {questions.map((item, index) => (
            <label className="block rounded-2xl border border-slate-200 p-4" key={item.key}>
              <span className="text-xs font-semibold text-slate-400">Question {index + 1}</span>
              <span className="mt-1 block text-sm font-medium leading-6 text-slate-800">
                {item.question}
              </span>
              <Input
                className="mt-3 h-11 rounded-xl border-slate-200 bg-slate-50"
                onChange={(event) =>
                  setAnswers((current) => ({ ...current, [item.key]: event.target.value }))
                }
                placeholder="Votre réponse…"
                value={answers[item.key] ?? ""}
              />
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-rose-700">
            {error}
          </p>
        )}
        <Button
          className="mt-6 h-11 rounded-xl bg-slate-950 px-5 hover:bg-slate-800"
          disabled={!complete || pending}
          onClick={() =>
            onSubmit(
              questions.map((item) => ({ key: item.key, answer: answers[item.key]!.trim() })),
            )
          }
        >
          {pending ? <LoaderCircleIcon className="animate-spin" /> : <ArrowRightIcon />} Reprendre
          l’analyse
        </Button>
      </div>
    </StateShell>
  );
}

function ReviewState({
  watch,
  deciding,
  publishing,
  error,
  onDecision,
  onPublish,
}: {
  watch: RegulatoryWatch;
  deciding: boolean;
  publishing: boolean;
  error: string | undefined;
  onDecision: (candidateId: string, decision: "APPLICABLE" | "NOT_APPLICABLE") => void;
  onPublish: () => void;
}) {
  const candidates = watch.currentAnalysis?.candidates ?? [];
  const groups = [
    { value: "ADDED", label: "Ajouts" },
    { value: "MODIFIED", label: "Modifications" },
    { value: "REMOVAL_PROPOSED", label: "Retraits proposés" },
    { value: "UNCHANGED", label: "Inchangés" },
  ] as const;
  const firstPopulated = groups.find((group) =>
    candidates.some((candidate) => candidate.changeType === group.value),
  )?.value;
  const [selectedGroup, setSelectedGroup] = useState<(typeof groups)[number]["value"]>(
    firstPopulated ?? "ADDED",
  );
  const remaining = candidates.filter(
    (candidate) => candidate.requiresReview && candidate.decision == null,
  ).length;
  const canPublish =
    remaining === 0 && candidates.some((candidate) => candidate.decision === "APPLICABLE");
  return (
    <StateShell tone="light">
      <div className="mx-auto max-w-4xl py-3">
        <Badge className="border-violet-200 bg-violet-50 text-violet-700" variant="outline">
          <SparklesIcon /> Proposition prête
        </Badge>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Validez uniquement les changements
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Les dispositions inchangées sont conservées automatiquement. Chaque ajout,
              modification ou retrait reste soumis à votre validation.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {remaining} décision{remaining === 1 ? "" : "s"} restante{remaining === 1 ? "" : "s"}
          </span>
        </div>
        <Tabs
          className="mt-7 gap-4"
          value={selectedGroup}
          onValueChange={(value) => setSelectedGroup(value as typeof selectedGroup)}
        >
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1 lg:grid-cols-4">
            {groups.map((group) => (
              <TabsTrigger
                className="h-auto min-h-10 whitespace-normal rounded-xl px-2 py-2 text-xs"
                key={group.value}
                value={group.value}
              >
                {group.label}
                <span className="rounded-md bg-white/70 px-1.5 py-0.5 text-[10px]">
                  {candidates.filter((candidate) => candidate.changeType === group.value).length}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="max-h-[470px] space-y-3 overflow-y-auto pr-1">
            {candidates
              .filter((candidate) => candidate.changeType === selectedGroup)
              .map((candidate) => (
                <article
                  className="rounded-2xl border border-slate-200 p-4 sm:p-5"
                  key={candidate.id}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-violet-700">
                        {candidate.source.referenceNumber ?? candidate.source.documentTitle} ·{" "}
                        {candidate.source.provisionIdentifier}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {candidate.source.documentTitle}
                      </p>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                        {candidate.rationale}
                      </p>
                      {candidate.changeSummary && (
                        <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
                          {candidate.changeSummary}
                        </p>
                      )}
                    </div>
                    {candidate.requiresReview ? (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          className={cn(
                            "h-9 rounded-xl",
                            candidate.decision === "NOT_APPLICABLE" &&
                              "border-rose-200 bg-rose-50 text-rose-700",
                          )}
                          disabled={deciding}
                          onClick={() => onDecision(candidate.id, "NOT_APPLICABLE")}
                          variant="outline"
                        >
                          <XIcon />
                          {candidate.changeType === "REMOVAL_PROPOSED"
                            ? "Confirmer le retrait"
                            : "Non applicable"}
                        </Button>
                        <Button
                          className={cn(
                            "h-9 rounded-xl",
                            candidate.decision === "APPLICABLE"
                              ? "bg-emerald-600 hover:bg-emerald-600"
                              : "bg-slate-950 hover:bg-slate-800",
                          )}
                          disabled={deciding}
                          onClick={() => onDecision(candidate.id, "APPLICABLE")}
                        >
                          <CheckIcon />
                          {candidate.changeType === "REMOVAL_PROPOSED" ? "Conserver" : "Applicable"}
                        </Button>
                      </div>
                    ) : (
                      <Badge
                        className="shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700"
                        variant="outline"
                      >
                        <CheckIcon /> Conservée automatiquement
                      </Badge>
                    )}
                  </div>
                </article>
              ))}
            {candidates.every((candidate) => candidate.changeType !== selectedGroup) && (
              <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                Aucun élément dans cette catégorie.
              </p>
            )}
          </div>
        </Tabs>
        {error && (
          <p role="alert" className="mt-4 text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-100 pt-5">
          <p className="text-xs text-slate-500">
            La publication crée un référentiel immuable lié à cette version du profil.
          </p>
          <Button
            className="h-11 rounded-xl bg-violet-600 px-5 hover:bg-violet-500"
            disabled={!canPublish || publishing || deciding}
            onClick={onPublish}
          >
            {publishing ? <LoaderCircleIcon className="animate-spin" /> : <FileCheck2Icon />}{" "}
            Publier le référentiel
          </Button>
        </div>
      </div>
    </StateShell>
  );
}

export function DataPage({
  profile,
  watch,
  synchronizing,
  onRefresh,
  refreshing,
  onExport,
  exporting,
}: {
  profile: ProjectProfile;
  watch: RegulatoryWatch;
  synchronizing: boolean;
  onRefresh: () => void;
  refreshing: boolean;
  onExport: () => void;
  exporting: boolean;
}) {
  const [selectedDocument, setSelectedDocument] = useState<RegulatoryDocument | null>(null);
  const [selectedEvaluation, setSelectedEvaluation] = useState<RegulatoryEvaluation | null>(null);
  const data = useMemo(() => regulatoryViewData(watch), [watch]);
  const analysisActive = Boolean(
    watch.currentAnalysis && activeAnalysisStatuses.has(watch.currentAnalysis.status),
  );
  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-5">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>{profile.project.name}</span>
            <span>/</span>
            <span>Veille réglementaire</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">Veille réglementaire</h1>
            {synchronizing && (
              <span
                role="status"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700"
              >
                <LoaderCircleIcon className="size-3.5 animate-spin" /> Synchronisation…
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Référentiel applicable et évaluation de conformité du projet.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="h-10 rounded-xl bg-white"
            disabled={refreshing || analysisActive}
            onClick={onRefresh}
            variant="outline"
          >
            <RefreshCwIcon className={cn((refreshing || analysisActive) && "animate-spin")} />{" "}
            {analysisActive ? "Analyse en cours" : "Actualiser l’analyse"}
          </Button>
          <Button
            className="h-10 rounded-xl bg-slate-950 px-4 hover:bg-slate-800"
            disabled={exporting}
            onClick={onExport}
          >
            {exporting ? <LoaderCircleIcon className="animate-spin" /> : <DownloadIcon />} Exporter
            en Excel
          </Button>
        </div>
      </header>

      {analysisActive && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-white text-violet-700">
              <LoaderCircleIcon className="size-4 animate-spin" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-violet-950">
                  Mise à jour du référentiel en cours
                </p>
                <span className="text-xs font-semibold text-violet-800">
                  {watch.currentAnalysis?.progressPercent ?? 0}%
                </span>
              </div>
              <p className="mt-1 text-xs text-violet-800/70">
                Le référentiel publié reste disponible pendant toute l’analyse.
              </p>
              <Progress
                className="mt-3 [&_[data-slot=progress-indicator]]:bg-violet-600 [&_[data-slot=progress-track]]:bg-violet-100"
                value={watch.currentAnalysis?.progressPercent ?? 0}
              />
            </div>
          </div>
        </div>
      )}
      {watch.status === "STALE" && !analysisActive && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-amber-950">
                Le profil a changé depuis cette publication
              </p>
              <p className="mt-1 text-xs text-amber-800/70">
                Actualisez l’analyse pour vérifier si le périmètre réglementaire doit évoluer.
              </p>
            </div>
          </div>
          <Button className="bg-white" onClick={onRefresh} size="sm" variant="outline">
            Synchroniser maintenant
          </Button>
        </div>
      )}
      {watch.synchronization.state === "FAILED" && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" /> La dernière synchronisation a
          échoué. Le référentiel publié reste disponible.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={FileTextIcon}
          label="Textes applicables"
          value={String(data.documents.length)}
          detail={`${data.summary.total} exigences publiées`}
          tone="bg-blue-50 text-blue-700"
        />
        <MetricCard
          icon={ListChecksIcon}
          label="Exigences identifiées"
          value={String(data.summary.total)}
          detail={`${data.summary.evaluated} déjà évaluées`}
          tone="bg-violet-50 text-violet-700"
        />
        <MetricCard
          icon={CheckCircle2Icon}
          label="Taux de conformité"
          value={`${data.summary.compliancePercent} %`}
          detail={`${data.summary.conforming} exigences conformes`}
          tone="bg-emerald-50 text-emerald-700"
        />
        <MetricCard
          icon={Clock3Icon}
          label="Actions ouvertes"
          value={String(data.summary.openActions)}
          detail="À piloter dans l’évaluation"
          tone="bg-rose-50 text-rose-700"
        />
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm">
            <ShieldCheckIcon className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-emerald-950">
              Référentiel basé sur le profil validé
            </p>
            <p className="mt-0.5 text-xs text-emerald-800/70">
              Baseline {watch.currentBaseline?.sequence} · publiée le{" "}
              {formatDate(watch.currentBaseline?.publishedAt)}
            </p>
          </div>
        </div>
        <Badge className="border-emerald-200 bg-white text-emerald-700" variant="outline">
          <CheckCircle2Icon /> Publié
        </Badge>
      </div>

      <Tabs className="gap-4" defaultValue="documents">
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          <TabsTrigger
            className="h-auto min-h-12 whitespace-normal rounded-xl px-2 py-2 text-center leading-4 data-active:bg-slate-950 data-active:text-white sm:px-5"
            value="documents"
          >
            <FileTextIcon /> Liste des textes réglementaires et normatives{" "}
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
              {data.documents.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            className="h-auto min-h-12 whitespace-normal rounded-xl px-2 py-2 text-center leading-4 data-active:bg-slate-950 data-active:text-white sm:px-5"
            value="evaluation"
          >
            <ListChecksIcon /> Évaluation réglementaire et normative{" "}
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
              {data.summary.total}
            </span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="documents">
          <DocumentList
            items={data.documents}
            onOpen={(item) => {
              setSelectedEvaluation(null);
              setSelectedDocument(item);
            }}
          />
        </TabsContent>
        <TabsContent value="evaluation">
          <EvaluationList
            items={data.evaluations}
            summary={data.summary}
            onOpen={(item) => {
              setSelectedDocument(null);
              setSelectedEvaluation(item);
            }}
          />
        </TabsContent>
      </Tabs>
      <DetailSheet
        document={selectedDocument}
        evaluation={selectedEvaluation}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDocument(null);
            setSelectedEvaluation(null);
          }
        }}
      />
    </section>
  );
}

export function RegulatoryWatchPage() {
  const { projectId = "" } = useParams();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string>();
  const [exporting, setExporting] = useState(false);
  const profileQuery = useQuery({
    queryKey: ["project-profile", projectId],
    queryFn: () => clientApi.projectProfile(projectId),
    enabled: Boolean(projectId),
    refetchOnWindowFocus: true,
  });
  const watchQuery = useQuery({
    queryKey: ["regulatory-watch", projectId],
    queryFn: () => clientApi.regulatoryWatch(projectId),
    enabled: Boolean(projectId),
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const watch = query.state.data;
      return watch?.currentAnalysis && activeAnalysisStatuses.has(watch.currentAnalysis.status)
        ? 2_000
        : false;
    },
  });
  const synchronizing = useDelayedVisibility(
    Boolean(
      (profileQuery.isFetching && profileQuery.data) ||
      (watchQuery.isFetching && watchQuery.data) ||
      (watchQuery.data?.currentAnalysis &&
        activeAnalysisStatuses.has(watchQuery.data.currentAnalysis.status)),
    ),
  );

  const startMutation = useMutation({
    mutationFn: () => clientApi.startRegulatoryAnalysis(projectId, { languages: ["fr", "ar"] }),
    onMutate: () => setActionError(undefined),
    onSuccess: async () => {
      await watchQuery.refetch();
    },
    onError: (error) =>
      setActionError(error instanceof Error ? error.message : "L’analyse n’a pas pu démarrer."),
  });
  const clarificationMutation = useMutation({
    mutationFn: (answers: Array<{ key: string; answer: string }>) => {
      const analysis = watchQuery.data?.currentAnalysis;
      if (!analysis) throw new Error("Analyse introuvable");
      return clientApi.answerRegulatoryClarifications(projectId, analysis.id, {
        revision: analysis.clarificationRevision,
        answers,
      });
    },
    onMutate: () => setActionError(undefined),
    onSuccess: async () => {
      await watchQuery.refetch();
    },
    onError: (error) =>
      setActionError(
        error instanceof Error ? error.message : "Les réponses n’ont pas pu être enregistrées.",
      ),
  });
  const decisionMutation = useMutation({
    mutationFn: ({
      candidateId,
      decision,
    }: {
      candidateId: string;
      decision: "APPLICABLE" | "NOT_APPLICABLE";
    }) => {
      const watch = watchQuery.data;
      if (!watch) throw new Error("Veille introuvable");
      return clientApi.decideRegulatoryCandidate(projectId, candidateId, {
        watchRevision: watch.revision,
        decision,
      });
    },
    onMutate: () => setActionError(undefined),
    onSuccess: (watch) => queryClient.setQueryData(["regulatory-watch", projectId], watch),
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "La décision n’a pas pu être enregistrée.",
      );
      void watchQuery.refetch();
    },
  });
  const publishMutation = useMutation({
    mutationFn: () => {
      const watch = watchQuery.data;
      const analysis = watch?.currentAnalysis;
      if (!watch || !analysis) throw new Error("Analyse introuvable");
      return clientApi.publishRegulatoryBaseline(projectId, {
        analysisRunId: analysis.id,
        watchRevision: watch.revision,
      });
    },
    onMutate: () => setActionError(undefined),
    onSuccess: (watch) => queryClient.setQueryData(["regulatory-watch", projectId], watch),
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "Le référentiel n’a pas pu être publié.",
      );
      void watchQuery.refetch();
    },
  });

  if ((profileQuery.isPending && !profileQuery.data) || (watchQuery.isPending && !watchQuery.data))
    return <PageSkeleton />;
  const profile = profileQuery.data;
  const watch = watchQuery.data;
  if (!profile || !watch)
    return (
      <section className="mx-auto max-w-2xl rounded-3xl border border-rose-200 bg-white p-8 text-center">
        <AlertCircleIcon className="mx-auto size-7 text-rose-600" />
        <h1 className="mt-4 text-xl font-semibold">La veille réglementaire est indisponible</h1>
        <p className="mt-2 text-sm text-slate-500">
          {profileQuery.error?.message ??
            watchQuery.error?.message ??
            "Réessayez dans quelques instants."}
        </p>
        <Button
          className="mt-5"
          onClick={() => void Promise.all([profileQuery.refetch(), watchQuery.refetch()])}
        >
          Réessayer
        </Button>
      </section>
    );
  if (profile.profile.status !== "COMPLETE") return <IncompleteProfileState profile={profile} />;
  const projectSlug = profile.project.slug;

  const hasBaseline = Boolean(watch.currentBaseline);
  const analysisStatus = watch.currentAnalysis?.status;
  if (!hasBaseline && watch.status === "NOT_STARTED")
    return (
      <ReadyState
        profile={profile}
        pending={startMutation.isPending}
        error={actionError}
        onStart={() => startMutation.mutate()}
      />
    );
  if (!hasBaseline && analysisStatus && activeAnalysisStatuses.has(analysisStatus))
    return <ProcessingState watch={watch} />;
  if (!hasBaseline && analysisStatus === "AWAITING_CLARIFICATION")
    return (
      <ClarificationState
        watch={watch}
        pending={clarificationMutation.isPending}
        error={actionError}
        onSubmit={(answers) => clarificationMutation.mutate(answers)}
      />
    );
  if (!hasBaseline && analysisStatus === "READY_FOR_REVIEW")
    return (
      <ReviewState
        watch={watch}
        deciding={decisionMutation.isPending}
        publishing={publishMutation.isPending}
        error={actionError}
        onDecision={(candidateId, decision) => decisionMutation.mutate({ candidateId, decision })}
        onPublish={() => publishMutation.mutate()}
      />
    );
  if (!hasBaseline && watch.status === "FAILED")
    return (
      <StateShell tone="light">
        <div className="mx-auto max-w-xl py-20 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-rose-50 text-rose-700">
            <AlertCircleIcon className="size-6" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold">L’analyse n’a pas abouti</h1>
          <p className="mt-3 text-sm text-slate-500">
            {analysisErrorMessage(watch.currentAnalysis?.error?.code)}
          </p>
          {analysisIsRetryable(watch.currentAnalysis?.error?.code) ? (
            <Button
              className="mt-6"
              disabled={startMutation.isPending}
              onClick={() => startMutation.mutate()}
            >
              <RefreshCwIcon /> Relancer l’analyse
            </Button>
          ) : null}
        </div>
      </StateShell>
    );

  async function exportWorkbook() {
    setExporting(true);
    setActionError(undefined);
    try {
      const content = await clientApi.exportRegulatoryWatch(projectId);
      const url = URL.createObjectURL(
        new Blob([content], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `veille-reglementaire-${projectSlug}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "L’export n’a pas pu être généré.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {analysisStatus === "AWAITING_CLARIFICATION" && (
        <ClarificationState
          watch={watch}
          pending={clarificationMutation.isPending}
          error={actionError}
          onSubmit={(answers) => clarificationMutation.mutate(answers)}
        />
      )}
      {analysisStatus === "READY_FOR_REVIEW" && (
        <ReviewState
          watch={watch}
          deciding={decisionMutation.isPending}
          publishing={publishMutation.isPending}
          error={actionError}
          onDecision={(candidateId, decision) => decisionMutation.mutate({ candidateId, decision })}
          onPublish={() => publishMutation.mutate()}
        />
      )}
      {analysisStatus === "FAILED" && (
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm">
          <div className="flex items-start gap-2 text-rose-800">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">La dernière analyse n’a pas abouti</p>
              <p className="mt-1 text-rose-700">
                {analysisErrorMessage(watch.currentAnalysis?.error?.code)}
              </p>
            </div>
          </div>
          {analysisIsRetryable(watch.currentAnalysis?.error?.code) ? (
            <Button
              size="sm"
              disabled={startMutation.isPending}
              onClick={() => startMutation.mutate()}
            >
              <RefreshCwIcon /> Relancer l’analyse
            </Button>
          ) : null}
        </div>
      )}
      <DataPage
        profile={profile}
        watch={watch}
        synchronizing={synchronizing}
        refreshing={startMutation.isPending}
        exporting={exporting}
        onRefresh={() => startMutation.mutate()}
        onExport={() => void exportWorkbook()}
      />
      {actionError && (
        <div
          role="alert"
          className="fixed bottom-5 right-5 z-40 flex max-w-sm items-start gap-2 rounded-2xl border border-rose-200 bg-white p-4 text-sm text-rose-700 shadow-xl"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
          {actionError}
          <button
            aria-label="Fermer"
            className="ml-auto"
            onClick={() => setActionError(undefined)}
            type="button"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
