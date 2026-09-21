/**
 * "Analyse des enjeux" (ISO 9001 §4.1) — steps 1 through 4.
 *
 * Product invariants enforced here, mirroring the domain layer
 * (@qhse/domain smqContext) and the API (ContextsService):
 * - Generated content never means completion; only an explicit professional
 *   decision (a review action, a saved answer) advances a step.
 * - The method choice (SWOT/PESTEL) only affects future runs; a run keeps
 *   the method it was executed with.
 * - Step 2's légal dimension is never searched here — it reuses the veille.
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  CheckIcon,
  DownloadIcon,
  LoaderCircleIcon,
  PlusIcon,
  ScaleIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import type {
  ApplyContextIssueOverride,
  ContextAnalysisMethod,
  ContextIssue,
  CreateManualContextIssue,
} from "@qhse/contracts";
import { ANALYSIS_METHOD_OPTIONS, analysisMethodLabel } from "@qhse/domain/smq/context/method";
import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Textarea } from "@qhse/ui/components/textarea";
import { cn } from "@qhse/ui/lib/utils";

import { clientApi } from "../../app/client-api.js";
import { INTERNAL_CONTEXT_SECTIONS } from "./internal-context-questions.js";

const STEPS = ["Contexte interne", "Analyse externe", "Synthèse des enjeux", "Validation"] as const;

const NATURE_LABELS: Record<string, string> = {
  force: "Force",
  faiblesse: "Faiblesse",
  opportunite: "Opportunité",
  menace: "Menace",
};

const REVIEW_LABELS: Record<string, string> = {
  PENDING: "À examiner",
  VALIDATED: "Retenu",
  MODIFIED: "Retenu et corrigé",
  NOT_RETAINED: "Non retenu",
};

const RUN_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "En préparation", tone: "bg-slate-100 text-slate-600" },
  RUNNING: { label: "En cours", tone: "bg-blue-50 text-blue-700" },
  COMPLETED: { label: "Terminé", tone: "bg-emerald-50 text-emerald-700" },
  FAILED: { label: "Échoué", tone: "bg-rose-50 text-rose-700" },
};

export function ContextPage() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) return null;
  return <ContextWorkflow projectId={projectId} />;
}

function ContextWorkflow({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [activeStep, setActiveStep] = useState(1);

  const watchQuery = useQuery({
    queryKey: ["regulatory-watch", projectId],
    queryFn: () => clientApi.regulatoryWatch(projectId),
  });

  const settingsQuery = useQuery({
    queryKey: ["context-settings", projectId],
    queryFn: () => clientApi.contextSettings(projectId),
    // The légal/réglementaire dimension is never searched by this module — it
    // reuses the published veille — so there is nothing useful to do here
    // until a register has been published at least once.
    enabled: watchQuery.data?.currentBaseline != null,
  });

  const setMethod = useMutation({
    mutationFn: (method: ContextAnalysisMethod) =>
      clientApi.setContextMethod(projectId, { method }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["context-settings", projectId] }),
  });

  if (watchQuery.isLoading) {
    return <LoadingBlock label="Chargement de l'analyse des enjeux…" />;
  }
  if (watchQuery.isError || !watchQuery.data) {
    return <ErrorBlock message="Impossible de charger la veille réglementaire." />;
  }
  if (watchQuery.data.currentBaseline == null) {
    return <IncompleteWatchState projectId={projectId} status={watchQuery.data.status} />;
  }

  if (settingsQuery.isLoading) {
    return <LoadingBlock label="Chargement de l'analyse des enjeux…" />;
  }
  if (settingsQuery.isError || !settingsQuery.data) {
    return <ErrorBlock message="Impossible de charger les paramètres de l'analyse." />;
  }
  const settings = settingsQuery.data;

  return (
    <div className="mx-auto max-w-5xl py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Analyse des enjeux</h1>
        <p className="mt-1 text-sm text-slate-500">
          Contexte interne et externe de l'organisation — ISO 9001, chapitre 4.1.
        </p>
      </header>

      {!settings.explicit ? (
        <MethodChoice
          onChoose={(method) => setMethod.mutate(method)}
          saving={setMethod.isPending}
        />
      ) : (
        <>
          <div className="mb-6 flex items-center gap-2 text-sm text-slate-600">
            <span>Méthode retenue :</span>
            <Badge variant="outline">{analysisMethodLabel(settings.analysisMethod)}</Badge>
          </div>

          <Stepper active={activeStep} onChange={setActiveStep} />

          <div className="mt-8">
            {activeStep === 1 && <InternalContextStep projectId={projectId} />}
            {activeStep === 2 && <ExternalResearchStep projectId={projectId} />}
            {activeStep === 3 && <SynthesisStep projectId={projectId} />}
            {activeStep === 4 && <ValidationStep projectId={projectId} />}
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------------- shared --------------------------------- */

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
      <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      <AlertCircleIcon className="size-4" aria-hidden="true" />
      {message}
    </div>
  );
}

