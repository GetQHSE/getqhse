/**
 * Steps 3 and 4 — synthèse des enjeux, validation, vue SWOT/PESTEL and
 * export. Same behaviour and wording as the foundation's panels, rendered in
 * the demo template's visual language (issue cards, SWOT matrix, PESTEL grid).
 */
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileDownIcon, FileTextIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  ContextAnalysisMethod,
  ContextAnalysisRunSummary,
  ContextIssue,
  ContextIssueReviewStatus,
  SupportedLanguage,
} from "@qhse/contracts";
import {
  evidenceSourceLabel,
  groupCorrections,
  hasAnalysisCorrection,
} from "@qhse/domain/smq/context/labels";
import {
  analysisMethodLabel,
  pestelDimensionKey,
  pestelDimensions,
  swotQuadrants,
} from "@qhse/domain/smq/context/method";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@qhse/ui/components/dialog";
import { Input } from "@qhse/ui/components/input";
import { Label } from "@qhse/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@qhse/ui/components/native-select";
import { Textarea } from "@qhse/ui/components/textarea";
import { cn } from "@qhse/ui/lib/utils";

import { clientApi } from "../../app/client-api.js";
import { useFormat } from "../../app/format.js";
import { currentLanguage, i18n } from "../../app/i18n.js";
import {
  AiBanner,
  ContextRunHistory,
  EmptyState,
  ErrorState,
  FooterCard,
  GqButton,
  ProcessingState,
  ResultsHead,
  notify,
} from "./context-ui.js";
import type { ContextDocument } from "./export/document.js";

type Nature = "force" | "faiblesse" | "opportunite" | "menace";

export interface ReviewIssueInput {
  issueId: string;
  reviewStatus?: ContextIssueReviewStatus;
  selectedPriority?: boolean;
  title?: string;
  description?: string;
  nature?: Nature;
  reason: string;
}

const NATURES = ["force", "faiblesse", "opportunite", "menace"] as const;

function isNature(value: string | null | undefined): value is Nature {
  return (NATURES as readonly string[]).includes(value ?? "");
}

const NATURE_TONES: Record<string, string> = {
  force: "is-strength",
  faiblesse: "is-weak",
  opportunite: "is-opportunity",
  menace: "is-threat",
};

export function computeIssueMetrics(issues: ContextIssue[]) {
  return {
    total: issues.length,
    internal: issues.filter((issue) => issue.origin === "INTERNAL").length,
    external: issues.filter((issue) => issue.origin === "EXTERNAL").length,
    /* Only currently retained issues count as active priorities. */
    priority: issues.filter(
      (issue) => issue.selectedPriority && issue.reviewStatus !== "NOT_RETAINED",
    ).length,
    validated: issues.filter((issue) => issue.reviewStatus === "VALIDATED").length,
    /* "Corrigés" = a human changed the analysis itself, even if later validated. */
    modified: issues.filter(
      (issue) => issue.reviewStatus === "MODIFIED" || hasAnalysisCorrection(issue.corrections),
    ).length,
    notRetained: issues.filter((issue) => issue.reviewStatus === "NOT_RETAINED").length,
    pending: issues.filter((issue) => issue.reviewStatus === "PENDING").length,
  };
}

function isRetained(issue: ContextIssue): boolean {
  return issue.reviewStatus === "VALIDATED" || issue.reviewStatus === "MODIFIED";
}

/* --------------------------------- issue card -------------------------------- */

