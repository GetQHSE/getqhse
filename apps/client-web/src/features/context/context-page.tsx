/**
 * "Analyse des enjeux" (ISO 9001 §4.1) — steps 1 through 4, same flow,
 * wording and gating as the foundation's analysis route. Runs execute in the
 * worker: "running" is read from the latest run's status instead of a
 * pending request, everything else behaves identically.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircleIcon, LoaderCircleIcon, ScaleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  ContextAnalysisRunSummary,
  ContextExternalRunSummary,
  SupportedLanguage,
} from "@qhse/contracts";
import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Skeleton } from "@qhse/ui/components/skeleton";
import { Toaster } from "@qhse/ui/components/toast";

import { clientApi } from "../../app/client-api.js";
import { AnalysisMethodCard, ExternalAnalysisPanel } from "./context-step-external.js";
import {
  InternalContextForm,
  InternalContextResults,
  SupportingDocumentsCard,
} from "./context-step-internal.js";
import {
  ContextExportCard,
  ContextVisualSummary,
  IssuesSynthesisPanel,
  IssuesValidationPanel,
  ManualIssueDialog,
  computeIssueMetrics,
  type ReviewIssueInput,
} from "./context-step-issues.js";
import { AnalysisStepper, notify } from "./context-ui.js";
import { buildContextDocument } from "./export/document.js";
import "./context.css";

export function ContextPage() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) return null;
  return (
    <Toaster>
      <ContextGate projectId={projectId} />
    </Toaster>
  );
}

function ContextGate({ projectId }: { projectId: string }) {
  const { t } = useTranslation("context");
  const projectQuery = useQuery({
    queryKey: ["client", "project", projectId],
    queryFn: () => clientApi.project(projectId),
  });
  const watchQuery = useQuery({
    queryKey: ["regulatory-watch", projectId],
    queryFn: () => clientApi.regulatoryWatch(projectId),
  });

  if (watchQuery.isLoading || projectQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
        <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
        {t("gate.loading")}
      </div>
    );
  }
  if (watchQuery.isError || !watchQuery.data) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        <AlertCircleIcon className="size-4" aria-hidden="true" />
        {t("gate.watchFailed")}
      </div>
    );
  }
  if (watchQuery.data.currentBaseline == null) {
    return <IncompleteWatchState projectId={projectId} status={watchQuery.data.status} />;
  }
  return (
    <AnalysisPage projectId={projectId} projectLanguage={projectQuery.data?.language ?? "fr"} />
  );
}

const WATCH_STATUSES = [
  "NOT_STARTED",
  "ANALYZING",
  "AWAITING_CLARIFICATION",
  "REVIEW_REQUIRED",
  "STALE",
  "FAILED",
] as const;

/** The légal dimension reuses the published veille, so the module waits for one. */
function IncompleteWatchState({ projectId, status }: { projectId: string; status: string }) {
  const { t } = useTranslation("context");
  const statusLabel = (WATCH_STATUSES as readonly string[]).includes(status)
    ? t(`gate.watchStatus.${status as (typeof WATCH_STATUSES)[number]}`)
    : status;
  return (
    <div className="mx-auto max-w-2xl py-16 text-center">
      <span className="mx-auto grid size-16 place-items-center rounded-3xl border border-violet-200 bg-violet-50 text-violet-600">
        <ScaleIcon className="size-7" aria-hidden="true" />
      </span>
      <Badge className="mt-6" variant="outline">
        {t("gate.prerequisite")}
      </Badge>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">
        {t("gate.publishFirst")}
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        {t("gate.publishFirstBody", { status: statusLabel })}
      </p>
      <Button className="mt-6" render={<Link to={`/projects/${projectId}/regulatory-watch`} />}>
        <ScaleIcon className="size-4" aria-hidden="true" /> {t("gate.openWatch")}
      </Button>
    </div>
  );
}

function isActive(run: { status: string } | undefined): boolean {
  return run?.status === "DRAFT" || run?.status === "RUNNING";
}

/**
 * Tracks one launched worker run: "running" while the latest run is
 * DRAFT/RUNNING, a toast when a run launched from this page completes, and
 * the failure message when it fails (the foundation's mutation result).
 */
function useLaunchedRun<T extends { id: string; status: string; errorMessage: string | null }>(
  runs: T[] | undefined,
  onCompleted: (run: T) => void,
) {
  const launchedRef = useRef<string | null>(null);
  const latest = runs?.[0];
  useEffect(() => {
    if (!latest || latest.id !== launchedRef.current || isActive(latest)) return;
    launchedRef.current = null;
    if (latest.status === "COMPLETED") onCompleted(latest);
  }, [latest, onCompleted]);
  return {
    isRunning: isActive(latest),
    errorMessage: latest?.status === "FAILED" ? latest.errorMessage : null,
    track: (runId: string) => {
      launchedRef.current = runId;
    },
  };
}