const WATCH_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "pas encore lancée",
  ANALYZING: "en cours d'analyse",
  AWAITING_CLARIFICATION: "en attente de précisions",
  REVIEW_REQUIRED: "en attente de votre validation",
  STALE: "à revérifier",
  FAILED: "en échec",
};

/**
 * The légal/réglementaire dimension is never searched in step 2 — it reuses
 * the published veille (RegulatoryRegisterEntry) — and step 3's synthesis
 * reads that same published register. Neither can produce something honest
 * before a register has been published at least once, so the whole module
 * is gated here, the same way the veille itself gates on profile completion.
 */
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

function Stepper({ active, onChange }: { active: number; onChange: (step: number) => void }) {
  return (
    <ol
      aria-label="Étapes de l'analyse des enjeux"
      className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-200 pb-3"
    >
      {STEPS.map((label, index) => {
        const step = index + 1;
        const isActive = step === active;
        return (
          <li key={label}>
            <button
              type="button"
              aria-current={isActive ? "step" : undefined}
              onClick={() => onChange(step)}
              className={cn(
                "text-sm font-medium",
                isActive ? "text-slate-950" : "text-slate-400 hover:text-slate-600",
              )}
            >
              {step}. {label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------- step 1 --------------------------------- */

function InternalContextStep({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const inputsQuery = useQuery({
    queryKey: ["context-internal-inputs", projectId],
    queryFn: () => clientApi.contextInternalInputs(projectId),
  });

  if (inputsQuery.isLoading) return <LoadingBlock label="Chargement du contexte interne…" />;
  if (inputsQuery.isError)
    return <ErrorBlock message="Impossible de charger le contexte interne." />;

  const byKey = new Map(inputsQuery.data?.map((input) => [input.questionKey, input]) ?? []);
  const answeredCount =
    inputsQuery.data?.filter((input) => input.answerText.trim() && input.status === "answered")
      .length ?? 0;

  return (
    <div className="space-y-8">
      <p className="text-sm text-slate-500">
        Déclaré par vous : GetQhse ne génère rien ici. L'assistant ne fait que vérifier si votre
        réponse est complète et reformuler ce que vous avez écrit — jamais l'inverse.{" "}
        {answeredCount} réponse{answeredCount === 1 ? "" : "s"} enregistrée
        {answeredCount === 1 ? "" : "s"}.
      </p>
      {INTERNAL_CONTEXT_SECTIONS.map((section) => (
        <section key={section.key}>
          <h2 className="text-base font-semibold text-slate-950">{section.title}</h2>
          <p className="mt-1 text-sm text-slate-500">{section.helper}</p>
          <div className="mt-4 space-y-4">
            {section.questions.map((question) => (
              <QuestionChatCard
                key={question.questionKey}
                projectId={projectId}
                question={question}
                existing={byKey.get(question.questionKey)}
                onSaved={() => {
                  void queryClient.invalidateQueries({
                    queryKey: ["context-internal-inputs", projectId],
                  });
                }}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

type AssistTurn = { role: "user" | "assistant"; text: string };

/**
 * One question, one lightweight assisted-answer chat. Nothing here is
 * persisted until the assistant judges the answer sufficient (or the
 * professional saves it as-is): the exchange is ephemeral, held only in this
 * component's state — the same "declared, not generated" boundary as the
 * plain form, just easier to complete.
 */
function QuestionChatCard({
  projectId,
  question,
  existing,
  onSaved,
}: {
  projectId: string;
  question: { sectionKey: string; questionKey: string; label: string };
  existing?: { answerText: string; status: string } | undefined;
  onSaved: () => void;
}) {
  const isSaved = Boolean(existing?.answerText.trim() && existing.status === "answered");
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<AssistTurn[]>([]);
  const [draft, setDraft] = useState("");

  const save = useMutation({
    mutationFn: (answerText: string) =>
      clientApi.upsertContextInternalInput(projectId, {
        sectionKey: question.sectionKey,
        questionKey: question.questionKey,
        questionLabel: question.label,
        answerText,
        status: "answered",
      }),
    onSuccess: () => {
      onSaved();
      setOpen(false);
      setTurns([]);
      setDraft("");
    },
  });

  const assist = useMutation({
    mutationFn: (message: string) =>
      clientApi.assistContextAnswer(projectId, {
        sectionKey: question.sectionKey,
        questionKey: question.questionKey,
        questionLabel: question.label,
        history: turns,
        message,
      }),
  });

  const send = () => {
    const message = draft.trim();
    if (!message) return;
    setTurns((prev) => [...prev, { role: "user", text: message }]);
    setDraft("");
    assist.mutate(message, {
      onSuccess: (response) => {
        if (response.valid && response.structuredAnswer) {
          setTurns((prev) => [...prev, { role: "assistant", text: response.structuredAnswer! }]);
          save.mutate(response.structuredAnswer);
          return;
        }
        setTurns((prev) => [
          ...prev,
          { role: "assistant", text: response.followUpQuestion ?? response.reason },
        ]);
      },
    });
  };

  if (!open) {
    return (
      <div className="rounded-xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-800">{question.label}</p>
            {isSaved && <p className="mt-1 text-sm text-slate-600">{existing!.answerText}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isSaved && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                <CheckIcon className="size-3" aria-hidden="true" /> Enregistré
              </span>
            )}
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <SparklesIcon className="size-3.5" aria-hidden="true" />
              {isSaved ? "Modifier" : "Répondre"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-sm font-medium text-slate-800">{question.label}</p>
      <div className="mt-3 space-y-2">
        {isSaved && turns.length === 0 && (
          <ChatBubble role="assistant" text={`Réponse actuelle : « ${existing!.answerText} »`} />
        )}
        {turns.map((turn, index) => (
          <ChatBubble key={index} role={turn.role} text={turn.text} />
        ))}
        {assist.isPending && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden="true" />
            L'assistant relit votre réponse…
          </div>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Textarea
          rows={2}
          placeholder="Répondez avec vos propres mots…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <Button
          size="sm"
          variant="outline"
          disabled={save.isPending}
          onClick={() => {
            setOpen(false);
            setTurns([]);
            setDraft("");
          }}
        >
          Annuler
        </Button>
        <div className="flex gap-2">
          {draft.trim() === "" && turns.some((turn) => turn.role === "user") && (
            <Button
              size="sm"
              variant="outline"
              disabled={save.isPending}
              onClick={() => {
                const lastUser = [...turns].reverse().find((turn) => turn.role === "user");
                if (lastUser) save.mutate(lastUser.text);
              }}
            >
              Enregistrer tel quel
            </Button>
          )}
          <Button size="sm" disabled={!draft.trim() || assist.isPending} onClick={send}>
            Envoyer
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  const isAssistant = role === "assistant";
  return (
    <div className={cn("flex", isAssistant ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3 py-2 text-sm",
          isAssistant ? "bg-slate-100 text-slate-700" : "bg-slate-900 text-white",
        )}
      >
        {text}
      </div>
    </div>
  );
}

/* ---------------------------------- step 2 --------------------------------- */

function ExternalResearchStep({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const runsQuery = useQuery({
    queryKey: ["context-external-runs", projectId],
    queryFn: () => clientApi.contextExternalRuns(projectId),
    refetchInterval: (query) =>
      query.state.data?.some((run) => run.status === "RUNNING" || run.status === "DRAFT")
        ? 3_000
        : false,
  });

  const trigger = useMutation({
    mutationFn: () => clientApi.triggerContextExternalResearch(projectId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["context-external-runs", projectId] }),
  });

  const runs = runsQuery.data ?? [];
  const latest = runs[0];
  const isRunning = latest?.status === "RUNNING" || latest?.status === "DRAFT";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Analyse externe</h2>
          <p className="mt-1 text-sm text-slate-500">
            Une recherche web réelle, ancrée sur des sources vérifiables. La dimension légale n'est
            jamais recherchée ici : elle reprend votre veille réglementaire déjà établie.
          </p>
        </div>
        <Button onClick={() => trigger.mutate()} disabled={isRunning || trigger.isPending}>
          {isRunning ? (
            <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <SparklesIcon className="size-4" aria-hidden="true" />
          )}
          Lancer l'analyse externe
        </Button>
      </div>

      {runsQuery.isLoading ? (
        <LoadingBlock label="Chargement de l'historique…" />
      ) : (
        <RunHistory runs={runs} />
      )}
    </div>
  );
}

/* ---------------------------------- step 3 --------------------------------- */

function SynthesisStep({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const runsQuery = useQuery({
    queryKey: ["context-analysis-runs", projectId],
    queryFn: () => clientApi.contextAnalysisRuns(projectId),
    refetchInterval: (query) =>
      query.state.data?.some((run) => run.status === "RUNNING" || run.status === "DRAFT")
        ? 3_000
        : false,
  });

  const trigger = useMutation({
    mutationFn: () => clientApi.triggerContextSynthesis(projectId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["context-analysis-runs", projectId] }),
  });

  const runs = runsQuery.data ?? [];
  const latest = runs[0];
  const isRunning = latest?.status === "RUNNING" || latest?.status === "DRAFT";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Synthèse des enjeux</h2>
          <p className="mt-1 text-sm text-slate-500">
            Aucune recherche web ici : la synthèse ne raisonne que sur le contexte interne, les
            facteurs externes déjà documentés et le registre réglementaire publié.
          </p>
        </div>
        <Button onClick={() => trigger.mutate()} disabled={isRunning || trigger.isPending}>
          {isRunning ? (
            <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <SparklesIcon className="size-4" aria-hidden="true" />
          )}
          Lancer la synthèse
        </Button>
      </div>

      {runsQuery.isLoading ? (
        <LoadingBlock label="Chargement de l'historique…" />
      ) : (
        <RunHistory runs={runs} />
      )}
    </div>
  );
}

function RunHistory({
  runs,
}: {
  runs: { id: string; status: string; createdAt: string; errorMessage: string | null }[];
}) {
  if (runs.length === 0) {
    return <p className="text-sm text-slate-400">Aucun run pour le moment.</p>;
  }
  return (
    <ul className="space-y-2">
      {runs.map((run) => {
        const status = RUN_STATUS_LABELS[run.status] ?? { label: run.status, tone: "bg-slate-100" };
        return (
          <li
            key={run.id}
            className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
          >
            <span className="text-slate-600">
              {new Date(run.createdAt).toLocaleString("fr-FR")}
            </span>
            <span className="flex items-center gap-2">
              {run.errorMessage && (
                <span className="max-w-md truncate text-xs text-rose-600" title={run.errorMessage}>
                  {run.errorMessage}
                </span>
              )}
              <Badge className={cn("border-0", status.tone)}>{status.label}</Badge>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------- step 4 --------------------------------- */

function ValidationStep({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const issuesQuery = useQuery({
    queryKey: ["context-issues", projectId],
    queryFn: () => clientApi.contextIssues(projectId),
  });
  const [showManualDialog, setShowManualDialog] = useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["context-issues", projectId] });

  const override = useMutation({
    mutationFn: (input: { issueId: string; patch: ApplyContextIssueOverride }) =>
      clientApi.applyContextIssueOverride(projectId, input.issueId, input.patch),
    onSuccess: invalidate,
  });

  const createManual = useMutation({
    mutationFn: (input: CreateManualContextIssue) =>
      clientApi.createManualContextIssue(projectId, input),
    onSuccess: () => {
      void invalidate();
      setShowManualDialog(false);
    },
  });

  const exportWorkbook = useMutation({
    mutationFn: async () => {
      const buffer = await clientApi.exportContextRegister(projectId);
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "analyse-enjeux.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    },
  });

  if (issuesQuery.isLoading) return <LoadingBlock label="Chargement du registre…" />;
  if (issuesQuery.isError) return <ErrorBlock message="Impossible de charger le registre." />;

  const issues = issuesQuery.data ?? [];
  if (issues.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        Aucun enjeu à valider pour le moment : lancez la synthèse (étape 3) ou ajoutez un enjeu
        manuellement.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {issues.length} enjeu{issues.length === 1 ? "" : "x"} — retenez, corrigez ou écartez
          chacun.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowManualDialog(true)}>
            <PlusIcon className="size-4" aria-hidden="true" /> Ajouter un enjeu
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={exportWorkbook.isPending}
            onClick={() => exportWorkbook.mutate()}
          >
            <DownloadIcon className="size-4" aria-hidden="true" /> Exporter (Excel)
          </Button>
        </div>
      </div>

      <ul className="space-y-3">
        {issues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            onDecide={(reviewStatus) =>
              override.mutate({ issueId: issue.id, patch: { reviewStatus } })
            }
            deciding={override.isPending}
          />
        ))}
      </ul>

      {showManualDialog && (
        <ManualIssueDialog
          onCancel={() => setShowManualDialog(false)}
          onCreate={(input) => createManual.mutate(input)}
          creating={createManual.isPending}
        />
      )}
    </div>
  );
}

function IssueCard({
  issue,
  onDecide,
  deciding,
}: {
  issue: ContextIssue;
  onDecide: (status: "VALIDATED" | "NOT_RETAINED") => void;
  deciding: boolean;
}) {
  return (
    <li className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-950">{issue.title}</h3>
            {issue.sourceKind === "MANUAL" && (
              <Badge variant="outline" className="text-xs">
                Ajout manuel
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">{issue.description}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-500">
            <Badge variant="outline">{issue.origin === "INTERNAL" ? "Interne" : "Externe"}</Badge>
            {issue.nature && (
              <Badge variant="outline">{NATURE_LABELS[issue.nature] ?? issue.nature}</Badge>
            )}
            <Badge variant="outline">{issue.categoryLabel ?? "Autre"}</Badge>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge
            className={cn(
              "border-0",
              issue.reviewStatus === "VALIDATED" || issue.reviewStatus === "MODIFIED"
                ? "bg-emerald-50 text-emerald-700"
                : issue.reviewStatus === "NOT_RETAINED"
                  ? "bg-slate-100 text-slate-500"
                  : "bg-amber-50 text-amber-700",
            )}
          >
            {REVIEW_LABELS[issue.reviewStatus] ?? issue.reviewStatus}
          </Badge>
          {issue.reviewStatus === "PENDING" && (
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={deciding}
                onClick={() => onDecide("NOT_RETAINED")}
              >
                <XIcon className="size-3.5" aria-hidden="true" /> Non retenu
              </Button>
              <Button size="sm" disabled={deciding} onClick={() => onDecide("VALIDATED")}>
                <CheckIcon className="size-3.5" aria-hidden="true" /> Retenir
              </Button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function MethodChoice({
  onChoose,
  saving,
}: {
  onChoose: (method: ContextAnalysisMethod) => void;
  saving: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-6">
      <h2 className="text-base font-semibold text-slate-950">Choisissez la méthode d'analyse</h2>
      <p className="mt-1 text-sm text-slate-500">
        Ce choix affecte uniquement les runs futurs : il peut être fait une seule fois pour
        commencer.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {ANALYSIS_METHOD_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={saving}
            onClick={() => onChoose(option.value.toUpperCase() as ContextAnalysisMethod)}
            className="rounded-xl border border-slate-200 p-4 text-left hover:border-slate-400"
          >
            <span className="text-sm font-semibold text-slate-950">{option.title}</span>
            <p className="mt-1 text-xs text-slate-500">{option.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function ManualIssueDialog({
  onCancel,
  onCreate,
  creating,
}: {
  onCancel: () => void;
  onCreate: (input: CreateManualContextIssue) => void;
  creating: boolean;
}) {
  const [origin, setOrigin] = useState<"INTERNAL" | "EXTERNAL">("INTERNAL");
  const [nature, setNature] = useState<"force" | "faiblesse" | "opportunite" | "menace">("force");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const validNatures =
    origin === "INTERNAL"
      ? (["force", "faiblesse"] as const)
      : (["opportunite", "menace"] as const);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-base font-semibold text-slate-950">Ajouter un enjeu manuellement</h3>
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            {(["INTERNAL", "EXTERNAL"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setOrigin(value);
                  setNature(value === "INTERNAL" ? "force" : "opportunite");
                }}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm",
                  origin === value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200",
                )}
              >
                {value === "INTERNAL" ? "Interne" : "Externe"}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {validNatures.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setNature(value)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm",
                  nature === value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200",
                )}
              >
                {NATURE_LABELS[value]}
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="manual-title" className="text-sm font-medium text-slate-800">
              Intitulé
            </label>
            <input
              id="manual-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="manual-description" className="text-sm font-medium text-slate-800">
              Description
            </label>
            <Textarea
              id="manual-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button
            disabled={!title.trim() || !description.trim() || creating}
            onClick={() =>
              onCreate({
                origin,
                nature,
                title: title.trim(),
                description: description.trim(),
                categoryKey: "ajout_manuel",
                categoryLabel: "Ajout manuel",
              })
            }
          >
            Ajouter
          </Button>
        </div>
      </div>
    </div>
  );
}