export function ContextIssueCard({
  issue,
  showReviewActions = false,
  isReviewing = false,
  onReview,
}: {
  issue: ContextIssue;
  showReviewActions?: boolean;
  isReviewing?: boolean;
  onReview?: (input: ReviewIssueInput) => void;
}) {
  const { t } = useTranslation("context");
  const format = useFormat();
  const language = currentLanguage();
  const natureLabel = (value: string | null | undefined) =>
    isNature(value) ? t(`issues.nature.${value}`) : (value ?? t("issues.issue"));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description ?? "");
  const [nature, setNature] = useState(issue.nature ?? "force");
  const [reason, setReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const scores = issue.scores;
  const auditEvents = useMemo(
    () => groupCorrections(issue.corrections, language),
    [issue.corrections, language],
  );
  const humanEdited = issue.humanOverride || hasAnalysisCorrection(issue.corrections);
  const isValidated = issue.reviewStatus === "VALIDATED";
  const isNotRetained = issue.reviewStatus === "NOT_RETAINED";
  const firstEvidence = issue.evidence.find((item) => item.excerpt);

  const submitEdit = () => {
    if (!onReview || reason.trim().length < 5) return;
    const payload: ReviewIssueInput = {
      issueId: issue.id,
      reviewStatus: "MODIFIED",
      reason: reason.trim(),
    };
    if (title.trim() && title.trim() !== issue.title) payload.title = title.trim();
    if (description.trim() !== (issue.description ?? "")) payload.description = description.trim();
    if (nature !== issue.nature) payload.nature = nature as Nature;
    onReview(payload);
    setEditOpen(false);
    setReason("");
  };

  const submitReject = () => {
    if (!onReview || rejectReason.trim().length < 5) return;
    onReview({
      issueId: issue.id,
      reviewStatus: "NOT_RETAINED",
      selectedPriority: false,
      reason: rejectReason.trim(),
    });
    setRejectOpen(false);
    setRejectReason("");
  };

  return (
    <article
      className={cn(
        "gq-issue-card",
        showReviewActions && isRetained(issue) && "is-validated",
        isNotRetained && "is-dimmed",
      )}
    >
      <div className="gq-issue-tags">
        <span className={cn("gq-type", issue.nature ? NATURE_TONES[issue.nature] : undefined)}>
          {natureLabel(issue.nature)}
        </span>
        <span className="gq-tag">
          {issue.origin === "INTERNAL" ? t("issues.internalIssue") : t("issues.externalIssue")}
        </span>
        {issue.categoryLabel ? <span className="gq-tag">{issue.categoryLabel}</span> : null}
        <span className={cn("gq-tag", isRetained(issue) && "text-violet-700")}>
          {t(`issues.review.${issue.reviewStatus}`)}
        </span>
        {issue.selectedPriority && !isNotRetained ? (
          <span className="gq-badge is-strong">{t("issues.priority")}</span>
        ) : null}
        {issue.comparisonStatus === "recurrent" ? (
          <span className="gq-tag">{t("issues.recurrent")}</span>
        ) : null}
        {issue.sourceKind === "MANUAL" ? (
          <span className="gq-tag">{t("issues.addedByYou")}</span>
        ) : null}
      </div>

      <h4>{issue.title}</h4>
      {issue.description ? <p>{issue.description}</p> : null}

      <div className="gq-scores" title={t("issues.scoreHelper")}>
        {(
          [
            [t("external.objectives"), scores.influenceObjectives],
            [t("external.quality"), scores.influenceQuality],
            [t("external.customer"), scores.influenceCustomer],
            [t("issues.overall"), scores.overall],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="gq-score">
            <small>{label}</small>
            <strong>{value ?? "—"}</strong>
            <small className="inline"> / 5</small>
          </div>
        ))}
      </div>

      {firstEvidence ? (
        <div className="gq-evidence">
          {t("issues.factUsed", { excerpt: firstEvidence.excerpt })}
        </div>
      ) : null}

      <div>
        <GqButton
          variant="ghost"
          size="sm"
          className="mt-2 -ms-2"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          {detailsOpen ? t("issues.hideReasoning") : t("issues.showReasoning")}
        </GqButton>
      </div>

      {detailsOpen ? (
        <div className="gq-details">
          {issue.impactOverall ? (
            <div>
              <strong>{t("issues.overallImpact")}</strong>
              {issue.impactOverall}
            </div>
          ) : null}
          {issue.aiReasoning ? (
            <div>
              <strong>{t("issues.reasoning")}</strong>
              {issue.aiReasoning}
            </div>
          ) : null}
          {issue.evidence.length > 0 ? (
            <div>
              <strong>{t("issues.evidence", { count: issue.evidence.length })}</strong>
              <ul className="m-0 list-none space-y-1 p-0">
                {issue.evidence.map((item) => (
                  <li key={item.id}>
                    <span className="text-slate-900">
                      {item.originKind === "USER"
                        ? t("issues.userEvidence")
                        : evidenceSourceLabel(item.sourceType, language)}
                    </span>
                    {item.excerpt ? ` — « ${item.excerpt} »` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {humanEdited ? (
            <div className="gq-origin-box">
              <strong>{t("issues.initialConclusion")}</strong>
              {issue.aiTitle}
              {issue.aiNature ? ` · ${natureLabel(issue.aiNature)}` : ""}
              {issue.aiDescription ? <div className="mt-1">{issue.aiDescription}</div> : null}
              <div className="mt-1">
                {isValidated ? t("issues.expertBeforeValidation") : t("issues.expertValues")}
              </div>
            </div>
          ) : null}
          {auditEvents.length > 0 ? (
            <div>
              <strong>{t("issues.decisions", { count: auditEvents.length })}</strong>
              <ul className="m-0 list-none space-y-1.5 p-0">
                {auditEvents.map((event) => (
                  <li key={event.id}>
                    <span className="text-slate-900">{event.label}</span> ·{" "}
                    {format.dateTime(event.createdAt)}
                    {event.details.length > 0 ? <span> · {event.details.join(" · ")}</span> : null}
                    {event.reason ? (
                      <div>{t("issues.reason", { reason: event.reason })}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="m-0 text-[11px] text-slate-400">{t("issues.scoreHelper")}</p>
        </div>
      ) : null}

      {showReviewActions && onReview ? (
        <div className="gq-issue-actions">
          {isNotRetained ? (
            <>
              <GqButton
                size="sm"
                disabled={isReviewing}
                onClick={() =>
                  onReview({
                    issueId: issue.id,
                    reviewStatus: "PENDING",
                    reason: t("issues.reasons.reinstated"),
                  })
                }
              >
                {t("issues.reinstate")}
              </GqButton>
              <GqButton
                size="sm"
                variant="ghost"
                disabled={isReviewing}
                onClick={() => setEditOpen(true)}
              >
                {t("issues.editAnalysis")}
              </GqButton>
            </>
          ) : (
            <>
              <GqButton size="sm" disabled={isReviewing} onClick={() => setEditOpen(true)}>
                {t("issues.editAnalysis")}
              </GqButton>
              <GqButton
                size="sm"
                disabled={isReviewing}
                onClick={() =>
                  onReview({
                    issueId: issue.id,
                    selectedPriority: !issue.selectedPriority,
                    reason: issue.selectedPriority
                      ? t("issues.reasons.priorityRemoved")
                      : t("issues.reasons.priorityAdded"),
                  })
                }
              >
                {issue.selectedPriority ? t("issues.removePriority") : t("issues.markPriority")}
              </GqButton>
              <GqButton
                size="sm"
                variant="ghost"
                disabled={isReviewing}
                onClick={() => setRejectOpen(true)}
              >
                {t("issues.reject")}
              </GqButton>
              {isValidated ? (
                <span className="gq-badge is-valid ms-auto self-center">
                  {t("issues.validatedBadge")}
                </span>
              ) : (
                <GqButton
                  size="sm"
                  variant="primary"
                  className="ms-auto"
                  disabled={isReviewing}
                  onClick={() =>
                    onReview({
                      issueId: issue.id,
                      reviewStatus: "VALIDATED",
                      reason: t("issues.reasons.validated"),
                    })
                  }
                >
                  {t("issues.validate")}
                </GqButton>
              )}
            </>
          )}
        </div>
      ) : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="gq-analysis">
          <DialogHeader>
            <DialogTitle>{t("issues.editTitle")}</DialogTitle>
            <DialogDescription>{t("issues.editBody")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`title-${issue.id}`}>{t("issues.fieldTitle")}</Label>
              <Input
                id={`title-${issue.id}`}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`description-${issue.id}`}>{t("issues.fieldDescription")}</Label>
              <Textarea
                id={`description-${issue.id}`}
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`nature-${issue.id}`}>{t("issues.fieldNature")}</Label>
              <NativeSelect
                id={`nature-${issue.id}`}
                className="w-full"
                value={nature}
                onChange={(event) => setNature(event.target.value)}
              >
                {NATURES.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {t(`issues.nature.${value}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`reason-${issue.id}`}>{t("issues.fieldReason")}</Label>
              <Textarea
                id={`reason-${issue.id}`}
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t("issues.reasonPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <GqButton onClick={() => setEditOpen(false)}>{t("cancel", { ns: "common" })}</GqButton>
            <GqButton
              variant="primary"
              disabled={reason.trim().length < 5 || isReviewing}
              onClick={submitEdit}
            >
              {t("issues.saveCorrection")}
            </GqButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="gq-analysis">
          <DialogHeader>
            <DialogTitle>{t("issues.rejectTitle")}</DialogTitle>
            <DialogDescription>{t("issues.rejectBody")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`reject-${issue.id}`}>{t("issues.rejectReason")}</Label>
            <Textarea
              id={`reject-${issue.id}`}
              rows={3}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder={t("issues.rejectPlaceholder")}
            />
          </div>
          <DialogFooter>
            <GqButton onClick={() => setRejectOpen(false)}>
              {t("cancel", { ns: "common" })}
            </GqButton>
            <GqButton
              variant="primary"
              disabled={rejectReason.trim().length < 5 || isReviewing}
              onClick={submitReject}
            >
              {t("confirm", { ns: "common" })}
            </GqButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

/* ---------------------------------- step 3 ---------------------------------- */

function IssueGroup({
  label,
  helper,
  issues,
}: {
  label: string;
  helper?: string;
  issues: ContextIssue[];
}) {
  return (
    <div className="mt-5">
      <h4 className="mb-0.5 text-[13px] font-semibold text-slate-900">
        {label} <span className="font-normal text-slate-400">· {issues.length}</span>
      </h4>
      {helper ? <p className="mb-2.5 text-[11.5px] text-slate-400">{helper}</p> : null}
      <div className="gq-issue-grid">
        {issues.map((issue) => (
          <ContextIssueCard key={issue.id} issue={issue} />
        ))}
      </div>
    </div>
  );
}

export function IssuesSynthesisPanel({
  issues,
  runs,
  canLaunch,
  blockedReason,
  isRunning,
  errorMessage,
  onLaunch,
  onContinue,
}: {
  issues: ContextIssue[];
  runs: ContextAnalysisRunSummary[];
  canLaunch: boolean;
  blockedReason: string | null;
  isRunning: boolean;
  errorMessage: string | null;
  onLaunch: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation("context");
  const natureGroups = swotQuadrants(currentLanguage());
  const hasIssues = issues.length > 0;
  const others = issues.filter((issue) => !isNature(issue.nature));
  const internalCount = issues.filter((issue) => issue.origin === "INTERNAL").length;

  return (
    <div className="space-y-4">
      <AiBanner
        title={t("issues.synthesisTitle")}
        description={t("issues.synthesisBody")}
        action={
          <GqButton variant="primary" disabled={!canLaunch || isRunning} onClick={onLaunch}>
            {isRunning
              ? t("issues.synthesisRunning")
              : hasIssues
                ? t("issues.rerunSynthesis")
                : t("issues.runSynthesis")}
          </GqButton>
        }
      >
        {blockedReason ? (
          <p className="mt-4 text-[12.5px] text-slate-500">{blockedReason}</p>
        ) : null}
      </AiBanner>

      {isRunning ? (
        <ProcessingState
          title={t("issues.synthesisRunningTitle")}
          description={t("issues.synthesisRunningBody")}
        />
      ) : null}

      {errorMessage ? (
        <ErrorState
          title={t("issues.synthesisFailed")}
          description={errorMessage}
          onRetry={canLaunch ? onLaunch : undefined}
        />
      ) : null}

      {!hasIssues && !isRunning && !errorMessage ? (
        <EmptyState
          title={t("issues.synthesisEmptyTitle")}
          description={t("issues.synthesisEmptyBody")}
        />
      ) : null}

      {hasIssues ? (
        <section className="gq-section">
          <ResultsHead
            label={t("issues.synthesisTitle")}
            title={t("issues.identified")}
            description={t("issues.identifiedBody", {
              total: issues.length,
              internal: internalCount,
              external: issues.length - internalCount,
            })}
            badge={<span className="gq-badge is-valid">{t("external.done")}</span>}
          />
          {natureGroups.map((group) => {
            const items = issues.filter((issue) => issue.nature === group.key);
            return items.length > 0 ? (
              <IssueGroup
                key={group.key}
                label={group.label}
                helper={group.helper}
                issues={items}
              />
            ) : null;
          })}
          {others.length > 0 ? (
            <IssueGroup label={t("issues.groups.others")} issues={others} />
          ) : null}
        </section>
      ) : null}

      {hasIssues ? (
        <FooterCard
          title={t("issues.synthesisReady")}
          description={t("issues.synthesisReadyBody")}
          action={
            <GqButton variant="primary" onClick={onContinue} disabled={isRunning}>
              {t("issues.toValidation")}
            </GqButton>
          }
        />
      ) : null}

      <ContextRunHistory
        title={t("issues.synthesisHistory")}
        runs={runs.map((run) => ({
          id: run.id,
          status: run.status,
          createdAt: run.createdAt,
          errorMessage: run.errorMessage,
          detail: t("issues.synthesisHistoryDetail", {
            total: run.issuesCount,
            internal: run.internalCount,
            external: run.externalCount,
          }),
        }))}
      />
    </div>
  );
}

/* ---------------------------------- step 4 ---------------------------------- */

type Filter = "pending" | "retained" | "not_retained" | "all";

const FILTERS: Filter[] = ["pending", "retained", "not_retained", "all"];

/** The filter tab an issue lands in once reviewed. */
const DESTINATION: Record<ContextIssueReviewStatus, Filter> = {
  VALIDATED: "retained",
  MODIFIED: "retained",
  NOT_RETAINED: "not_retained",
  PENDING: "pending",
};

export function IssuesValidationPanel({
  issues,
  metrics,
  isReviewing,
  onReview,
  analysisDate,
  methodologyVersion,
  headerAction,
}: {
  issues: ContextIssue[];
  metrics: ReturnType<typeof computeIssueMetrics>;
  isReviewing: boolean;
  onReview: (input: ReviewIssueInput) => void;
  analysisDate: string | null;
  methodologyVersion: string | null;
  headerAction?: ReactNode;
}) {
  const { t } = useTranslation("context");
  const format = useFormat();
  const [filter, setFilter] = useState<Filter>("pending");

  const filtered = issues.filter((issue) => {
    if (filter === "all") return true;
    if (filter === "pending") return issue.reviewStatus === "PENDING";
    if (filter === "not_retained") return issue.reviewStatus === "NOT_RETAINED";
    return isRetained(issue);
  });

  const handleReview = (input: ReviewIssueInput) => {
    onReview(input);
    if (input.reviewStatus && filter !== "all") {
      const destination = DESTINATION[input.reviewStatus];
      if (destination !== filter) {
        notify.success(t("issues.movedTo", { destination: t(`issues.filters.${destination}`) }));
      }
    }
  };

  if (issues.length === 0) {
    return (
      <EmptyState
        title={t("issues.validationEmptyTitle")}
        description={t("issues.validationEmptyBody")}
      />
    );
  }

  const retained = metrics.total - metrics.notRetained;
  const counters: [string, number][] = [
    [t("issues.counters.total"), metrics.total],
    [t("issues.counters.pending"), metrics.pending],
    [t("issues.counters.validated"), metrics.validated],
    [t("issues.counters.modified"), metrics.modified],
    [t("issues.counters.notRetained"), metrics.notRetained],
    [t("issues.counters.priority"), metrics.priority],
  ];

  return (
    <div className="space-y-4">
      <AiBanner
        title={t("issues.validationTitle")}
        description={t("issues.validationBody")}
        action={headerAction}
      >
        <div className="gq-metrics">
          {counters.map(([label, value]) => (
            <div key={label} className="gq-metric">
              <small>{label}</small>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">{t("issues.countersNote")}</p>
      </AiBanner>

      <nav className="gq-tabs !my-0" aria-label={t("issues.filterNav")}>
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            className={cn("gq-tab", filter === item && "is-active")}
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
          >
            {t(`issues.filters.${item}`)}
          </button>
        ))}
      </nav>

      {filtered.length === 0 ? (
        <p className="text-[12.5px] text-slate-500">{t("issues.noneInSelection")}</p>
      ) : (
        <div className="gq-issue-grid">
          {filtered.map((issue) => (
            <ContextIssueCard
              key={issue.id}
              issue={issue}
              showReviewActions
              isReviewing={isReviewing}
              onReview={handleReview}
            />
          ))}
        </div>
      )}

      {metrics.pending === 0 ? (
        <FooterCard
          title={t("issues.validatedTitle")}
          description={t("issues.validatedBody", {
            retained,
            notRetained: metrics.notRetained,
            priority: metrics.priority,
            date: analysisDate ? t("issues.analysisOf", { date: format.date(analysisDate) }) : "",
            methodology: methodologyVersion
              ? t("issues.methodology", { version: methodologyVersion })
              : "",
          })}
        />
      ) : (
        <FooterCard
          title={t("issues.reviewed", {
            reviewed: metrics.total - metrics.pending,
            total: metrics.total,
          })}
          description={t("issues.reviewedBody")}
        />
      )}
    </div>
  );
}

/**
 * Manual addition of an issue by a member: saved as added by the
 * organisation (never as an AI conclusion) and retained.
 */
export function ManualIssueDialog({
  projectId,
  projectLanguage,
}: {
  projectId: string;
  /** The default category is stored in the register, so in the project language. */
  projectLanguage: SupportedLanguage;
}) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("context");
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<"INTERNAL" | "EXTERNAL">("INTERNAL");
  const [nature, setNature] = useState<Nature>("force");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setOrigin("INTERNAL");
    setNature("force");
    setTitle("");
    setDescription("");
    setCategory("");
    setError(null);
  };

  const create = useMutation({
    mutationFn: () =>
      clientApi.createManualContextIssue(projectId, {
        origin,
        nature,
        title: title.trim(),
        description: description.trim(),
        categoryKey: "ajout_manuel",
        categoryLabel:
          category.trim() || i18n.getFixedT(projectLanguage, "context")("export.manualCategory"),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["context-issues", projectId] });
      notify.success(t("issues.manual.added"));
      setOpen(false);
      reset();
    },
    onError: (mutationError) =>
      setError(
        mutationError instanceof Error ? mutationError.message : t("issues.manual.addFailed"),
      ),
  });

  const natureOptions: Nature[] =
    origin === "INTERNAL" ? ["force", "faiblesse"] : ["opportunite", "menace"];

  const submit = () => {
    setError(null);
    if (title.trim().length < 3) {
      setError(t("issues.manual.titleTooShort"));
      return;
    }
    if (description.trim().length < 3) {
      setError(t("issues.manual.describe"));
      return;
    }
    create.mutate();
  };

  return (
    <>
      <GqButton onClick={() => setOpen(true)}>
        <PlusIcon className="size-4" aria-hidden />
        {t("issues.manual.add")}
      </GqButton>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="gq-analysis max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("issues.manual.add")}</DialogTitle>
            <DialogDescription>{t("issues.manual.body")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="manual-issue-origin">{t("issues.manual.origin")}</Label>
                <NativeSelect
                  id="manual-issue-origin"
                  className="w-full"
                  value={origin}
                  onChange={(event) => {
                    const value = event.target.value as "INTERNAL" | "EXTERNAL";
                    setOrigin(value);
                    setNature(value === "INTERNAL" ? "force" : "opportunite");
                  }}
                >
                  <NativeSelectOption value="INTERNAL">
                    {t("issues.manual.internal")}
                  </NativeSelectOption>
                  <NativeSelectOption value="EXTERNAL">
                    {t("issues.manual.external")}
                  </NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-issue-nature">{t("issues.fieldNature")}</Label>
                <NativeSelect
                  id="manual-issue-nature"
                  className="w-full"
                  value={nature}
                  onChange={(event) => setNature(event.target.value as Nature)}
                >
                  {natureOptions.map((option) => (
                    <NativeSelectOption key={option} value={option}>
                      {t(`issues.nature.${option}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-issue-title">{t("issues.manual.title")}</Label>
              <Input
                id="manual-issue-title"
                value={title}
                maxLength={240}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-issue-description">{t("issues.fieldDescription")}</Label>
              <Textarea
                id="manual-issue-description"
                rows={4}
                value={description}
                maxLength={4000}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-issue-category">{t("issues.manual.category")}</Label>
              <Input
                id="manual-issue-category"
                value={category}
                maxLength={160}
                placeholder={t("issues.manual.categoryPlaceholder")}
                onChange={(event) => setCategory(event.target.value)}
              />
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <GqButton variant="ghost" onClick={() => setOpen(false)} disabled={create.isPending}>
              {t("cancel", { ns: "common" })}
            </GqButton>
            <GqButton variant="primary" onClick={submit} disabled={create.isPending}>
              {create.isPending ? t("saving", { ns: "common" }) : t("issues.manual.submit")}
            </GqButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------ SWOT / PESTEL view ----------------------------- */

const SWOT_TONES: Record<Nature, string> = {
  force: "gq-swot-force",
  faiblesse: "gq-swot-weakness",
  opportunite: "gq-swot-opportunity",
  menace: "gq-swot-threat",
};

const PESTEL_ICONS: Record<string, string> = {
  politique: "◌",
  economique: "↗",
  social: "◎",
  technologique: "⌁",
  environnemental: "♧",
  legal: "§",
};

/**
 * Built from EFFECTIVE values only (human corrections applied), excluding
 * issues the organisation did not retain.
 */
export function ContextVisualSummary({
  issues,
  method,
  methodExplicit,
}: {
  issues: ContextIssue[];
  method: ContextAnalysisMethod;
  methodExplicit: boolean;
}) {
  const { t } = useTranslation("context");
  const retained = issues.filter(isRetained);
  if (retained.length === 0) return null;
  const label = analysisMethodLabel(method.toLowerCase(), currentLanguage());
  const isPestel = method === "PESTEL";

  return (
    <section className="gq-section">
      <ResultsHead
        label={isPestel ? t("issues.view.pestelLabel") : t("issues.view.swotLabel")}
        title={isPestel ? t("issues.view.pestelTitle") : t("issues.view.swotTitle")}
        description={t("issues.view.body")}
        badge={
          <span className="gq-badge is-valid">
            ✓ {methodExplicit ? label : t("method.byDefault", { method: label })}
          </span>
        }
      />
      {isPestel ? <PestelGrid issues={retained} /> : <SwotMatrix issues={retained} />}
    </section>
  );
}

function IssueItems({ issues, empty }: { issues: ContextIssue[]; empty: string }) {
  const { t } = useTranslation("context");
  if (issues.length === 0) return <p className="gq-item-empty">{empty}</p>;
  return (
    <>
      {issues.map((issue) => (
        <div key={issue.id} className="gq-item">
          <strong>
            {issue.title}
            {issue.sourceKind === "MANUAL" ? (
              <span className="gq-tag ms-2 align-middle">{t("issues.addedByYou")}</span>
            ) : null}
          </strong>
          {issue.description ? <span>{issue.description}</span> : null}
        </div>
      ))}
    </>
  );
}

function SwotMatrix({ issues }: { issues: ContextIssue[] }) {
  const { t } = useTranslation("context");
  return (
    <div className="gq-swot">
      {swotQuadrants(currentLanguage()).map((quadrant) => {
        const rows = issues.filter((issue) => issue.nature === quadrant.key);
        return (
          <section key={quadrant.key} className={cn("gq-quadrant", SWOT_TONES[quadrant.key])}>
            <div className="gq-quadrant-head">
              <div>
                <h4>{quadrant.label}</h4>
                <small>{t(`issues.view.swotSub.${quadrant.key}`)}</small>
              </div>
              <span className="gq-badge">{rows.length}</span>
            </div>
            <IssueItems issues={rows} empty={t("issues.view.noRetained")} />
          </section>
        );
      })}
    </div>
  );
}

function PestelGrid({ issues }: { issues: ContextIssue[] }) {
  const { t } = useTranslation("context");
  const internal = issues.filter((issue) => issue.origin === "INTERNAL");
  const external = issues.filter((issue) => issue.origin === "EXTERNAL");

  return (
    <>
      <div className="gq-pestel">
        {pestelDimensions(currentLanguage()).map((dimension) => {
          const rows = external.filter(
            (issue) => pestelDimensionKey(issue.categoryKey, issue.categoryLabel) === dimension.key,
          );
          return (
            <section key={dimension.key} className="gq-dimension">
              <div className="gq-dimension-head">
                <span className="gq-dimension-icon" aria-hidden>
                  {PESTEL_ICONS[dimension.key] ?? "•"}
                </span>
                <h4>{dimension.label}</h4>
                <span className="gq-badge ms-auto">{rows.length}</span>
              </div>
              <IssueItems issues={rows} empty={dimension.helper} />
            </section>
          );
        })}
      </div>

      <section className="gq-quadrant mt-3.5">
        <div className="gq-quadrant-head">
          <div>
            <h4>{t("issues.view.internal")}</h4>
            <small>{t("issues.view.internalPestel")}</small>
          </div>
          <span className="gq-badge">{internal.length}</span>
        </div>
        <IssueItems issues={internal} empty={t("issues.view.noInternal")} />
      </section>
    </>
  );
}

/* ---------------------------------- export ---------------------------------- */

/** French writes language names in lower case mid-sentence; English and Arabic do not. */
function languageInSentence(name: string): string {
  return currentLanguage() === "fr" ? name.toLocaleLowerCase("fr") : name;
}

/** Word and PDF exports, both built from one shared snapshot. */
export function ContextExportCard({ document }: { document: ContextDocument | null }) {
  const { t } = useTranslation("context");
  const [busy, setBusy] = useState<"docx" | "pdf" | null>(null);
  // jsPDF's built-in fonts have no Arabic glyphs; Word renders Arabic natively.
  const pdfAvailable = document?.language !== "ar";

  const run = async (format: "docx" | "pdf") => {
    if (!document || busy) return;
    setBusy(format);
    try {
      if (format === "docx") {
        const { downloadContextWord } = await import("./export/word.js");
        await downloadContextWord(document);
      } else {
        const { downloadContextPdf } = await import("./export/pdf.js");
        await downloadContextPdf(document);
      }
    } catch {
      notify.error(t("issues.exportCard.failed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <FooterCard
      title={t("issues.exportCard.title")}
      description={
        <>
          {t("issues.exportCard.body")}{" "}
          {document
            ? t("issues.exportCard.language", {
                language: languageInSentence(
                  t(`projectLanguage.${document.language}`, { ns: "common" }),
                ),
              })
            : null}
          {pdfAvailable ? null : (
            <span className="mt-1 block">{t("issues.exportCard.pdfArabicUnavailable")}</span>
          )}
        </>
      }
      action={
        <div className="flex flex-wrap gap-2">
          <GqButton disabled={!document || busy !== null} onClick={() => void run("docx")}>
            <FileTextIcon className="size-4" aria-hidden />
            {busy === "docx" ? t("issues.exportCard.generating") : "Word (.docx)"}
          </GqButton>
          <GqButton
            variant="primary"
            disabled={!document || !pdfAvailable || busy !== null}
            onClick={() => void run("pdf")}
          >
            <FileDownIcon className="size-4" aria-hidden />
            {busy === "pdf" ? t("issues.exportCard.generating") : "PDF"}
          </GqButton>
        </div>
      }
    />
  );
}