function AnalysisPage({
  projectId,
  projectLanguage,
}: {
  projectId: string;
  projectLanguage: SupportedLanguage;
}) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("context");
  const pollWhileActive = (query: { state: { data?: { status: string }[] | undefined } }) =>
    isActive(query.state.data?.[0]) ? 3_000 : false;

  const settingsQuery = useQuery({
    queryKey: ["context-settings", projectId],
    queryFn: () => clientApi.contextSettings(projectId),
  });
  const scopeQuery = useQuery({
    queryKey: ["context-scope", projectId],
    queryFn: () => clientApi.contextScope(projectId),
  });
  const inputsQuery = useQuery({
    queryKey: ["context-internal-inputs", projectId],
    queryFn: () => clientApi.contextInternalInputs(projectId),
  });
  const externalRunsQuery = useQuery({
    queryKey: ["context-external-runs", projectId],
    queryFn: () => clientApi.contextExternalRuns(projectId),
    refetchInterval: pollWhileActive,
  });
  const factorsQuery = useQuery({
    queryKey: ["context-external-factors", projectId],
    queryFn: () => clientApi.contextExternalFactors(projectId),
  });
  const analysisRunsQuery = useQuery({
    queryKey: ["context-analysis-runs", projectId],
    queryFn: () => clientApi.contextAnalysisRuns(projectId),
    refetchInterval: pollWhileActive,
  });
  const issuesQuery = useQuery({
    queryKey: ["context-issues", projectId],
    queryFn: () => clientApi.contextIssues(projectId),
  });

  const savedInputs = inputsQuery.data ?? [];
  const internalCompleted = savedInputs.some((input) => input.status === "completed");
  const factors = factorsQuery.data ?? [];
  const issues = issuesQuery.data ?? [];
  const metrics = useMemo(() => computeIssueMetrics(issues), [issues]);
  const latestCompletedRun =
    (analysisRunsQuery.data ?? []).find((run) => run.status === "COMPLETED") ?? null;

  const methodChosen = settingsQuery.data?.explicit === true;
  const displayedMethod =
    latestCompletedRun?.analysisMethod ?? settingsQuery.data?.analysisMethod ?? "SWOT";
  const displayedMethodExplicit =
    Boolean(latestCompletedRun?.analysisMethod) || (settingsQuery.data?.explicit ?? false);

  /* ------------------------------- runs ------------------------------- */

  const external = useLaunchedRun<ContextExternalRunSummary>(
    externalRunsQuery.data,
    useMemo(
      () => (run: ContextExternalRunSummary) => {
        void queryClient.invalidateQueries({ queryKey: ["context-external-factors", projectId] });
        notify.success(t("page.externalDone", { count: run.factorsCount }));
      },
      [projectId, queryClient, t],
    ),
  );
  const synthesis = useLaunchedRun<ContextAnalysisRunSummary>(
    analysisRunsQuery.data,
    useMemo(
      () => (run: ContextAnalysisRunSummary) => {
        void queryClient.invalidateQueries({ queryKey: ["context-issues", projectId] });
        notify.success(t("page.synthesisDone", { count: run.issuesCount }));
      },
      [projectId, queryClient, t],
    ),
  );

  const launchExternal = useMutation({
    mutationFn: () => clientApi.triggerContextExternalResearch(projectId),
    onSuccess: (job) => {
      external.track(job.runId);
      void queryClient.invalidateQueries({ queryKey: ["context-external-runs", projectId] });
    },
  });
  const launchSynthesis = useMutation({
    mutationFn: () => clientApi.triggerContextSynthesis(projectId),
    onSuccess: (job) => {
      synthesis.track(job.runId);
      void queryClient.invalidateQueries({ queryKey: ["context-analysis-runs", projectId] });
    },
  });
  const review = useMutation({
    mutationFn: (input: ReviewIssueInput) =>
      clientApi.applyContextIssueOverride(projectId, input.issueId, {
        ...(input.reviewStatus ? { reviewStatus: input.reviewStatus } : {}),
        ...(input.selectedPriority !== undefined
          ? { selectedPriority: input.selectedPriority }
          : {}),
        ...(input.title ? { title: input.title } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.nature ? { nature: input.nature } : {}),
        correctionReason: input.reason,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["context-issues", projectId] }),
    onError: () => notify.error(t("page.reviewFailed")),
  });

  const externalRunning = launchExternal.isPending || external.isRunning;
  const synthesisRunning = launchSynthesis.isPending || synthesis.isRunning;
  const externalError = launchExternal.isError
    ? t("page.externalLaunchFailed")
    : external.errorMessage;
  const synthesisError = launchSynthesis.isError
    ? t("page.synthesisLaunchFailed")
    : synthesis.errorMessage;

  /* ------------------------------- steps ------------------------------- */

  const step1Done = internalCompleted;
  const step2Done = factors.length > 0;
  const step3Done = issues.length > 0;
  const completedSteps = [
    ...(step1Done ? [1] : []),
    ...(step2Done ? [2] : []),
    ...(step3Done ? [3] : []),
    ...(step3Done && metrics.pending === 0 ? [4] : []),
  ];
  const maxReachableStep = step3Done ? 4 : step2Done ? 3 : step1Done ? 2 : 1;

  const isLoadingStep = inputsQuery.isLoading || factorsQuery.isLoading || issuesQuery.isLoading;
  const [step, setStep] = useState(1);
  const [autoAdvanced, setAutoAdvanced] = useState(false);
  useEffect(() => {
    if (autoAdvanced || isLoadingStep) return;
    setStep(maxReachableStep);
    setAutoAdvanced(true);
  }, [autoAdvanced, isLoadingStep, maxReachableStep]);

  const [editingInternal, setEditingInternal] = useState(false);
  const showInternalSuccess = internalCompleted && !editingInternal;

  const scope = scopeQuery.data;
  const scopeRows = scope
    ? [
        { label: t("page.scope.project"), value: scope.projectName },
        { label: t("page.scope.organization"), value: scope.organizationName || "—" },
        { label: t("page.scope.standard"), value: scope.isoStandard },
        { label: t("page.scope.activity"), value: scope.activity ?? "—" },
        {
          label: t("page.scope.countries"),
          value: scope.countries.join(", ") || t("page.scope.noCountries"),
        },
        {
          label: t("page.scope.internal"),
          value: internalCompleted
            ? t("page.scope.internalValidated")
            : t("page.scope.internalTodo"),
        },
        {
          label: t("page.scope.language"),
          value: t(`projectLanguage.${projectLanguage}`, { ns: "common" }),
        },
      ]
    : [];

  const exportDocument = useMemo(() => {
    if (!scope) return null;
    return buildContextDocument({
      language: projectLanguage,
      organizationName: scope.organizationName || "—",
      projectName: scope.projectName,
      isoStandard: scope.isoStandard,
      method: displayedMethod,
      methodExplicit: displayedMethodExplicit,
      analysisDate: latestCompletedRun?.completedAt ?? latestCompletedRun?.createdAt ?? null,
      factors,
      issues,
    });
  }, [
    scope,
    projectLanguage,
    displayedMethod,
    displayedMethodExplicit,
    latestCompletedRun,
    factors,
    issues,
  ]);

  return (
    <div className="gq-analysis mx-auto max-w-5xl py-8">
      <header className="gq-hero">
        <h2>{t("page.title")}</h2>
        <p>{t("page.subtitle")}</p>
      </header>

      <div>
        <AnalysisStepper
          activeStep={step}
          completedSteps={completedSteps}
          maxReachableStep={maxReachableStep}
          onStepChange={setStep}
        />

        {isLoadingStep ? (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : step === 1 ? (
          <>
            {showInternalSuccess ? (
              <InternalContextResults
                inputs={savedInputs}
                onEdit={() => setEditingInternal(true)}
                onContinue={() => setStep(2)}
              />
            ) : (
              <InternalContextForm
                projectId={projectId}
                projectLanguage={projectLanguage}
                existingInputs={savedInputs}
                onCompleted={() => {
                  setEditingInternal(false);
                  setStep(2);
                }}
              />
            )}
            <SupportingDocumentsCard />
          </>
        ) : step === 2 ? (
          <>
            <AnalysisMethodCard projectId={projectId} settings={settingsQuery.data} />
            <ExternalAnalysisPanel
              factors={factors}
              runs={externalRunsQuery.data ?? []}
              scopeRows={scopeRows}
              canLaunch={step1Done && methodChosen}
              blockedReason={
                !methodChosen
                  ? t("page.methodRequired")
                  : step1Done
                    ? null
                    : t("page.internalFirst")
              }
              isRunning={externalRunning}
              errorMessage={externalRunning ? null : externalError}
              onLaunch={() => {
                if (!step1Done || !methodChosen || externalRunning) return;
                launchExternal.mutate();
              }}
              onContinue={() => setStep(3)}
            />
          </>
        ) : step === 3 ? (
          <>
            {methodChosen ? null : (
              <AnalysisMethodCard projectId={projectId} settings={settingsQuery.data} />
            )}
            <IssuesSynthesisPanel
              issues={issues}
              runs={analysisRunsQuery.data ?? []}
              canLaunch={step1Done && step2Done && methodChosen}
              blockedReason={
                !methodChosen
                  ? t("page.methodRequired")
                  : step2Done
                    ? null
                    : t("page.externalFirst")
              }
              isRunning={synthesisRunning}
              errorMessage={synthesisRunning ? null : synthesisError}
              onLaunch={() => {
                if (!step2Done || !methodChosen || synthesisRunning) return;
                launchSynthesis.mutate();
              }}
              onContinue={() => setStep(4)}
            />
          </>
        ) : (
          <>
            <IssuesValidationPanel
              issues={issues}
              metrics={metrics}
              isReviewing={review.isPending}
              analysisDate={
                latestCompletedRun?.completedAt ?? latestCompletedRun?.createdAt ?? null
              }
              methodologyVersion={latestCompletedRun?.methodologyVersion ?? null}
              onReview={(input) => review.mutate(input)}
              headerAction={
                <ManualIssueDialog projectId={projectId} projectLanguage={projectLanguage} />
              }
            />

            <ContextVisualSummary
              issues={issues}
              method={displayedMethod}
              methodExplicit={displayedMethodExplicit}
            />

            <ContextExportCard document={exportDocument} />
          </>
        )}
      </div>
    </div>
  );
}
