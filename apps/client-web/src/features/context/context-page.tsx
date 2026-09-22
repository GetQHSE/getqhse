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
import type { ContextAnalysisRunSummary, ContextExternalRunSummary } from "@qhse/contracts";
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

const METHOD_REQUIRED_MESSAGE = "Choisissez d’abord la méthode d’analyse SWOT ou PESTEL.";

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
  const watchQuery = useQuery({
    queryKey: ["regulatory-watch", projectId],
    queryFn: () => clientApi.regulatoryWatch(projectId),
  });

  if (watchQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
        <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
        Chargement de l'analyse des enjeux…
      </div>
    );
  }
  if (watchQuery.isError || !watchQuery.data) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        <AlertCircleIcon className="size-4" aria-hidden="true" />
        Impossible de charger la veille réglementaire.
      </div>
    );
  }
  if (watchQuery.data.currentBaseline == null) {
    return <IncompleteWatchState projectId={projectId} status={watchQuery.data.status} />;
  }
  return <AnalysisPage projectId={projectId} />;
}

const WATCH_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "pas encore lancée",
  ANALYZING: "en cours d'analyse",
  AWAITING_CLARIFICATION: "en attente de précisions",
  REVIEW_REQUIRED: "en attente de votre validation",
  STALE: "à revérifier",
  FAILED: "en échec",
};

/** The légal dimension reuses the published veille, so the module waits for one. */
function IncompleteWatchState({ projectId, status }: { projectId: string; status: string }) {
  return (
    <div className="mx-auto max-w-2xl py-16 text-center">
      <span className="mx-auto grid size-16 place-items-center rounded-3xl border border-violet-200 bg-violet-50 text-violet-600">
        <ScaleIcon className="size-7" aria-hidden="true" />
      </span>
      <Badge className="mt-6" variant="outline">
        Étape préalable · Veille réglementaire
      </Badge>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">
        Publiez d'abord votre veille réglementaire
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        L'analyse des enjeux réutilise votre registre réglementaire publié pour la dimension légale
        — elle ne la recherche jamais elle-même. Veille : {WATCH_STATUS_LABELS[status] ?? status}.
      </p>
      <Button className="mt-6" render={<Link to={`/projects/${projectId}/regulatory-watch`} />}>
        <ScaleIcon className="size-4" aria-hidden="true" /> Ouvrir la veille réglementaire
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

function AnalysisPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
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
        notify.success(`Analyse externe terminée : ${run.factorsCount} facteur(s) documenté(s).`);
      },
      [projectId, queryClient],
    ),
  );
  const synthesis = useLaunchedRun<ContextAnalysisRunSummary>(
    analysisRunsQuery.data,
    useMemo(
      () => (run: ContextAnalysisRunSummary) => {
        void queryClient.invalidateQueries({ queryKey: ["context-issues", projectId] });
        notify.success(`Synthèse terminée : ${run.issuesCount} enjeu(x) identifié(s).`);
      },
      [projectId, queryClient],
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
    onError: () => notify.error("Votre revue n’a pas pu être enregistrée. Réessayez."),
  });

  const externalRunning = launchExternal.isPending || external.isRunning;
  const synthesisRunning = launchSynthesis.isPending || synthesis.isRunning;
  const externalError = launchExternal.isError
    ? "L’analyse externe n’a pas pu être lancée. Vérifiez votre accès au projet puis réessayez."
    : external.errorMessage;
  const synthesisError = launchSynthesis.isError
    ? "La synthèse n’a pas pu être lancée. Vérifiez votre accès au projet puis réessayez."
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
        { label: "Projet", value: scope.projectName },
        { label: "Organisation", value: scope.organizationName || "—" },
        { label: "Référentiel", value: scope.isoStandard },
        { label: "Secteur / activité", value: scope.activity ?? "—" },
        {
          label: "Pays identifiés",
          value: scope.countries.join(", ") || "Non renseigné dans le profil validé",
        },
        {
          label: "Contexte interne",
          value: internalCompleted ? "Validé (étape 1)" : "À compléter",
        },
      ]
    : [];

  const exportDocument = useMemo(() => {
    if (!scope) return null;
    return buildContextDocument({
      organizationName: scope.organizationName || "—",
      projectName: scope.projectName,
      isoStandard: scope.isoStandard,
      method: displayedMethod,
      methodExplicit: displayedMethodExplicit,
      analysisDate: latestCompletedRun?.completedAt ?? latestCompletedRun?.createdAt ?? null,
      factors,
      issues,
    });
  }, [scope, displayedMethod, displayedMethodExplicit, latestCompletedRun, factors, issues]);

  return (
    <div className="mx-auto max-w-5xl py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Analyse des enjeux
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Identifiez et évaluez les facteurs internes et externes qui peuvent influencer la
          performance de votre organisation.
        </p>
      </header>

      <div className="mt-6 space-y-6">
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
              <>
                <InternalContextResults
                  inputs={savedInputs}
                  onEdit={() => setEditingInternal(true)}
                />
                <div className="flex justify-end">
                  <Button onClick={() => setStep(2)}>Continuer vers l’analyse externe</Button>
                </div>
              </>
            ) : (
              <InternalContextForm
                projectId={projectId}
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
                  ? METHOD_REQUIRED_MESSAGE
                  : step1Done
                    ? null
                    : "Complétez et validez le contexte interne (étape 1) avant de lancer l’analyse externe."
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
                  ? METHOD_REQUIRED_MESSAGE
                  : step2Done
                    ? null
                    : "Lancez d’abord l’analyse externe (étape 2) : la synthèse s’appuie sur des facteurs réellement documentés."
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
            <div className="flex flex-wrap items-center justify-end gap-3">
              <ManualIssueDialog projectId={projectId} />
            </div>

            <IssuesValidationPanel
              issues={issues}
              metrics={metrics}
              isReviewing={review.isPending}
              analysisDate={
                latestCompletedRun?.completedAt ?? latestCompletedRun?.createdAt ?? null
              }
              methodologyVersion={latestCompletedRun?.methodologyVersion ?? null}
              onReview={(input) => review.mutate(input)}
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
