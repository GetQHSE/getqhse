import { countryName } from "@qhse/domain/countries";
import {
  regulatoryAnalysisErrorCodeSchema,
  staleAiEvaluationMs,
  type ProjectProfile,
  type RegulatoryWatch,
} from "@qhse/contracts";
import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Input } from "@qhse/ui/components/input";
import { Progress } from "@qhse/ui/components/progress";
import { Skeleton } from "@qhse/ui/components/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@qhse/ui/components/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@qhse/ui/components/tabs";
import { Textarea } from "@qhse/ui/components/textarea";
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
  PlusIcon,
  RefreshCwIcon,
  ScaleIcon,
  SearchCheckIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StarIcon,
  TargetIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import type { TFunction } from "i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { AUTO_APPLICABLE } from "../../app/feature-flags.js";
import { clientApi } from "../../app/client-api.js";
import { formatters, useFormat, type Formatters } from "../../app/format.js";
import { currentLanguage, i18n } from "../../app/i18n.js";
import {
  DetailSheet,
  DocumentList,
  EvaluationList,
  MetricCard,
  type RegulatoryActionRow,
  type RegulatoryDocument,
  type RegulatoryEvaluation,
  type RegulatoryEvidenceItem,
} from "./regulatory-watch-test-page.js";

type RegulatoryT = TFunction<"regulatory">;

const activeAnalysisStatuses = new Set(["QUEUED", "RUNNING"]);

/** A pass counts as live only while it is still making progress. Without the staleness check a
 *  worker that died mid-pass would leave PENDING rows behind that disable the re-run button and
 *  pin the poller at 2s forever — exactly when the user needs to recover. */
function aiEvaluationActive(watch: RegulatoryWatch | undefined): boolean {
  const rows = (watch?.currentBaseline?.entries ?? [])
    .filter((entry) => entry.evaluation.result === "NOT_ASSESSED")
    .map((entry) => entry.evaluation.aiAssessment)
    .filter((assessment) => assessment.status === "PENDING" || assessment.status === "RUNNING");
  if (!rows.length) return false;
  const lastActivity = Math.max(...rows.map((row) => Date.parse(row.updatedAt)));
  return Number.isFinite(lastActivity) && Date.now() - lastActivity < staleAiEvaluationMs;
}
/** Worker phase identifiers mapped to their `regulatory:phases` catalog key. */
const analysisPhaseKeys = {
  queued: "queued",
  planning: "planning",
  retrieval: "retrieval",
  "law-discovery": "lawDiscovery",
  "source-resolution": "sourceResolution",
  classification: "classification",
  classification_drafting: "classificationDrafting",
  classification_verifying: "classificationVerifying",
  classification_retrying: "classificationRetrying",
  finalizing: "finalizing",
} as const;

function analysisPhaseLabel(t: RegulatoryT, phase: string | null | undefined): string {
  const key = analysisPhaseKeys[(phase ?? "queued") as keyof typeof analysisPhaseKeys];
  return t(`phases.${key ?? "default"}`);
}

/**
 * Failure reasons only an operator can clear from server configuration
 * (env vars, deployment) — retrying is *guaranteed* to fail identically, so
 * no retry button. Everything else, including REGULATORY_MODEL_UNAVAILABLE,
 * can mean a timeout, a transient OpenAI error, or an actual outage, with no
 * way to tell them apart from the run's single errorCode — offering retry
 * costs nothing when it's transient and doesn't make a real outage worse.
 */
const administrativeErrorCodes = new Set([
  "NORMATIVE_RAG_DISABLED",
  "OPENAI_KEY_MISSING",
  "LLM_PROVIDER_MISSING",
]);

/** Translates a persisted `errorCode` into customer-facing copy in the interface language. */
export function analysisErrorMessage(code: string | null | undefined): string {
  const t = i18n.getFixedT(currentLanguage(), "regulatory");
  const parsed = regulatoryAnalysisErrorCodeSchema.safeParse(code);
  return t(`errors.${parsed.success ? parsed.data : "ANALYSIS_FAILED"}`);
}

export function analysisIsRetryable(code: string | null | undefined): boolean {
  return !code || !administrativeErrorCodes.has(code);
}

type RegulatoryCandidate = NonNullable<RegulatoryWatch["currentAnalysis"]>["candidates"][number];

/** The decision the review buttons would record for every candidate still awaiting one. A
 *  discovered law is retained as a law-level row; a platform provision still needs an extracted
 *  requirement before bulk approval can include it. */
export function pendingAiDecisions(
  candidates: readonly RegulatoryCandidate[],
): Array<{ candidateId: string; decision: "APPLICABLE" | "NOT_APPLICABLE" }> {
  return candidates
    .filter((candidate) => candidate.requiresReview && candidate.decision == null)
    .map((candidate) => ({
      candidateId: candidate.id,
      decision:
        candidate.source.type === "DISCOVERED_LAW" || candidate.requirement.status === "READY"
          ? ("APPLICABLE" as const)
          : ("NOT_APPLICABLE" as const),
    }));
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

function formatDate(format: Formatters, value: string | null | undefined): string {
  if (!value) return "—";
  return format.date(new Date(`${value.slice(0, 10)}T12:00:00.000Z`), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const actionStatuses = ["OPEN", "IN_PROGRESS", "DONE", "VERIFIED"] as const;

/** Display strings are resolved here, in the interface language; statuses stay keys. The
 *  effectiveness vocabulary matches the XLSX "Action efficace oui/non" column
 *  (`regulatory-watch-exporter.ts`), so the table and the file never disagree. */
export function regulatoryViewData(
  watch: RegulatoryWatch,
  t: RegulatoryT = i18n.getFixedT(currentLanguage(), "regulatory"),
  format: Formatters = formatters(currentLanguage()),
) {
  const language = currentLanguage();
  const entries = watch.currentBaseline?.entries ?? [];
  const groupedDocuments = new Map<string, RegulatoryDocument>();

  for (const entry of entries) {
    const key = entry.source.revisionId ?? entry.id;
    const requirementText = entry.requirement?.text ?? null;
    const articleReferences = requirementText
      ? [...requirementText.matchAll(/^((?:Article|Art\.)\s+[^:\n]+|\d+(?:\.\d+)+)\s*:/gimu)].map(
          (match) => match[1]!,
        )
      : [];
    const provision =
      entry.source.provisionIdentifier ??
      (articleReferences.length ? [...new Set(articleReferences)].join(" · ") : null) ??
      (entry.source.type === "DISCOVERED_LAW" ? t("view.articleToConfirm") : t("view.fullText"));
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
      kind: entry.source.documentFamily === "standard" ? "STANDARD" : "REGULATION",
      reference: entry.source.referenceNumber ?? entry.source.documentTitle,
      title: entry.source.documentTitle,
      jurisdiction: entry.source.countryCode
        ? countryName(entry.source.countryCode, language)
        : entry.source.jurisdiction || t("view.international"),
      provisions: provision,
      requirements: 1,
      source: entry.source.citationLabel,
      sourceUrl: entry.source.url,
      requirementText,
      sourceNeedsReview: entry.source.type === "DISCOVERED_LAW",
      status: "APPLICABLE",
      reason: entry.applicabilityRationale,
    });
  }

  const evaluationItems: RegulatoryEvaluation[] = entries.map((entry) => {
    const evidenceItems = entry.evaluation.evidence;
    const action = entry.evaluation.actions[0];
    const ai = entry.evaluation.aiAssessment;
    // The XLSX joins every preuve into one cell; the table now does the same instead of showing
    // only the first one.
    const evidenceLabels = evidenceItems.map(
      (item) => item.label ?? item.note ?? item.url ?? t("view.evidenceFallback"),
    );
    return {
      id: entry.evaluation.id,
      revision: entry.evaluation.revision,
      result: entry.evaluation.result,
      source: entry.source.referenceNumber ?? entry.source.documentTitle,
      provision:
        entry.source.provisionIdentifier ?? entry.source.provisionType ?? t("view.fullText"),
      requirement: entry.requirement?.text ?? t("view.requirementToRegenerate"),
      citation: entry.source.citationLabel,
      officialSourceText: entry.source.excerpt ?? t("view.sourceToAttach"),
      status: entry.evaluation.result,
      evidence: evidenceLabels.length ? evidenceLabels.join(" · ") : t("view.noEvidence"),
      action: action?.title ?? t("view.noAction"),
      owner: action?.assigneeName ?? t("view.unassigned"),
      dueDate: formatDate(format, action?.dueDate),
      effectiveness: t(`effectiveness.${action?.effectiveness ?? "PENDING"}`),
      resources: action?.resources ?? "—",
      completedDate: formatDate(format, action?.completedDate),
      effectivenessCriteria: action?.effectivenessCriteria ?? "—",
      comment: [entry.evaluation.comment, action?.comment].filter(Boolean).join("\n") || "—",
      evaluationComment: entry.evaluation.comment,
      evidenceItems: evidenceItems.map((item) => ({
        id: item.id,
        kind: item.kind,
        fileId: item.fileId,
        label: item.label,
        url: item.url,
        note: item.note,
      })),
      primaryAction: action
        ? {
            id: action.id,
            title: action.title,
            assigneeId: action.assigneeId,
            assigneeName: action.assigneeName,
            resources: action.resources,
            dueDate: action.dueDate,
            completedDate: action.completedDate,
            status: action.status,
            effectivenessCriteria: action.effectivenessCriteria,
            effectiveness: action.effectiveness,
            comment: action.comment,
          }
        : null,
      additionalActionCount: Math.max(0, entry.evaluation.actions.length - 1),
      aiStatus: ai?.status ?? "PENDING",
      aiSuggestedStatus: ai?.suggestedResult ?? undefined,
      aiSuggestedResult: ai?.suggestedResult ?? null,
      aiRationale: ai?.rationale ?? null,
      aiConfidence: ai?.confidence ?? null,
      aiMatchedProfileKeys: ai?.matchedProfileKeys ?? [],
      aiMissingInformation: ai?.missingInformation ?? [],
      aiRemediationPlan: ai?.remediationPlan ?? null,
      aiAction: ai?.action,
    };
  });

  const evaluated = evaluationItems.filter((item) => item.status !== "NOT_ASSESSED").length;
  // The conformity pass writes the result itself, so "assessed" and "confirmed by a person" are
  // different numbers and the register reports both.
  const humanValidated = entries.filter((entry) => entry.evaluation.evaluatedAt !== null).length;
  const conforming = evaluationItems.filter((item) => item.status === "CONFORMING").length;
  const partial = evaluationItems.filter((item) => item.status === "PARTIAL").length;
  const nonConforming = evaluationItems.filter((item) => item.status === "NON_CONFORMING").length;
  const aiAssessed = evaluationItems.filter((item) => item.aiStatus === "COMPLETED").length;
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
      aiAssessed,
      humanValidated,
      compliancePercent: evaluated === 0 ? 0 : Math.round((conforming / evaluated) * 100),
      openActions,
    },
  };
}

