import { useModuleStep } from "../../hooks/use-module-step.js";
/**
 * "Analyse des enjeux" (ISO 9001 §4.1), following the demo template's three tabs:
 *
 * 1. Contexte interne — the declared internal context becomes forces and
 *    faiblesses (AI), which the user validates one by one.
 * 2. Analyse externe — SWOT and/or PESTEL, each its own deliverable.
 * 3. Synthèse des enjeux — the retained issues rated impact × capacité de
 *    maîtrise, validated once to unlock the exports.
 *
 * Runs execute in the worker: "running" is read from the latest run's status
 * instead of a pending request.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircleIcon, LoaderCircleIcon, ScaleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  ContextAnalysisMethod,
  ContextAnalysisRunSummary,
  ContextExternalRunSummary,
  ContextIssue,
  SupportedLanguage,
} from "@qhse/contracts";
import type { EvaluationLevel } from "@qhse/domain/smq/context/evaluation";
import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Skeleton } from "@qhse/ui/components/skeleton";
import { Toaster } from "@qhse/ui/components/toast";

import { clientApi } from "../../app/client-api.js";
import { ExternalAnalysisView } from "./context-step-external.js";
import { InternalContextForm, InternalIssuesView } from "./context-step-internal.js";
import {
  ContextExportMenu,
  IssuesEvaluation,
  IssuesSynthesisPanel,
  type EvaluationField,
  type IssueEditInput,
} from "./context-step-issues.js";
import { evaluatedIssues } from "./evaluation.js";
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
    query.state.data?.some(isActive) ? 3_000 : false;

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
  const internalIssuesQuery = useQuery({
    queryKey: ["context-internal-issues", projectId],
    queryFn: () => clientApi.contextInternalIssues(projectId),
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
  const internalIssues = internalIssuesQuery.data ?? [];
  const retainedInternal = internalIssues.filter(
    (issue) => issue.reviewStatus === "VALIDATED" || issue.reviewStatus === "MODIFIED",
  );
  const methods = settingsQuery.data?.analysisMethods ?? ["SWOT", "PESTEL"];
  const issues = issuesQuery.data ?? [];

  const runsOf = (kind: ContextAnalysisRunSummary["kind"]) =>
    (analysisRunsQuery.data ?? []).filter((run) => run.kind === kind);
  const internalRuns = runsOf("INTERNAL");
  const synthesisRuns = runsOf("SYNTHESIS");
  const latestSynthesis = synthesisRuns.find((run) => run.status === "COMPLETED") ?? null;
  const synthesisValidated = latestSynthesis?.validatedAt != null;

  // Tab 2 only shows an analysis made with exactly the selected methods: changing
  // the selection "clears" it, as in the template (it stays stored).
  const latestExternalRun =
    (externalRunsQuery.data ?? []).find((run) => run.status === "COMPLETED") ?? null;
  const externalGenerated =
    latestExternalRun != null &&
    latestExternalRun.analysisMethods.length === methods.length &&
    methods.every((method) => latestExternalRun.analysisMethods.includes(method));
  const factors = externalGenerated ? (factorsQuery.data ?? []) : [];

  /* ------------------------------- runs ------------------------------- */

  const invalidate = (key: string) =>
    void queryClient.invalidateQueries({ queryKey: [key, projectId] });

  const internal = useLaunchedRun<ContextAnalysisRunSummary>(
    internalRuns,
    useMemo(
      () => (run: ContextAnalysisRunSummary) => {
        void queryClient.invalidateQueries({ queryKey: ["context-internal-issues", projectId] });
        notify.success(t("page.internalDone", { count: run.issuesCount }));
      },
      [projectId, queryClient, t],
    ),
  );
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
    synthesisRuns,
    useMemo(
      () => (run: ContextAnalysisRunSummary) => {
        void queryClient.invalidateQueries({ queryKey: ["context-issues", projectId] });
        notify.success(t("page.synthesisDone", { count: run.issuesCount }));
      },
      [projectId, queryClient, t],
    ),
  );

  const launchInternal = useMutation({
    mutationFn: () => clientApi.triggerContextInternalIssues(projectId),
    onSuccess: (job) => {
      internal.track(job.runId);
      invalidate("context-analysis-runs");
    },
  });
  const launchExternal = useMutation({
    mutationFn: () => clientApi.triggerContextExternalResearch(projectId),
    onSuccess: (job) => {
      external.track(job.runId);
      invalidate("context-external-runs");
    },
  });
  const launchSynthesis = useMutation({
    mutationFn: () => clientApi.triggerContextSynthesis(projectId),
    onSuccess: (job) => {
      synthesis.track(job.runId);
      invalidate("context-analysis-runs");
    },
  });

  const saveMethods = useMutation({
    mutationFn: (next: ContextAnalysisMethod[]) =>
      clientApi.setContextMethods(projectId, { methods: next }),
    onSuccess: (next) => queryClient.setQueryData(["context-settings", projectId], next),
    onError: () => notify.error(t("external.methodSaveFailed")),
  });
  const toggleMethod = (method: ContextAnalysisMethod) => {
    const next = methods.includes(method)
      ? methods.filter((value) => value !== method)
      : [...methods, method];
    if (next.length === 0) {
      notify.error(t("external.keepOneMethod"));
      return;
    }
    saveMethods.mutate(next);
  };

  /** Replaces an issue in whichever list holds it (tab 1 or tab 3). */
  const replaceIssue = (updated: ContextIssue) => {
    for (const key of ["context-internal-issues", "context-issues"]) {
      queryClient.setQueryData<ContextIssue[]>([key, projectId], (current) =>
        current?.map((issue) => (issue.id === updated.id ? updated : issue)),
      );
    }
  };
  // A change to a validated synthesis re-opens it on the server.
  const afterSynthesisChange = () => invalidate("context-analysis-runs");

  /** Tab 1 "Valider" / "✓ Validé": an audited review of one internal issue. */
  const toggleInternal = useMutation({
    mutationFn: (issue: ContextIssue) => {
      const retained = issue.reviewStatus === "VALIDATED" || issue.reviewStatus === "MODIFIED";
      return clientApi.applyContextIssueOverride(projectId, issue.id, {
        reviewStatus: retained ? "PENDING" : "VALIDATED",
        correctionReason: retained
          ? t("issues.reasons.internalReopened")
          : t("issues.reasons.internalValidated"),
      });
    },
    onSuccess: replaceIssue,
    onError: () => notify.error(t("page.reviewFailed")),
  });
  const edit = useMutation({
    mutationFn: (input: IssueEditInput) =>
      clientApi.applyContextIssueOverride(projectId, input.issueId, {
        ...(input.title ? { title: input.title } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.nature ? { nature: input.nature } : {}),
        correctionReason: input.reason,
      }),
    onSuccess: (updated) => {
      replaceIssue(updated);
      afterSynthesisChange();
    },
    onError: () => notify.error(t("page.reviewFailed")),
  });

  const issuesKey = ["context-issues", projectId];
  /** A rating changes the table at once; the audited override follows. */
  const rate = useMutation({
    mutationFn: ({
      issue,
      field,
      value,
    }: {
      issue: ContextIssue;
      field: EvaluationField;
      value: EvaluationLevel;
    }) =>
      clientApi.applyContextIssueOverride(projectId, issue.id, {
        scores: { ...issue.scores, [field]: value },
        correctionReason: t("issues.reasons.rated"),
      }),
    onMutate: async ({ issue, field, value }) => {
      await queryClient.cancelQueries({ queryKey: issuesKey });
      const previous = queryClient.getQueryData<ContextIssue[]>(issuesKey);
      replaceIssue({ ...issue, scores: { ...issue.scores, [field]: value } });
      return { previous };
    },
    onSuccess: (updated) => {
      replaceIssue(updated);
      afterSynthesisChange();
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData(issuesKey, context?.previous);
      notify.error(t("issues.evaluation.rateFailed"));
    },
  });
  const validateSynthesis = useMutation({
    mutationFn: () => clientApi.validateContextSynthesis(projectId),
    onSuccess: () => notify.success(t("issues.evaluation.validatedToast")),
    onError: () => notify.error(t("page.reviewFailed")),
    onSettled: () => {
      invalidate("context-analysis-runs");
      invalidate("context-issues");
    },
  });

  const internalRunning = launchInternal.isPending || internal.isRunning;
  const externalRunning = launchExternal.isPending || external.isRunning;
  const synthesisRunning = launchSynthesis.isPending || synthesis.isRunning;
  const internalError = launchInternal.isError
    ? t("page.internalLaunchFailed")
    : internal.errorMessage;
  const externalError = launchExternal.isError
    ? t("page.externalLaunchFailed")
    : external.errorMessage;
  const synthesisError = launchSynthesis.isError
    ? t("page.synthesisLaunchFailed")
    : synthesis.errorMessage;

  /* ------------------------------- steps ------------------------------- */

  const step1Done = retainedInternal.length > 0;
  const step2Done = externalGenerated;
  const completedSteps = [
    ...(step1Done ? [1] : []),
    ...(step2Done ? [2] : []),
    ...(synthesisValidated ? [3] : []),
  ];

  const isLoadingStep =
    inputsQuery.isLoading ||
    internalIssuesQuery.isLoading ||
    factorsQuery.isLoading ||
    issuesQuery.isLoading ||
    externalRunsQuery.isLoading;
  const { step, setStep, explicit } = useModuleStep(3);
  const [autoAdvanced, setAutoAdvanced] = useState(false);
  useEffect(() => {
    if (autoAdvanced || isLoadingStep || explicit) return;
    // Open on the first tab still to do, as a returning user expects.
    setStep(issues.length > 0 || step2Done ? 3 : step1Done ? 2 : 1);
    setAutoAdvanced(true);
  }, [autoAdvanced, isLoadingStep, issues.length, step1Done, step2Done, explicit, setStep]);

  const [editingInternal, setEditingInternal] = useState(false);
  const showQuestions = !internalCompleted || editingInternal;

  // The synthesis needs a new run when tab 1 or tab 2 changed after it.
  const synthesisOutdated =
    latestSynthesis?.completedAt != null &&
    [
      latestExternalRun?.completedAt,
      internalRuns.find((run) => run.status === "COMPLETED")?.completedAt,
    ].some((at) => at != null && at > latestSynthesis.completedAt!);
  const synthesisBlockedReason = !step1Done
    ? t("page.internalFirst")
    : !step2Done
      ? t("page.externalFirst")
      : null;
  const showSynthesisLaunch =
    issues.length === 0 ||
    synthesisOutdated ||
    synthesisRunning ||
    !!synthesisError ||
    synthesisBlockedReason != null;

  const scope = scopeQuery.data;
  const exportDocument = useMemo(() => {
    if (!scope) return null;
    return buildContextDocument({
      language: projectLanguage,
      organizationName: scope.organizationName || "—",
      projectName: scope.projectName,
      isoStandard: scope.isoStandard,
      method: methods[0] ?? "SWOT",
      methodExplicit: true,
      methodsPerformed: methods,
      analysisDate: latestSynthesis?.completedAt ?? latestSynthesis?.createdAt ?? null,
      factors,
      issues,
    });
  }, [scope, projectLanguage, methods, latestSynthesis, factors, issues]);

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
          maxReachableStep={3}
          onStepChange={setStep}
          action={
            <ContextExportMenu
              projectId={projectId}
              document={exportDocument}
              enabled={synthesisValidated}
            />
          }
        />

        {isLoadingStep ? (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : step === 1 ? (
          showQuestions ? (
            <InternalContextForm
              projectId={projectId}
              projectLanguage={projectLanguage}
              existingInputs={savedInputs}
              onCompleted={() => setEditingInternal(false)}
            />
          ) : (
            <InternalIssuesView
              inputs={savedInputs}
              issues={internalIssues}
              isRunning={internalRunning}
              isSaving={toggleInternal.isPending || edit.isPending}
              errorMessage={internalRunning ? null : internalError}
              onGenerate={() => {
                if (!internalRunning) launchInternal.mutate();
              }}
              onToggleValidated={(issue) => toggleInternal.mutate(issue)}
              onEdit={(input) => edit.mutate(input)}
              onEditAnswers={() => setEditingInternal(true)}
              onContinue={() => setStep(2)}
            />
          )
        ) : step === 2 ? (
          <ExternalAnalysisView
            methods={methods}
            generated={externalGenerated}
            factors={factors}
            internalIssues={retainedInternal}
            isSavingMethods={saveMethods.isPending}
            isRunning={externalRunning}
            errorMessage={externalRunning ? null : externalError}
            canLaunch={internalCompleted}
            blockedReason={internalCompleted ? null : t("page.questionsFirst")}
            onToggleMethod={toggleMethod}
            onLaunch={() => {
              if (!internalCompleted || externalRunning) return;
              launchExternal.mutate();
            }}
            onContinue={() => setStep(3)}
          />
        ) : (
          <IssuesSynthesisPanel
            showLaunch={showSynthesisLaunch}
            hasIssues={issues.length > 0}
            canLaunch={synthesisBlockedReason == null}
            blockedReason={synthesisBlockedReason}
            isRunning={synthesisRunning}
            errorMessage={synthesisRunning ? null : synthesisError}
            onLaunch={() => {
              if (synthesisBlockedReason != null || synthesisRunning) return;
              launchSynthesis.mutate();
            }}
          >
            <IssuesEvaluation
              issues={issues}
              validated={synthesisValidated}
              isSaving={edit.isPending || validateSynthesis.isPending}
              isValidating={validateSynthesis.isPending}
              onRate={(issue, field, value) => rate.mutate({ issue, field, value })}
              onEdit={(input) => edit.mutate(input)}
              onValidate={() => {
                if (evaluatedIssues(issues).length > 0) validateSynthesis.mutate();
              }}
              onBack={() => setStep(2)}
            />
          </IssuesSynthesisPanel>
        )}
      </div>
    </div>
  );
}