function PageSkeleton() {
  const { t } = useTranslation("regulatory");
  return (
    <section aria-label={t("states.loading")} className="mx-auto w-full max-w-[1440px] space-y-5">
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
  tone = "plain",
}: {
  children: React.ReactNode;
  tone?: "plain" | "light";
}) {
  // "plain" is the simple centred layout shared with Analyse des enjeux: no
  // card, content sits directly on the page background.
  return (
    <section
      className={cn(
        "relative mx-auto w-full max-w-[1180px] text-slate-950",
        tone === "light" &&
          "min-h-[620px] overflow-hidden rounded-[32px] border border-slate-200 bg-white p-6 sm:p-10 lg:p-14",
      )}
    >
      {children}
    </section>
  );
}

function StateIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="mx-auto grid size-16 place-items-center rounded-3xl border border-violet-200 bg-violet-50 text-violet-600">
      {children}
    </span>
  );
}

function IncompleteProfileState({ profile }: { profile: ProjectProfile }) {
  const { t } = useTranslation("regulatory");
  return (
    <StateShell>
      <div className="mx-auto flex max-w-2xl flex-col items-center py-16 text-center">
        <StateIcon>
          <BotIcon className="size-7" aria-hidden="true" />
        </StateIcon>
        <Badge className="mt-6" variant="outline">
          {t("states.profileStep")}
        </Badge>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">
          {t("states.completeProfile", { project: profile.project.name })}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">{t("states.completeProfileBody")}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button
            nativeButton={false}
            render={<Link to={`/projects/${profile.project.slug}/chat`} />}
          >
            <MessageSquareTextIcon aria-hidden="true" /> {t("states.continueAssistant")}{" "}
            <ArrowRightIcon aria-hidden="true" className="rtl:rotate-180" />
          </Button>
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link to={`/projects/${profile.project.slug}/profile`} />}
          >
            {t("states.openProfile")}
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
  const { t } = useTranslation("regulatory");
  return (
    <StateShell>
      <div className="mx-auto max-w-3xl py-16">
        <div className="text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-3xl border border-emerald-200 bg-emerald-50 text-emerald-600">
            <ShieldCheckIcon className="size-7" aria-hidden="true" />
          </span>
          <Badge
            className="mt-6 border-emerald-200 bg-emerald-50 text-emerald-700"
            variant="outline"
          >
            <CheckIcon /> {t("states.profileFinalized")}
          </Badge>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">
            {t("states.readyTitle")}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-500">
            {t("states.readyBody", { project: profile.project.name })}
          </p>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {[
            {
              icon: SearchCheckIcon,
              title: t("states.stepSearch"),
              text: t("states.stepSearchBody"),
            },
            {
              icon: SparklesIcon,
              title: t("states.stepApplicability"),
              text: t("states.stepApplicabilityBody"),
            },
            {
              icon: FileCheck2Icon,
              title: t("states.stepHuman"),
              text: t("states.stepHumanBody"),
            },
          ].map((step, index) => (
            <article className="rounded-2xl border border-slate-200 bg-white p-5" key={step.title}>
              <span className="grid size-9 place-items-center rounded-xl bg-violet-50 text-violet-600">
                <step.icon className="size-4" aria-hidden="true" />
              </span>
              <p className="mt-4 text-sm font-semibold text-slate-950">
                {index + 1}. {step.title}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{step.text}</p>
            </article>
          ))}
        </div>
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
        <div className="mt-8 text-center">
          <Button disabled={pending} onClick={onStart}>
            {pending ? <LoaderCircleIcon className="animate-spin" /> : <ScaleIcon />}{" "}
            {pending ? t("states.starting") : t("states.start")}
          </Button>
          <p className="mt-3 text-[11px] text-slate-500">{t("states.backgroundHint")}</p>
        </div>
      </div>
    </StateShell>
  );
}

function ProcessingState({ watch }: { watch: RegulatoryWatch }) {
  const { t } = useTranslation("regulatory");
  const analysis = watch.currentAnalysis;
  const progress = analysis?.progressPercent ?? 5;
  return (
    <StateShell>
      <div className="mx-auto flex max-w-2xl flex-col items-center py-16 text-center">
        <StateIcon>
          <LoaderCircleIcon className="size-7 animate-spin" aria-hidden="true" />
        </StateIcon>
        <Badge className="mt-6" variant="outline">
          {t("states.analysisRunning")}
        </Badge>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">
          {t("states.preparing")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          {analysisPhaseLabel(t, analysis?.phase)}
        </p>
        <div className="mt-6 w-full max-w-md text-start">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">{t("states.progress")}</span>
            <span className="font-semibold text-slate-950">{progress}%</span>
          </div>
          <Progress
            className="mt-2 [&_[data-slot=progress-indicator]]:bg-violet-600 [&_[data-slot=progress-track]]:bg-slate-200"
            value={progress}
          />
        </div>
        <p className="mt-5 flex items-center gap-2 text-xs text-slate-500">
          <Clock3Icon className="size-3.5" aria-hidden="true" /> {t("states.autoRefresh")}
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
  const { t } = useTranslation("regulatory");
  const questions = (watch.currentAnalysis?.clarifications ?? []).filter(
    (item) => item.answer == null,
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const complete = questions.length > 0 && questions.every((item) => answers[item.key]?.trim());
  return (
    <StateShell tone="light">
      <SourceRequired watch={watch} />
      <div className="mx-auto max-w-2xl py-8">
        <span className="grid size-12 place-items-center rounded-2xl bg-amber-50 text-amber-700">
          <CircleAlertIcon className="size-5" />
        </span>
        <Badge className="mt-5 border-amber-200 bg-amber-50 text-amber-800" variant="outline">
          {t("states.clarificationNeeded")}
        </Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          {t("states.clarificationTitle")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">{t("states.clarificationBody")}</p>
        <div className="mt-7 space-y-4">
          {questions.map((item, index) => (
            <label className="block rounded-2xl border border-slate-200 p-4" key={item.key}>
              <span className="text-xs font-semibold text-slate-400">
                {t("states.question", { number: index + 1 })}
              </span>
              <span className="mt-1 block text-sm font-medium leading-6 text-slate-800">
                {item.question}
              </span>
              <Input
                className="mt-3 h-11 rounded-xl border-slate-200 bg-slate-50"
                onChange={(event) =>
                  setAnswers((current) => ({ ...current, [item.key]: event.target.value }))
                }
                placeholder={t("states.answerPlaceholder")}
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
          {pending ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : (
            <ArrowRightIcon className="rtl:rotate-180" />
          )}{" "}
          {t("states.resume")}
        </Button>
      </div>
    </StateShell>
  );
}

export function SourceRequired({ watch }: { watch: RegulatoryWatch }) {
  const { t } = useTranslation("regulatory");
  const leads = watch.currentAnalysis?.sourceRequired ?? [];
  if (!leads.length) return null;
  return (
    <aside
      className="my-5 rounded-xl border border-amber-200 bg-amber-50 p-5"
      aria-label={t("states.sourcesToGet")}
    >
      <h2 className="font-semibold text-amber-950">{t("states.sourceRequired")}</h2>
      <p className="mt-2 text-sm text-amber-900">{t("states.sourceRequiredBody")}</p>
      <ul className="mt-3 space-y-3">
        {leads.map((lead) => (
          <li key={`${lead.reference}:${lead.title}`}>
            <p className="text-sm font-medium">
              {lead.reference} — {lead.title}
            </p>
            <p className="text-sm text-amber-900">{lead.reason}</p>
            {lead.sourceUrl && (
              <a
                className="mt-1 inline-block text-sm font-medium text-amber-950 underline underline-offset-2"
                href={lead.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                {t("states.viewWebSource")}
              </a>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function AnalysisReviewState({
  watch,
  pending,
  error,
  onSubmit,
  onSkip,
}: {
  watch: RegulatoryWatch;
  pending: boolean;
  error: string | undefined;
  onSubmit: (rating: number, comment: string | null) => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation("regulatory");
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const discoveries = useMemo(() => {
    const grouped = new Map<
      string,
      {
        reference: string;
        title: string;
        reasons: string[];
        requirements: Array<{ reference: string | null; text: string }>;
        sourceUrl: string | null;
        citationLabel: string;
        sourceType: RegulatoryCandidate["source"]["type"];
      }
    >();
    for (const candidate of watch.currentAnalysis?.candidates ?? []) {
      const reference = candidate.source.referenceNumber ?? candidate.source.documentTitle;
      const key = `${reference}:${candidate.source.documentTitle}`;
      const existing = grouped.get(key);
      const discovery = existing ?? {
        reference,
        title: candidate.source.documentTitle,
        reasons: [],
        requirements: [],
        sourceUrl: candidate.source.url ?? null,
        citationLabel:
          candidate.source.citationLabel ?? `${reference} — ${candidate.source.documentTitle}`,
        sourceType: candidate.source.type ?? "DISCOVERED_LAW",
      };
      if (!discovery.reasons.includes(candidate.rationale)) {
        discovery.reasons.push(candidate.rationale);
      }
      const requirementText = candidate.requirement?.text;
      if (
        requirementText &&
        !discovery.requirements.some(
          (requirement) =>
            requirement.reference === candidate.source.provisionIdentifier &&
            requirement.text === requirementText,
        )
      ) {
        discovery.requirements.push({
          reference: candidate.source.provisionIdentifier ?? null,
          text: requirementText,
        });
      }
      discovery.sourceUrl ??= candidate.source.url ?? null;
      grouped.set(key, discovery);
    }
    return [...grouped.values()];
  }, [watch.currentAnalysis?.candidates]);

  return (
    <StateShell tone="light">
      <SourceRequired watch={watch} />
      <div className="mx-auto max-w-3xl py-8">
        <Badge className="border-violet-200 bg-violet-50 text-violet-700" variant="outline">
          <SparklesIcon /> {t("discovery.done")}
        </Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{t("discovery.title")}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">{t("discovery.body")}</p>

        <ul
          aria-label={t("discovery.texts")}
          className="mt-7 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3"
        >
          {discoveries.map((discovery) => (
            <li key={`${discovery.reference}:${discovery.title}`}>
              <article className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                <p className="text-xs font-semibold text-violet-700">{discovery.reference}</p>
                {discovery.title !== discovery.reference && (
                  <h2 className="mt-1 text-sm font-semibold text-slate-900">{discovery.title}</h2>
                )}

                <div className="mt-3">
                  <p className="text-xs font-semibold text-slate-700">{t("discovery.why")}</p>
                  {discovery.reasons.map((reason) => (
                    <p className="mt-1 text-sm leading-6 text-slate-600" key={reason}>
                      {reason}
                    </p>
                  ))}
                </div>

                <div className="mt-4 rounded-lg border border-violet-100 bg-violet-50/60 p-3">
                  <p className="text-xs font-semibold text-violet-900">
                    {t("discovery.requirements")}
                  </p>
                  {discovery.requirements.length ? (
                    <div className="mt-2 space-y-3">
                      {discovery.requirements.map((requirement, index) => (
                        <div key={`${requirement.reference ?? "requirement"}:${index}`}>
                          {requirement.reference && (
                            <p className="text-xs font-semibold text-violet-700">
                              {requirement.reference}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                            {requirement.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs italic leading-5 text-slate-500">
                      {t("discovery.noArticle")}
                    </p>
                  )}
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3">
                  {discovery.sourceUrl ? (
                    <a
                      className="text-xs font-semibold text-violet-700 underline underline-offset-2 hover:text-violet-900"
                      href={discovery.sourceUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {t("discovery.officialSource")}
                    </a>
                  ) : discovery.sourceType === "PLATFORM_PROVISION" ? (
                    <p className="text-xs text-slate-500">
                      {t("discovery.platformSource", { citation: discovery.citationLabel })}
                    </p>
                  ) : (
                    <p className="text-xs italic text-slate-400">
                      {t("discovery.sourceToConfirm")}
                    </p>
                  )}
                </div>
              </article>
            </li>
          ))}
          {!discoveries.length && (
            <li className="p-5 text-center text-sm text-slate-500">{t("discovery.none")}</li>
          )}
        </ul>

        <fieldset className="mt-7">
          <legend className="text-sm font-semibold text-slate-900">{t("discovery.quality")}</legend>
          <div
            className="mt-3 flex flex-wrap gap-2"
            role="radiogroup"
            aria-label={t("discovery.rating")}
          >
            {[0, 1, 2, 3, 4, 5].map((value) => (
              <button
                aria-checked={rating === value}
                aria-label={t("discovery.stars", { count: value })}
                className={cn(
                  "flex h-11 min-w-14 items-center justify-center gap-1 rounded-xl border px-3 text-sm font-semibold transition-colors",
                  rating === value
                    ? "border-violet-600 bg-violet-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-violet-300",
                )}
                disabled={pending}
                key={value}
                onClick={() => setRating(value)}
                role="radio"
                type="button"
              >
                {value}{" "}
                <StarIcon className="size-3.5" fill={rating === value ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">{t("discovery.scale")}</p>
        </fieldset>

        <label className="mt-6 block text-sm font-semibold text-slate-900">
          {t("discovery.commentLabel")}{" "}
          <span className="font-normal text-slate-400">{t("discovery.optional")}</span>
          <Textarea
            className="mt-2 min-h-28 rounded-xl border-slate-200 bg-white"
            maxLength={4000}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t("discovery.commentPlaceholder")}
            value={comment}
          />
        </label>
        {error && (
          <p className="mt-4 text-sm text-rose-700" role="alert">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
          <Button disabled={pending} onClick={onSkip} variant="ghost">
            {t("discovery.skip")}
          </Button>
          <Button
            className="h-11 rounded-xl bg-violet-600 px-5 hover:bg-violet-500"
            disabled={rating === null || pending}
            onClick={() => rating !== null && onSubmit(rating, trimmedOrNull(comment))}
          >
            {pending ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <ArrowRightIcon className="rtl:rotate-180" />
            )}
            {t("discovery.submit")}
          </Button>
        </div>
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
  onDecideAll,
  onPublish,
  onRerun,
}: {
  watch: RegulatoryWatch;
  deciding: boolean;
  publishing: boolean;
  error: string | undefined;
  onDecision: (
    candidateId: string,
    decision: "APPLICABLE" | "NOT_APPLICABLE",
    requirementText?: string,
  ) => void;
  onDecideAll: (
    decisions: Array<{ candidateId: string; decision: "APPLICABLE" | "NOT_APPLICABLE" }>,
  ) => void;
  onPublish: () => void;
  onRerun: () => void;
}) {
  const { t } = useTranslation("regulatory");
  const candidates = watch.currentAnalysis?.candidates ?? [];
  const partial = watch.currentAnalysis?.status === "PARTIAL";
  const groups = ["ADDED", "MODIFIED", "REMOVAL_PROPOSED", "UNCHANGED"] as const;
  const firstPopulated = groups.find((group) =>
    candidates.some((candidate) => candidate.changeType === group),
  );
  const [selectedGroup, setSelectedGroup] = useState<(typeof groups)[number]>(
    firstPopulated ?? "ADDED",
  );
  const pending = pendingAiDecisions(candidates);
  const remaining = pending.length;
  const pendingApplicable = pending.filter((item) => item.decision === "APPLICABLE").length;
  const blocked = candidates.filter(
    (candidate) => candidate.requirement.status === "SOURCE_REVIEW_REQUIRED",
  );
  const canPublish =
    remaining === 0 && candidates.some((candidate) => candidate.decision === "APPLICABLE");
  return (
    <StateShell tone="light">
      <div className="mx-auto max-w-4xl py-3">
        <SourceRequired watch={watch} />
        <Badge className="border-violet-200 bg-violet-50 text-violet-700" variant="outline">
          <SparklesIcon /> {partial ? t("review.partial") : t("review.ready")}
        </Badge>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {AUTO_APPLICABLE ? t("review.checkTitle") : t("review.validateTitle")}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {AUTO_APPLICABLE ? t("review.autoBody") : t("review.manualBody")}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            {!AUTO_APPLICABLE && (
              <span className="text-xs font-semibold text-slate-500">
                {t("review.remaining", { count: remaining })}
              </span>
            )}
            {remaining > 0 && (
              <>
                <Button
                  className="h-9 rounded-xl"
                  disabled={deciding || publishing}
                  onClick={() => onDecideAll(pending)}
                  variant="outline"
                >
                  {deciding ? <LoaderCircleIcon className="animate-spin" /> : <ListChecksIcon />}{" "}
                  {t("review.validateAll", { count: remaining })}
                </Button>
                <p className="max-w-xs text-[11px] leading-4 text-slate-400 sm:text-end">
                  {t("review.validateAllHint", {
                    applicable: pendingApplicable,
                    others: remaining - pendingApplicable,
                  })}
                </p>
              </>
            )}
          </div>
        </div>
        {blocked.length > 0 && (
          <div
            role="alert"
            className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          >
            <p className="font-semibold">{t("review.sourcesToCheck", { count: blocked.length })}</p>
            <p className="mt-1 text-xs leading-5 text-rose-700">{t("review.sourcesToCheckBody")}</p>
            <Button
              className="mt-3 bg-white"
              disabled={deciding || publishing}
              onClick={onRerun}
              size="sm"
              variant="outline"
            >
              <RefreshCwIcon /> {t("review.rerun")}
            </Button>
          </div>
        )}
        <Tabs
          className="mt-7 gap-4"
          value={selectedGroup}
          onValueChange={(value) => setSelectedGroup(value as typeof selectedGroup)}
        >
          <TabsList className="grid w-full grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1 group-data-horizontal/tabs:h-auto lg:grid-cols-4">
            {groups.map((group) => (
              <TabsTrigger
                className="h-auto min-h-10 whitespace-normal rounded-xl px-2 py-2 text-xs"
                key={group}
                value={group}
              >
                {t(`review.groups.${group}`)}
                <span className="rounded-md bg-white/70 px-1.5 py-0.5 text-[10px]">
                  {candidates.filter((candidate) => candidate.changeType === group).length}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="max-h-[470px] space-y-3 overflow-y-auto pe-1">
            {candidates
              .filter((candidate) => candidate.changeType === selectedGroup)
              .map((candidate) => (
                <article
                  className="rounded-2xl border border-slate-200 p-4 sm:p-5"
                  key={candidate.id}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-violet-700">
                        {candidate.source.referenceNumber ?? candidate.source.documentTitle} ·{" "}
                        {candidate.source.provisionIdentifier}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {candidate.source.documentTitle}
                      </p>
                      {candidate.changeSummary && (
                        <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
                          {candidate.changeSummary}
                        </p>
                      )}
                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            {t("review.citation")}
                          </p>
                          <p className="mt-2 text-xs font-semibold text-slate-700">
                            {candidate.source.citationLabel}
                          </p>
                          {candidate.source.type === "DISCOVERED_LAW" ? (
                            candidate.source.url ? (
                              <a
                                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900"
                                href={candidate.source.url}
                                rel="noreferrer"
                                target="_blank"
                              >
                                {t("review.officialSource")}
                              </a>
                            ) : (
                              <p className="mt-2 text-xs italic text-slate-400">
                                {t("review.sourceToAttach")}
                              </p>
                            )
                          ) : (
                            <p className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-slate-600">
                              {candidate.source.excerpt}
                            </p>
                          )}
                        </section>
                        <section
                          aria-label={t("review.aiDecision", {
                            id: candidate.source.provisionIdentifier ?? candidate.id,
                          })}
                          className="rounded-xl border border-violet-200 bg-violet-50/40 p-3"
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-700">
                            {t("review.extracted")}
                          </p>
                          {candidate.requirement.text ? (
                            <p className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-slate-700">
                              {candidate.requirement.text}
                            </p>
                          ) : (
                            <p className="mt-2 text-xs italic text-slate-400">
                              {t("review.noRequirement")}
                            </p>
                          )}
                          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-violet-700">
                            {t("review.explanation")}
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                            {candidate.rationale}
                          </p>
                        </section>
                      </div>
                      {candidate.requirement.issues.length > 0 && (
                        <ul
                          className="mt-3 list-disc space-y-1 rounded-xl bg-rose-50 px-7 py-3 text-xs text-rose-700"
                          lang="fr"
                        >
                          {candidate.requirement.issues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
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
                          onClick={() => onDecision(candidate.id, "NOT_APPLICABLE")}
                          variant="outline"
                        >
                          <XIcon />
                          {candidate.changeType === "REMOVAL_PROPOSED"
                            ? t("review.confirmRemoval")
                            : t("review.notApplicable")}
                        </Button>
                        <Button
                          className={cn(
                            "h-9 rounded-xl",
                            candidate.decision === "APPLICABLE"
                              ? "bg-emerald-600 hover:bg-emerald-600"
                              : "bg-slate-950 hover:bg-slate-800",
                          )}
                          onClick={() =>
                            onDecision(
                              candidate.id,
                              "APPLICABLE",
                              candidate.source.type === "DISCOVERED_LAW" ||
                                candidate.requirement.text
                                ? undefined
                                : (candidate.source.excerpt ?? undefined),
                            )
                          }
                        >
                          <CheckIcon />
                          {candidate.changeType === "REMOVAL_PROPOSED"
                            ? t("review.keep")
                            : t("review.applicable")}
                        </Button>
                      </div>
                    ) : candidate.decision === "NOT_APPLICABLE" ? (
                      <Badge
                        className="shrink-0 border-slate-200 bg-slate-100 text-slate-600"
                        variant="outline"
                      >
                        <XIcon /> {t("review.notApplicableAi")}
                      </Badge>
                    ) : (
                      <Badge
                        className="shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700"
                        variant="outline"
                      >
                        <CheckIcon /> {t("review.keptAutomatically")}
                      </Badge>
                    )}
                  </div>
                </article>
              ))}
            {candidates.every((candidate) => candidate.changeType !== selectedGroup) && (
              <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                {t("review.emptyGroup")}
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
            {partial ? t("review.publishPartial") : t("review.publishFull")}
          </p>
          <Button
            className="h-11 rounded-xl bg-violet-600 px-5 hover:bg-violet-500"
            disabled={!canPublish || publishing || deciding}
            onClick={onPublish}
          >
            {publishing ? <LoaderCircleIcon className="animate-spin" /> : <FileCheck2Icon />}{" "}
            {t("review.publish")}
          </Button>
        </div>
      </div>
    </StateShell>
  );
}

/** Draft of the single action row the sheet edits, kept as plain strings so the inputs stay
 *  controlled and an untouched field is byte-identical to what was seeded. */
type ActionDraft = {
  title: string;
  responsibleName: string;
  resources: string;
  dueDate: string;
  completedDate: string;
  status: "OPEN" | "IN_PROGRESS" | "DONE" | "VERIFIED";
  effectivenessCriteria: string;
  effectiveness: "PENDING" | "EFFECTIVE" | "INEFFECTIVE";
  comment: string;
};

type EvidenceDraft = {
  /** `null` for a row the reviewer just added and that has no server id yet. */
  id: string | null;
  key: string;
  kind: "DOCUMENT" | "PHOTO" | "NOTE" | "LINK";
  label: string;
  url: string;
  note: string;
  removed: boolean;
};

export type EvaluationSaveInput = {
  evaluationId: string;
  revision: number;
  result: "CONFORMING" | "PARTIAL" | "NON_CONFORMING";
  comment: string | null;
  /** `null` when the action block was left untouched — the save then skips the action call. */
  action: {
    id: string | null;
    title: string;
    responsibleName: string | null;
    resources: string | null;
    dueDate: string | null;
    completedDate: string | null;
    status: "OPEN" | "IN_PROGRESS" | "DONE" | "VERIFIED";
    effectivenessCriteria: string | null;
    effectiveness: "PENDING" | "EFFECTIVE" | "INEFFECTIVE";
    comment: string | null;
  } | null;
  evidence: {
    created: Array<{
      kind: "NOTE" | "LINK";
      label: string | null;
      url: string | null;
      note: string | null;
    }>;
    updated: Array<{
      id: string;
      label: string | null;
      url?: string | null;
      note?: string | null;
    }>;
    deletedIds: string[];
  };
};

const emptyActionDraft: ActionDraft = {
  title: "",
  responsibleName: "",
  resources: "",
  dueDate: "",
  completedDate: "",
  status: "OPEN",
  effectivenessCriteria: "",
  effectiveness: "PENDING",
  comment: "",
};

function actionDraftFrom(action: RegulatoryActionRow | null | undefined): ActionDraft {
  if (!action) return emptyActionDraft;
  return {
    title: action.title,
    // The conformity pass proposes a free-text responsable; a linked platform user wins over it,
    // exactly like the register and the export read it.
    responsibleName: action.assigneeName ?? "",
    resources: action.resources ?? "",
    dueDate: action.dueDate ?? "",
    completedDate: action.completedDate ?? "",
    status: action.status,
    effectivenessCriteria: action.effectivenessCriteria ?? "",
    effectiveness: action.effectiveness,
    comment: action.comment ?? "",
  };
}

function evidenceDraftsFrom(items: RegulatoryEvidenceItem[] | undefined): EvidenceDraft[] {
  return (items ?? []).map((item) => ({
    id: item.id,
    key: item.id,
    kind: item.kind,
    label: item.label ?? "",
    url: item.url ?? "",
    note: item.note ?? "",
    removed: false,
  }));
}

function trimmedOrNull(value: string): string | null {
  return value.trim() ? value.trim() : null;
}

const fieldLabelClass = "block text-xs font-medium text-slate-500";
const fieldControlClass =
  "mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm";

function AiEvaluationSheet({
  evaluation,
  saving,
  onClose,
  onSave,
}: {
  evaluation: RegulatoryEvaluation | null;
  saving: boolean;
  onClose: () => void;
  onSave: (input: EvaluationSaveInput) => Promise<void>;
}) {
  const { t } = useTranslation("regulatory");
  const format = useFormat();
  const [result, setResult] = useState<"CONFORMING" | "PARTIAL" | "NON_CONFORMING">(
    "NON_CONFORMING",
  );
  const [comment, setComment] = useState("");
  const [actionDraft, setActionDraft] = useState<ActionDraft>(emptyActionDraft);
  const [evidenceDrafts, setEvidenceDrafts] = useState<EvidenceDraft[]>([]);
  const [validationError, setValidationError] = useState<string>();
  const evaluationId = evaluation?.id;
  const suggestedResult = evaluation?.aiSuggestedResult;
  const humanResult = evaluation?.result;

  // Seeded from the identity and the assessment rather than from the object, because the sheet
  // now reads live data: a plain `[evaluation]` dependency would reset the reviewer's choice on
  // every 2s poll. Re-seeding when the suggestion lands is intentional — it is what the sheet
  // was waiting for — but the comment survives it.
  useEffect(() => {
    if (!evaluationId) return;
    setResult(
      suggestedResult && suggestedResult !== "NOT_ASSESSED"
        ? suggestedResult
        : humanResult && humanResult !== "NOT_ASSESSED"
          ? humanResult
          : "NON_CONFORMING",
    );
  }, [evaluationId, suggestedResult, humanResult]);

  // Keyed on the row identity only: the action and evidence editors must never be reseeded by the
  // 2s poll, or a reviewer's half-typed plan would vanish under them.
  const seededAction = evaluation?.primaryAction;
  const seededEvidence = evaluation?.evidenceItems;
  const seededComment = evaluation?.evaluationComment;
  useEffect(() => {
    if (!evaluationId) return;
    setComment(seededComment ?? "");
    setActionDraft(actionDraftFrom(seededAction));
    setEvidenceDrafts(evidenceDraftsFrom(seededEvidence));
    setValidationError(undefined);
  }, [evaluationId]);

  const initialActionDraft = useMemo(() => actionDraftFrom(seededAction), [evaluationId]);
  const actionDirty = useMemo(
    () => JSON.stringify(actionDraft) !== JSON.stringify(initialActionDraft),
    [actionDraft, initialActionDraft],
  );

  function updateAction<K extends keyof ActionDraft>(key: K, value: ActionDraft[K]) {
    setActionDraft((current) => ({ ...current, [key]: value }));
  }

  function updateEvidence(key: string, patch: Partial<EvidenceDraft>) {
    setEvidenceDrafts((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function buildSaveInput(): EvaluationSaveInput | string {
    const title = actionDraft.title.trim();
    const hasOtherActionValues = Boolean(
      actionDraft.responsibleName.trim() ||
      actionDraft.resources.trim() ||
      actionDraft.dueDate ||
      actionDraft.completedDate ||
      actionDraft.effectivenessCriteria.trim() ||
      actionDraft.comment.trim() ||
      actionDraft.effectiveness !== "PENDING" ||
      actionDraft.status !== "OPEN",
    );
    if (!title && hasOtherActionValues) return t("sheet.actionTitleRequired");
    if (title && title.length < 2) return t("sheet.actionTitleShort");

    const created: EvaluationSaveInput["evidence"]["created"] = [];
    const updated: EvaluationSaveInput["evidence"]["updated"] = [];
    const deletedIds: string[] = [];
    const seeded = new Map(evidenceDraftsFrom(seededEvidence).map((item) => [item.key, item]));
    for (const draft of evidenceDrafts) {
      if (draft.removed) {
        if (draft.id) deletedIds.push(draft.id);
        continue;
      }
      if (draft.kind === "NOTE" && !draft.note.trim()) return t("sheet.noteRequired");
      if (draft.kind === "LINK" && !draft.url.trim()) return t("sheet.linkRequired");
      if (!draft.id) {
        created.push({
          kind: draft.kind === "LINK" ? "LINK" : "NOTE",
          label: trimmedOrNull(draft.label),
          url: draft.kind === "LINK" ? draft.url.trim() : null,
          note: draft.kind === "LINK" ? null : draft.note.trim(),
        });
        continue;
      }
      const before = seeded.get(draft.key);
      const changed =
        before &&
        (before.label !== draft.label || before.url !== draft.url || before.note !== draft.note);
      if (!changed) continue;
      // Only the fields this kind owns are patched, so the server-side merged-record check never
      // sees a NOTE stripped of its note or a LINK stripped of its url.
      updated.push({
        id: draft.id,
        label: trimmedOrNull(draft.label),
        ...(draft.kind === "LINK" ? { url: draft.url.trim() } : {}),
        ...(draft.kind === "NOTE" ? { note: draft.note.trim() } : {}),
      });
    }

    return {
      evaluationId: evaluation!.id,
      revision: evaluation!.revision ?? 1,
      result,
      comment: trimmedOrNull(comment),
      action:
        actionDirty && title
          ? {
              id: seededAction?.id ?? null,
              title,
              responsibleName: trimmedOrNull(actionDraft.responsibleName),
              resources: trimmedOrNull(actionDraft.resources),
              dueDate: actionDraft.dueDate || null,
              completedDate: actionDraft.completedDate || null,
              status: actionDraft.status,
              effectivenessCriteria: trimmedOrNull(actionDraft.effectivenessCriteria),
              effectiveness: actionDraft.effectiveness,
              comment: trimmedOrNull(actionDraft.comment),
            }
          : null,
      evidence: { created, updated, deletedIds },
    };
  }

  const ai = evaluation?.aiStatus;
  return (
    <Sheet open={Boolean(evaluation)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[min(96vw,680px)]! sm:max-w-[680px]!">
        {evaluation && (
          <>
            <SheetHeader className="border-b border-slate-100 pe-16">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{t(`evaluationStatus.${evaluation.status}`)}</Badge>
                {evaluation.aiSuggestedStatus && (
                  <Badge
                    className="border-violet-200 bg-violet-50 text-violet-700"
                    variant="outline"
                  >
                    <SparklesIcon />{" "}
                    {t("sheet.ai", {
                      status: t(`evaluationStatus.${evaluation.aiSuggestedStatus}`),
                    })}
                  </Badge>
                )}
              </div>
              <SheetTitle className="text-lg font-semibold">{evaluation.provision}</SheetTitle>
              <SheetDescription>{evaluation.source}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
              <section>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {t("sheet.requirement")}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-800">{evaluation.requirement}</p>
              </section>

              {evaluation.officialSourceText && (
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {t("sheet.traceability")}
                  </p>
                  {evaluation.citation && (
                    <p className="mt-2 text-xs font-semibold text-slate-700">
                      {evaluation.citation}
                    </p>
                  )}
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                    {evaluation.officialSourceText}
                  </p>
                </section>
              )}

              <section className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                    <FileCheck2Icon className="size-4" /> {t("sheet.evidence")}
                  </p>
                  <Button
                    className="h-8 bg-white"
                    onClick={() =>
                      setEvidenceDrafts((current) => [
                        ...current,
                        {
                          id: null,
                          key: `new-${current.length}-${Date.now()}`,
                          kind: "NOTE",
                          label: "",
                          url: "",
                          note: "",
                          removed: false,
                        },
                      ])
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <PlusIcon /> {t("sheet.add")}
                  </Button>
                </div>
                <div className="mt-3 space-y-3">
                  {evidenceDrafts.filter((item) => !item.removed).length === 0 && (
                    <p className="text-sm text-emerald-950/60">{t("sheet.noEvidence")}</p>
                  )}
                  {evidenceDrafts.map((draft) =>
                    draft.removed ? null : (
                      <div
                        className="rounded-xl border border-emerald-200 bg-white p-3"
                        key={draft.key}
                      >
                        <div className="flex items-center justify-between gap-2">
                          {draft.id ? (
                            <Badge className="bg-emerald-50 text-emerald-800" variant="outline">
                              {t(`evidenceKind.${draft.kind}`)}
                            </Badge>
                          ) : (
                            <select
                              aria-label={t("sheet.evidenceType")}
                              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs"
                              onChange={(event) =>
                                updateEvidence(draft.key, {
                                  kind: event.target.value as "NOTE" | "LINK",
                                })
                              }
                              value={draft.kind}
                            >
                              <option value="NOTE">{t("evidenceKind.NOTE")}</option>
                              <option value="LINK">{t("evidenceKind.LINK")}</option>
                            </select>
                          )}
                          <Button
                            aria-label={t("sheet.removeEvidence")}
                            className="size-8 text-slate-400 hover:text-rose-700"
                            onClick={() => updateEvidence(draft.key, { removed: true })}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        </div>
                        <label className={cn(fieldLabelClass, "mt-3")}>
                          {t("sheet.label")}
                          <Input
                            className="mt-1 h-9"
                            onChange={(event) =>
                              updateEvidence(draft.key, { label: event.target.value })
                            }
                            placeholder={t("sheet.labelPlaceholder")}
                            value={draft.label}
                          />
                        </label>
                        {draft.kind === "LINK" ? (
                          <label className={cn(fieldLabelClass, "mt-3")}>
                            {t("sheet.link")}
                            <Input
                              className="mt-1 h-9"
                              onChange={(event) =>
                                updateEvidence(draft.key, { url: event.target.value })
                              }
                              placeholder="https://…"
                              value={draft.url}
                            />
                          </label>
                        ) : draft.kind === "NOTE" ? (
                          <label className={cn(fieldLabelClass, "mt-3")}>
                            {t("sheet.note")}
                            <Textarea
                              className="mt-1 min-h-16"
                              onChange={(event) =>
                                updateEvidence(draft.key, { note: event.target.value })
                              }
                              placeholder={t("sheet.notePlaceholder")}
                              value={draft.note}
                            />
                          </label>
                        ) : (
                          <p className="mt-3 text-xs text-slate-500">{t("sheet.attachedFile")}</p>
                        )}
                      </div>
                    ),
                  )}
                </div>
              </section>

              {(ai === "PENDING" || ai === "RUNNING") && (
                <section className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800">
                  <LoaderCircleIcon className="size-4 animate-spin" /> {t("sheet.aiRunning")}
                </section>
              )}
              {ai === "FAILED" && (
                <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  {t("sheet.aiFailed")}
                </section>
              )}
              {ai === "COMPLETED" && (
                <section className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 text-xs font-semibold text-violet-900">
                        <BotIcon className="size-4" /> {t("sheet.aiToValidate")}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-violet-950/80">
                        {evaluation.aiRationale}
                      </p>
                    </div>
                    {evaluation.aiConfidence !== null && evaluation.aiConfidence !== undefined && (
                      <Badge className="shrink-0 bg-white text-violet-700" variant="outline">
                        {format.number(evaluation.aiConfidence, { style: "percent" })}
                      </Badge>
                    )}
                  </div>
                  {(evaluation.aiMatchedProfileKeys?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-800">
                        {t("sheet.profileItems")}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {evaluation.aiMatchedProfileKeys?.map((key) => (
                          <Badge
                            className="bg-white font-normal text-slate-600"
                            key={key}
                            variant="outline"
                          >
                            {key}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {(evaluation.aiMissingInformation?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-800">
                        {t("sheet.missingInformation")}
                      </p>
                      <ul className="mt-2 list-disc space-y-1 ps-5 text-xs leading-5 text-slate-600">
                        {evaluation.aiMissingInformation?.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}

              {evaluation.aiRemediationPlan && (
                <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                    <TargetIcon className="size-4" /> {t("sheet.remediation")}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950/80">
                    {evaluation.aiRemediationPlan}
                  </p>
                  {evaluation.aiAction?.title && (
                    <div className="mt-4 border-t border-amber-200 pt-4 text-xs text-slate-700">
                      <p className="font-semibold">{evaluation.aiAction.title}</p>
                      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <dt className="text-slate-400">{t("sheet.proposedOwner")}</dt>
                          <dd className="mt-1">{evaluation.aiAction.responsible ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-400">{t("sheet.resources")}</dt>
                          <dd className="mt-1">{evaluation.aiAction.resources ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-400">{t("sheet.startDate")}</dt>
                          <dd className="mt-1">
                            {formatDate(format, evaluation.aiAction.startDate)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-400">{t("sheet.dueDate")}</dt>
                          <dd className="mt-1">
                            {formatDate(format, evaluation.aiAction.dueDate)}
                          </dd>
                        </div>
                      </dl>
                      {evaluation.aiAction.effectivenessCriteria && (
                        <p className="mt-3">
                          <span className="text-slate-400">{t("sheet.criterion")}</span>
                          {evaluation.aiAction.effectivenessCriteria}
                        </p>
                      )}
                    </div>
                  )}
                </section>
              )}

              <section className="rounded-2xl border border-slate-200 p-4">
                <p className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                  <TargetIcon className="size-4" /> {t("sheet.actionPlan")}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  {t("sheet.actionPlanHint")}
                </p>
                <label className={cn(fieldLabelClass, "mt-4")} htmlFor="action-title">
                  {t("sheet.action")}
                </label>
                <Input
                  className="mt-1"
                  id="action-title"
                  maxLength={500}
                  onChange={(event) => updateAction("title", event.target.value)}
                  placeholder={t("sheet.actionPlaceholder")}
                  value={actionDraft.title}
                />
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={fieldLabelClass} htmlFor="action-responsible">
                      {t("sheet.owner")}
                    </label>
                    <Input
                      className="mt-1"
                      id="action-responsible"
                      maxLength={200}
                      onChange={(event) => updateAction("responsibleName", event.target.value)}
                      placeholder={t("sheet.ownerPlaceholder")}
                      value={actionDraft.responsibleName}
                    />
                  </div>
                  <div>
                    <label className={fieldLabelClass} htmlFor="action-status">
                      {t("sheet.status")}
                    </label>
                    <select
                      className={fieldControlClass}
                      id="action-status"
                      onChange={(event) =>
                        updateAction("status", event.target.value as ActionDraft["status"])
                      }
                      value={actionDraft.status}
                    >
                      {actionStatuses.map((value) => (
                        <option key={value} value={value}>
                          {t(`actionStatus.${value}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={fieldLabelClass} htmlFor="action-due-date">
                      {t("sheet.dueDate")}
                    </label>
                    <input
                      className={fieldControlClass}
                      id="action-due-date"
                      onChange={(event) => updateAction("dueDate", event.target.value)}
                      type="date"
                      value={actionDraft.dueDate}
                    />
                  </div>
                  <div>
                    <label className={fieldLabelClass} htmlFor="action-completed-date">
                      {t("sheet.completedDate")}
                    </label>
                    <input
                      className={fieldControlClass}
                      id="action-completed-date"
                      onChange={(event) => updateAction("completedDate", event.target.value)}
                      type="date"
                      value={actionDraft.completedDate}
                    />
                  </div>
                </div>
                <label className={cn(fieldLabelClass, "mt-3")} htmlFor="action-resources">
                  {t("sheet.resources")}
                </label>
                <Textarea
                  className="mt-1 min-h-16"
                  id="action-resources"
                  maxLength={2000}
                  onChange={(event) => updateAction("resources", event.target.value)}
                  placeholder={t("sheet.resourcesPlaceholder")}
                  value={actionDraft.resources}
                />
                <label className={cn(fieldLabelClass, "mt-3")} htmlFor="action-criteria">
                  {t("sheet.criteria")}
                </label>
                <Textarea
                  className="mt-1 min-h-16"
                  id="action-criteria"
                  maxLength={2000}
                  onChange={(event) => updateAction("effectivenessCriteria", event.target.value)}
                  placeholder={t("sheet.criteriaPlaceholder")}
                  value={actionDraft.effectivenessCriteria}
                />
                <label className={cn(fieldLabelClass, "mt-3")} htmlFor="action-effectiveness">
                  {t("sheet.effective")}
                </label>
                <select
                  className={fieldControlClass}
                  id="action-effectiveness"
                  onChange={(event) =>
                    updateAction(
                      "effectiveness",
                      event.target.value as ActionDraft["effectiveness"],
                    )
                  }
                  value={actionDraft.effectiveness}
                >
                  <option value="PENDING">{t("effectiveness.PENDING")}</option>
                  <option value="EFFECTIVE">{t("effectiveness.EFFECTIVE")}</option>
                  <option value="INEFFECTIVE">{t("effectiveness.INEFFECTIVE")}</option>
                </select>
                <label className={cn(fieldLabelClass, "mt-3")} htmlFor="action-comment">
                  {t("sheet.actionComment")}
                </label>
                <Textarea
                  className="mt-1 min-h-16"
                  id="action-comment"
                  maxLength={2000}
                  onChange={(event) => updateAction("comment", event.target.value)}
                  placeholder={t("sheet.actionCommentPlaceholder")}
                  value={actionDraft.comment}
                />
              </section>

              <section className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-900">{t("sheet.decision")}</p>
                <label className="mt-3 block text-xs text-slate-500" htmlFor="evaluation-result">
                  {t("sheet.result")}
                </label>
                <select
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  id="evaluation-result"
                  onChange={(event) =>
                    setResult(event.target.value as "CONFORMING" | "PARTIAL" | "NON_CONFORMING")
                  }
                  value={result}
                >
                  <option value="CONFORMING">{t("resultOptions.CONFORMING")}</option>
                  <option value="PARTIAL">{t("resultOptions.PARTIAL")}</option>
                  <option value="NON_CONFORMING">{t("resultOptions.NON_CONFORMING")}</option>
                </select>
                <label className="mt-3 block text-xs text-slate-500" htmlFor="evaluation-comment">
                  {t("sheet.comment")}
                </label>
                <Textarea
                  className="mt-1 min-h-24"
                  id="evaluation-comment"
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={t("sheet.commentPlaceholder")}
                  value={comment}
                />
              </section>
            </div>
            <SheetFooter className="flex-col items-stretch gap-2 border-t border-slate-100 bg-slate-50">
              {validationError && (
                <p className="text-xs text-rose-700" role="alert">
                  {validationError}
                </p>
              )}
              <Button
                className="h-10 rounded-xl bg-slate-950 hover:bg-slate-800"
                disabled={saving || !evaluation.revision}
                onClick={() => {
                  const input = buildSaveInput();
                  if (typeof input === "string") {
                    setValidationError(input);
                    return;
                  }
                  setValidationError(undefined);
                  void onSave(input);
                }}
              >
                {saving ? <LoaderCircleIcon className="animate-spin" /> : <CheckIcon />}{" "}
                {t("sheet.validate")}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
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
  evaluating = false,
  savingEvaluation = false,
  onStartEvaluation = () => undefined,
  onSaveEvaluation = async () => undefined,
}: {
  profile: ProjectProfile;
  watch: RegulatoryWatch;
  synchronizing: boolean;
  onRefresh: () => void;
  refreshing: boolean;
  onExport: () => void;
  exporting: boolean;
  evaluating?: boolean;
  savingEvaluation?: boolean;
  onStartEvaluation?: () => void;
  onSaveEvaluation?: (input: EvaluationSaveInput) => Promise<void>;
}) {
  const [selectedDocument, setSelectedDocument] = useState<RegulatoryDocument | null>(null);
  // Held by id, not by value: the open sheet has to follow the 2s poll so a pass completing
  // while it is open shows its recommendation, and so the submitted revision is the current
  // one rather than whatever it was at click time.
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<string | null>(null);
  const { t, i18n: instance } = useTranslation("regulatory");
  const format = useFormat();
  // Rebuilt when the interface language changes: the view data carries display strings.
  const data = useMemo(() => regulatoryViewData(watch, t, format), [watch, t, instance.language]);
  const selectedEvaluation = useMemo(
    () => data.evaluations.find((item) => item.id === selectedEvaluationId) ?? null,
    [data.evaluations, selectedEvaluationId],
  );
  const analysisActive = Boolean(
    watch.currentAnalysis && activeAnalysisStatuses.has(watch.currentAnalysis.status),
  );
  const aiAnalysisActive = aiEvaluationActive(watch);
  const evaluationBusy = evaluating || aiAnalysisActive;
  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-5">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>{profile.project.name}</span>
            <span>/</span>
            <span>{t("data.title")}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{t("data.title")}</h1>
            {synchronizing && (
              <span
                role="status"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700"
              >
                <LoaderCircleIcon className="size-3.5 animate-spin" /> {t("data.synchronizing")}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-500">{t("data.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="h-10 rounded-xl bg-white"
            disabled={evaluationBusy || analysisActive}
            onClick={onStartEvaluation}
            variant="outline"
          >
            {evaluationBusy ? <LoaderCircleIcon className="animate-spin" /> : <SearchCheckIcon />}{" "}
            {aiAnalysisActive ? t("data.aiRunning") : t("data.rerunAi")}
          </Button>
          <Button
            className="h-10 rounded-xl bg-white"
            disabled={refreshing || analysisActive}
            onClick={onRefresh}
            variant="outline"
          >
            <RefreshCwIcon className={cn((refreshing || analysisActive) && "animate-spin")} />{" "}
            {analysisActive ? t("data.analysisRunning") : t("data.refresh")}
          </Button>
          <Button
            className="h-10 rounded-xl bg-slate-950 px-4 hover:bg-slate-800"
            disabled={exporting}
            onClick={onExport}
          >
            {exporting ? <LoaderCircleIcon className="animate-spin" /> : <DownloadIcon />}{" "}
            {t("data.export")}
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
                <p className="text-sm font-semibold text-violet-950">{t("data.updating")}</p>
                <span className="text-xs font-semibold text-violet-800">
                  {watch.currentAnalysis?.progressPercent ?? 0}%
                </span>
              </div>
              <p className="mt-1 text-xs text-violet-800/70">
                {t("data.updatingBody", {
                  phase: analysisPhaseLabel(t, watch.currentAnalysis?.phase),
                })}
              </p>
              <Progress
                className="mt-3 [&_[data-slot=progress-indicator]]:bg-violet-600 [&_[data-slot=progress-track]]:bg-violet-100"
                value={watch.currentAnalysis?.progressPercent ?? 0}
              />
            </div>
          </div>
        </div>
      )}
      {aiAnalysisActive && (
        <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <LoaderCircleIcon className="mt-0.5 size-4 shrink-0 animate-spin text-violet-700" />
          <div>
            <p className="text-sm font-semibold text-violet-950">{t("data.preassessment")}</p>
            <p className="mt-1 text-xs leading-5 text-violet-800/70">
              {t("data.preassessmentBody")}
            </p>
          </div>
        </div>
      )}
      {watch.status === "STALE" && !analysisActive && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-amber-950">{t("data.profileChanged")}</p>
              <p className="mt-1 text-xs text-amber-800/70">{t("data.profileChangedBody")}</p>
            </div>
          </div>
          <Button className="bg-white" onClick={onRefresh} size="sm" variant="outline">
            {t("data.syncNow")}
          </Button>
        </div>
      )}
      {watch.synchronization.state === "FAILED" && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" /> {t("data.syncFailed")}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={FileTextIcon}
          label={t("data.applicableTexts")}
          value={format.number(data.documents.length)}
          detail={t("data.publishedRequirements", { count: data.summary.total })}
          tone="bg-blue-50 text-blue-700"
        />
        <MetricCard
          icon={ListChecksIcon}
          label={t("data.identifiedRequirements")}
          value={format.number(data.summary.total)}
          detail={t("data.aiAndConfirmed", {
            ai: data.summary.aiAssessed,
            confirmed: data.summary.humanValidated,
          })}
          tone="bg-violet-50 text-violet-700"
        />
        <MetricCard
          icon={CheckCircle2Icon}
          label={t("data.complianceRate")}
          value={format.number(data.summary.compliancePercent / 100, { style: "percent" })}
          detail={t("data.conformingRequirements", { count: data.summary.conforming })}
          tone="bg-emerald-50 text-emerald-700"
        />
        <MetricCard
          icon={Clock3Icon}
          label={t("data.openActions")}
          value={format.number(data.summary.openActions)}
          detail={t("data.openActionsDetail")}
          tone="bg-rose-50 text-rose-700"
        />
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm">
            <ShieldCheckIcon className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-emerald-950">{t("data.basedOnProfile")}</p>
            <p className="mt-0.5 text-xs text-emerald-800/70">
              {t("data.baseline", {
                sequence: watch.currentBaseline?.sequence,
                date: formatDate(format, watch.currentBaseline?.publishedAt),
              })}
            </p>
          </div>
        </div>
        <Badge className="border-emerald-200 bg-white text-emerald-700" variant="outline">
          <CheckCircle2Icon /> {t("data.published")}
        </Badge>
      </div>

      <Tabs className="gap-4" defaultValue="documents">
        <TabsList className="grid w-full grid-cols-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm group-data-horizontal/tabs:h-auto">
          <TabsTrigger
            className="h-auto min-h-12 whitespace-normal rounded-xl px-2 py-2 text-center leading-4 data-active:bg-slate-950 data-active:text-white sm:px-5"
            value="documents"
          >
            <FileTextIcon /> {t("data.documentsTab")}{" "}
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
              {data.documents.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            className="h-auto min-h-12 whitespace-normal rounded-xl px-2 py-2 text-center leading-4 data-active:bg-slate-950 data-active:text-white sm:px-5"
            value="evaluation"
          >
            <ListChecksIcon /> {t("data.evaluationTab")}{" "}
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
              {data.summary.total}
            </span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="documents">
          <DocumentList
            items={data.documents}
            onOpen={(item) => {
              setSelectedEvaluationId(null);
              setSelectedDocument(item);
            }}
          />
        </TabsContent>
        <TabsContent value="evaluation">
          <EvaluationList
            aiActive={aiAnalysisActive}
            items={data.evaluations}
            summary={data.summary}
            onOpen={(item) => {
              setSelectedDocument(null);
              setSelectedEvaluationId(item.id);
            }}
          />
        </TabsContent>
      </Tabs>
      <DetailSheet
        document={selectedDocument}
        evaluation={null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDocument(null);
            setSelectedEvaluationId(null);
          }
        }}
      />
      <AiEvaluationSheet
        evaluation={selectedEvaluation}
        saving={savingEvaluation}
        onClose={() => setSelectedEvaluationId(null)}
        onSave={async (input) => {
          await onSaveEvaluation(input);
          setSelectedEvaluationId(null);
        }}
      />
    </section>
  );
}

export function RegulatoryWatchPage() {
  const { projectId = "" } = useParams();
  const queryClient = useQueryClient();
  const { t } = useTranslation("regulatory");
  const [actionError, setActionError] = useState<string>();
  const [exporting, setExporting] = useState(false);
  const automaticPublicationAttemptedRun = useRef<string | null>(null);
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
      const regulatoryAnalysisActive = Boolean(
        watch?.currentAnalysis && activeAnalysisStatuses.has(watch.currentAnalysis.status),
      );
      return regulatoryAnalysisActive || aiEvaluationActive(watch) ? 2_000 : false;
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
      setActionError(error instanceof Error ? error.message : t("page.startFailed")),
  });
  const clarificationMutation = useMutation({
    mutationFn: (answers: Array<{ key: string; answer: string }>) => {
      const analysis = watchQuery.data?.currentAnalysis;
      if (!analysis) throw new Error(t("page.analysisNotFound"));
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
      setActionError(error instanceof Error ? error.message : t("page.answersFailed")),
  });
  const analysisReviewMutation = useMutation({
    mutationFn: (
      input:
        { outcome: "SUBMITTED"; rating: number; comment: string | null } | { outcome: "SKIPPED" },
    ) => {
      const analysis = watchQuery.data?.currentAnalysis;
      if (!analysis) throw new Error(t("page.analysisNotFound"));
      return clientApi.reviewRegulatoryAnalysis(projectId, analysis.id, input);
    },
    onMutate: () => setActionError(undefined),
    onSuccess: (watch) => queryClient.setQueryData(["regulatory-watch", projectId], watch),
    onError: (error) =>
      setActionError(error instanceof Error ? error.message : t("page.reviewFailed")),
  });
  const decisionMutation = useMutation({
    mutationFn: ({
      candidateId,
      decision,
      requirementText,
    }: {
      candidateId: string;
      decision: "APPLICABLE" | "NOT_APPLICABLE";
      requirementText?: string | undefined;
    }) => {
      const watch = watchQuery.data;
      if (!watch) throw new Error(t("page.watchNotFound"));
      return clientApi.decideRegulatoryCandidate(projectId, candidateId, {
        watchRevision: watch.revision,
        decision,
        requirementText,
      });
    },
    onMutate: () => setActionError(undefined),
    onSuccess: (watch) => queryClient.setQueryData(["regulatory-watch", projectId], watch),
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : t("page.decisionFailed"));
      void watchQuery.refetch();
    },
  });
  const bulkDecisionMutation = useMutation({
    mutationFn: (
      decisions: Array<{ candidateId: string; decision: "APPLICABLE" | "NOT_APPLICABLE" }>,
    ) => {
      const watch = watchQuery.data;
      if (!watch) throw new Error(t("page.watchNotFound"));
      return clientApi.decideRegulatoryCandidates(projectId, {
        watchRevision: watch.revision,
        decisions,
      });
    },
    onMutate: () => setActionError(undefined),
    onSuccess: (watch) => queryClient.setQueryData(["regulatory-watch", projectId], watch),
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : t("page.decisionsFailed"));
      void watchQuery.refetch();
    },
  });
  const publishMutation = useMutation({
    mutationFn: () => {
      const watch = watchQuery.data;
      const analysis = watch?.currentAnalysis;
      if (!watch || !analysis) throw new Error(t("page.analysisNotFound"));
      return clientApi.publishRegulatoryBaseline(projectId, {
        analysisRunId: analysis.id,
        watchRevision: watch.revision,
      });
    },
    onMutate: () => setActionError(undefined),
    onSuccess: (watch) => queryClient.setQueryData(["regulatory-watch", projectId], watch),
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : t("page.publishFailed"));
      void watchQuery.refetch();
    },
  });
  const automaticPublishMutation = useMutation({
    mutationFn: () => {
      const watch = watchQuery.data;
      const analysis = watch?.currentAnalysis;
      if (!watch || !analysis) throw new Error(t("page.analysisNotFound"));
      return clientApi.publishRegulatoryBaselineAutomatically(projectId, {
        analysisRunId: analysis.id,
        watchRevision: watch.revision,
      });
    },
    onSuccess: (watch) => queryClient.setQueryData(["regulatory-watch", projectId], watch),
    onError: () => void watchQuery.refetch(),
  });
  const analysisForAutomaticPublication = watchQuery.data?.currentAnalysis;
  useEffect(() => {
    if (
      !AUTO_APPLICABLE ||
      !analysisForAutomaticPublication ||
      !["READY_FOR_REVIEW", "PARTIAL"].includes(analysisForAutomaticPublication.status) ||
      automaticPublicationAttemptedRun.current === analysisForAutomaticPublication.id
    ) {
      return;
    }
    automaticPublicationAttemptedRun.current = analysisForAutomaticPublication.id;
    automaticPublishMutation.mutate();
  }, [analysisForAutomaticPublication?.id, analysisForAutomaticPublication?.status]);
  const evaluationRunMutation = useMutation({
    mutationFn: () => clientApi.startRegulatoryEvaluation(projectId),
    onMutate: () => setActionError(undefined),
    onSuccess: async () => {
      await watchQuery.refetch();
    },
    onError: (error) =>
      setActionError(error instanceof Error ? error.message : t("page.evaluationStartFailed")),
  });
  const evaluationMutation = useMutation({
    // One reviewer action can touch preuves, the action plan and the conformity decision. Each
    // endpoint returns the whole watch, so the calls run in sequence and the last response seeds
    // the cache. The evaluation goes last: it is the only revision-guarded write, so it must not
    // burn its revision before the rest has landed.
    mutationFn: async (input: EvaluationSaveInput) => {
      for (const evidenceId of input.evidence.deletedIds) {
        await clientApi.deleteRegulatoryEvidence(projectId, evidenceId);
      }
      for (const evidence of input.evidence.updated) {
        const { id, ...patch } = evidence;
        await clientApi.updateRegulatoryEvidence(projectId, id, patch);
      }
      for (const evidence of input.evidence.created) {
        await clientApi.addRegulatoryEvidence(projectId, input.evaluationId, evidence);
      }
      if (input.action) {
        const { id, ...payload } = input.action;
        if (id) await clientApi.updateRegulatoryAction(projectId, id, payload);
        else await clientApi.addRegulatoryAction(projectId, input.evaluationId, payload);
      }
      return clientApi.updateRegulatoryEvaluation(projectId, input.evaluationId, {
        revision: input.revision,
        result: input.result,
        comment: input.comment,
      });
    },
    onMutate: () => setActionError(undefined),
    onSuccess: (watch) => queryClient.setQueryData(["regulatory-watch", projectId], watch),
    onError: (error) =>
      setActionError(error instanceof Error ? error.message : t("page.evaluationFailed")),
  });

  if ((profileQuery.isPending && !profileQuery.data) || (watchQuery.isPending && !watchQuery.data))
    return <PageSkeleton />;
  const profile = profileQuery.data;
  const watch = watchQuery.data;
  if (!profile || !watch)
    return (
      <section className="mx-auto max-w-2xl rounded-3xl border border-rose-200 bg-white p-8 text-center">
        <AlertCircleIcon className="mx-auto size-7 text-rose-600" />
        <h1 className="mt-4 text-xl font-semibold">{t("page.unavailable")}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {profileQuery.error?.message ?? watchQuery.error?.message ?? t("page.tryLater")}
        </p>
        <Button
          className="mt-5"
          onClick={() => void Promise.all([profileQuery.refetch(), watchQuery.refetch()])}
        >
          {t("retry", { ns: "common" })}
        </Button>
      </section>
    );
  if (profile.profile.status !== "COMPLETE") return <IncompleteProfileState profile={profile} />;
  const projectSlug = profile.project.slug;

  const hasBaseline = Boolean(watch.currentBaseline);
  const analysisStatus = watch.currentAnalysis?.status;
  const analysisAwaitingReview =
    !AUTO_APPLICABLE &&
    ["READY_FOR_REVIEW", "PARTIAL"].includes(analysisStatus ?? "") &&
    watch.currentAnalysis?.review == null;
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
  if (analysisAwaitingReview)
    return (
      <AnalysisReviewState
        watch={watch}
        pending={analysisReviewMutation.isPending}
        error={actionError}
        onSubmit={(rating, comment) =>
          analysisReviewMutation.mutate({ outcome: "SUBMITTED", rating, comment })
        }
        onSkip={() => analysisReviewMutation.mutate({ outcome: "SKIPPED" })}
      />
    );
  if (AUTO_APPLICABLE && ["READY_FOR_REVIEW", "PARTIAL"].includes(analysisStatus ?? ""))
    return (
      <StateShell tone="light">
        <div className="mx-auto max-w-xl py-20 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-violet-50 text-violet-700">
            {automaticPublishMutation.isError ? (
              <AlertCircleIcon className="size-6" />
            ) : (
              <LoaderCircleIcon className="size-6 animate-spin" />
            )}
          </span>
          <h1 className="mt-5 text-2xl font-semibold">
            {automaticPublishMutation.isError
              ? t("page.autoPublishFailed")
              : t("page.autoPublishing")}
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            {automaticPublishMutation.isError
              ? automaticPublishMutation.error.message
              : t("page.autoPublishingBody")}
          </p>
          {automaticPublishMutation.isError && (
            <Button className="mt-6" onClick={() => automaticPublishMutation.mutate()}>
              <RefreshCwIcon /> {t("retry", { ns: "common" })}
            </Button>
          )}
        </div>
      </StateShell>
    );
  if (!hasBaseline && ["READY_FOR_REVIEW", "PARTIAL"].includes(analysisStatus ?? ""))
    return (
      <ReviewState
        watch={watch}
        deciding={decisionMutation.isPending || bulkDecisionMutation.isPending}
        publishing={publishMutation.isPending}
        error={actionError}
        onDecision={(candidateId, decision, requirementText) =>
          decisionMutation.mutate({ candidateId, decision, requirementText })
        }
        onDecideAll={(decisions) => bulkDecisionMutation.mutate(decisions)}
        onPublish={() => publishMutation.mutate()}
        onRerun={() => startMutation.mutate()}
      />
    );
  if (!hasBaseline && watch.status === "FAILED")
    return (
      <StateShell tone="light">
        <SourceRequired watch={watch} />
        <div className="mx-auto max-w-xl py-20 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-rose-50 text-rose-700">
            <AlertCircleIcon className="size-6" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold">{t("page.analysisFailed")}</h1>
          <p className="mt-3 text-sm text-slate-500">
            {analysisErrorMessage(watch.currentAnalysis?.error?.code)}
          </p>
          {analysisIsRetryable(watch.currentAnalysis?.error?.code) ? (
            <Button
              className="mt-6"
              disabled={startMutation.isPending}
              onClick={() => startMutation.mutate()}
            >
              <RefreshCwIcon /> {t("review.rerun")}
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
      anchor.download = `${t("page.exportFileName")}-${projectSlug}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("page.exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <SourceRequired watch={watch} />
      {analysisStatus === "AWAITING_CLARIFICATION" && (
        <ClarificationState
          watch={watch}
          pending={clarificationMutation.isPending}
          error={actionError}
          onSubmit={(answers) => clarificationMutation.mutate(answers)}
        />
      )}
      {!AUTO_APPLICABLE && ["READY_FOR_REVIEW", "PARTIAL"].includes(analysisStatus ?? "") && (
        <ReviewState
          watch={watch}
          deciding={decisionMutation.isPending || bulkDecisionMutation.isPending}
          publishing={publishMutation.isPending}
          error={actionError}
          onDecision={(candidateId, decision, requirementText) =>
            decisionMutation.mutate({ candidateId, decision, requirementText })
          }
          onDecideAll={(decisions) => bulkDecisionMutation.mutate(decisions)}
          onPublish={() => publishMutation.mutate()}
          onRerun={() => startMutation.mutate()}
        />
      )}
      {analysisStatus === "FAILED" && (
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm">
          <div className="flex items-start gap-2 text-rose-800">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">{t("page.lastAnalysisFailed")}</p>
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
              <RefreshCwIcon /> {t("review.rerun")}
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
        evaluating={evaluationRunMutation.isPending}
        savingEvaluation={evaluationMutation.isPending}
        onRefresh={() => startMutation.mutate()}
        onExport={() => void exportWorkbook()}
        onStartEvaluation={() => evaluationRunMutation.mutate()}
        onSaveEvaluation={async (input) => {
          await evaluationMutation.mutateAsync(input);
        }}
      />
      {actionError && (
        <div
          role="alert"
          className="fixed bottom-5 end-5 z-40 flex max-w-sm items-start gap-2 rounded-2xl border border-rose-200 bg-white p-4 text-sm text-rose-700 shadow-xl"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
          {actionError}
          <button
            aria-label={t("close", { ns: "common" })}
            className="ms-auto"
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
