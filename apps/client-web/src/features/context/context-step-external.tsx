/**
 * Step 2 — méthode d'analyse + analyse du contexte externe. Same behaviour
 * and wording as the foundation's AnalysisMethodCard / ExternalAnalysisPanel,
 * rendered in the demo template's visual language.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, LoaderCircleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  ContextAnalysisMethod,
  ContextExternalFactor,
  ContextExternalRunSummary,
  ProjectContextSettings,
} from "@qhse/contracts";
import { analysisMethodLabel, analysisMethodOptions } from "@qhse/domain/smq/context/method";
import { cn } from "@qhse/ui/lib/utils";

import { clientApi } from "../../app/client-api.js";
import { currentLanguage } from "../../app/i18n.js";
import {
  AiBanner,
  ContextRunHistory,
  EmptyState,
  ErrorState,
  Field,
  FooterCard,
  GqButton,
  ProcessingState,
  ResultsHead,
  notify,
} from "./context-ui.js";

/**
 * Method choice (SWOT or PESTEL) persisted at project level. Choosing never
 * launches an analysis and never rewrites an existing run.
 */
export function AnalysisMethodCard({
  projectId,
  settings,
}: {
  projectId: string;
  settings: ProjectContextSettings | undefined;
}) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("context");
  const language = currentLanguage();
  const current = settings?.analysisMethod ?? "SWOT";
  const explicit = settings?.explicit ?? false;

  const save = useMutation({
    mutationFn: (method: ContextAnalysisMethod) =>
      clientApi.setContextMethod(projectId, { method }),
    onSuccess: (next) => {
      queryClient.setQueryData(["context-settings", projectId], next);
      notify.success(
        t("method.saved", {
          method: analysisMethodLabel(next.analysisMethod.toLowerCase(), language),
        }),
      );
    },
    onError: () => notify.error(t("method.saveFailed")),
  });

  const choose = (method: ContextAnalysisMethod) => {
    if (save.isPending || (explicit && method === current)) return;
    save.mutate(method);
  };

  const currentLabel = analysisMethodLabel(current.toLowerCase(), language);

  return (
    <section className="gq-card">
      <div className="gq-method-title">
        <h3>{t("method.title")}</h3>
        <span className="gq-method-badge">
          {explicit ? currentLabel : t("method.byDefault", { method: currentLabel })}
        </span>
      </div>
      <p className="gq-lead mt-1.5">{t("method.help")}</p>
      <div className="gq-method-grid">
        {analysisMethodOptions(language).map((option) => {
          const value = option.value.toUpperCase() as ContextAnalysisMethod;
          const selected = value === current;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => choose(value)}
              disabled={save.isPending}
              className={cn("gq-method-card", selected && "is-selected")}
            >
              <h4>
                {option.title}
                {selected ? <span className="gq-check">✓</span> : null}
                {save.isPending && save.variables === value ? (
                  <LoaderCircleIcon className="size-4 animate-spin text-slate-400" aria-hidden />
                ) : null}
              </h4>
              <p>{option.description}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Orientation and evidence strength are stable French keys emitted by the AI. */
const ORIENTATION_TONES = {
  favorable: "is-opportunity",
  defavorable: "is-threat",
  incertain: "",
} as const;
type Orientation = keyof typeof ORIENTATION_TONES;

const STRENGTHS = ["solide", "moderee", "faible"] as const;
type Strength = (typeof STRENGTHS)[number];

function hostname(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function ExternalFactorCard({ factor }: { factor: ContextExternalFactor }) {
  const { t } = useTranslation("context");
  const orientation =
    factor.orientation && factor.orientation in ORIENTATION_TONES
      ? (factor.orientation as Orientation)
      : null;
  const strength = (STRENGTHS as readonly string[]).includes(factor.evidenceStrength ?? "")
    ? (factor.evidenceStrength as Strength)
    : null;
  const influences = [
    [t("external.objectives"), factor.influenceOnObjectives],
    [t("external.quality"), factor.influenceOnQuality],
    [t("external.customer"), factor.influenceOnCustomerSatisfaction],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <article className="gq-issue-card">
      <div className="gq-issue-tags">
        <span className={cn("gq-type", orientation ? ORIENTATION_TONES[orientation] : undefined)}>
          {orientation
            ? t(`external.orientation.${orientation}`)
            : (factor.orientation ?? t("external.factor"))}
        </span>
        {factor.evidenceStrength ? (
          <span className="gq-tag">
            {strength ? t(`external.strength.${strength}`) : factor.evidenceStrength}
          </span>
        ) : null}
        {factor.comparisonStatus === "recurrent" ? (
          <span className="gq-tag">{t("external.recurrent")}</span>
        ) : null}
      </div>
      <h4>{factor.title}</h4>
      {factor.description ? <p>{factor.description}</p> : null}

      <div className="gq-details">
        {factor.relevanceToCompany ? (
          <div>
            <strong>{t("external.relevance")}</strong>
            {factor.relevanceToCompany}
          </div>
        ) : null}
        {influences.map(([label, text]) => (
          <div key={label}>
            <strong>{label}</strong>
            {text}
          </div>
        ))}
        {factor.geographicScope ? (
          <div>
            <strong>{t("external.geography")}</strong>
            {factor.geographicScope}
          </div>
        ) : null}
      </div>

      {factor.sources.length > 0 ? (
        <div className="gq-evidence">
          <span>{t("external.sources", { count: factor.sources.length })}</span>
          {factor.sources.map((source, index) => {
            const isRegulatory =
              factor.sourceOrigin === "regulatory" ||
              source.groundingOrigin === "regulatory" ||
              source.groundingOrigin === "regulatory_reuse";
            const label = source.title ?? hostname(source.url) ?? t("external.source");
            return (
              <span key={source.id}>
                {index > 0 ? " · " : ""}
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="gq-link"
                    title={isRegulatory ? t("external.regulatorySource") : t("external.webSource")}
                  >
                    {label}
                    <ExternalLinkIcon className="size-3" aria-hidden />
                  </a>
                ) : (
                  (source.title ?? t("external.noSource"))
                )}
              </span>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

export function ExternalAnalysisPanel({
  factors,
  runs,
  scopeRows,
  canLaunch,
  blockedReason,
  isRunning,
  errorMessage,
  onLaunch,
  onContinue,
}: {
  factors: ContextExternalFactor[];
  runs: ContextExternalRunSummary[];
  scopeRows: { label: string; value: string }[];
  canLaunch: boolean;
  blockedReason: string | null;
  isRunning: boolean;
  errorMessage: string | null;
  onLaunch: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation("context");
  const grouped = new Map<string, ContextExternalFactor[]>();
  for (const factor of factors) {
    const bucket = grouped.get(factor.categoryLabel) ?? [];
    bucket.push(factor);
    grouped.set(factor.categoryLabel, bucket);
  }
  const hasFactors = factors.length > 0;
  const sourcesCount = factors.reduce((sum, factor) => sum + factor.sources.length, 0);

  return (
    <div className="mt-4 space-y-4">
      <AiBanner
        title={t("external.title")}
        description={t("external.body")}
        action={
          <GqButton variant="primary" disabled={!canLaunch || isRunning} onClick={onLaunch}>
            {isRunning
              ? t("external.running")
              : hasFactors
                ? t("external.rerun")
                : t("external.run")}
          </GqButton>
        }
      >
        <dl className="gq-context-grid">
          {scopeRows.map((row) => (
            <Field key={row.label} label={row.label}>
              {row.value}
            </Field>
          ))}
        </dl>
        {blockedReason ? (
          <p className="mt-4 text-[12.5px] text-slate-500">{blockedReason}</p>
        ) : null}
      </AiBanner>

      {isRunning ? (
        <ProcessingState title={t("external.running")} description={t("external.runningBody")} />
      ) : null}

      {errorMessage ? (
        <ErrorState
          title={t("external.failed")}
          description={errorMessage}
          onRetry={canLaunch ? onLaunch : undefined}
        />
      ) : null}

      {!hasFactors && !isRunning && !errorMessage ? (
        <EmptyState title={t("external.emptyTitle")} description={t("external.emptyBody")} />
      ) : null}

      {hasFactors ? (
        <section className="gq-section">
          <ResultsHead
            label={t("external.resultsLabel")}
            title={t("external.resultsTitle")}
            description={t("external.resultsBody", {
              factors: factors.length,
              sources: sourcesCount,
            })}
            badge={<span className="gq-badge is-valid">{t("external.done")}</span>}
          />
          {Array.from(grouped.entries()).map(([category, items]) => (
            <div key={category} className="mt-5">
              <h4 className="mb-2.5 text-[13px] font-semibold text-slate-900">
                {category}{" "}
                <span className="font-normal text-slate-400">
                  {t("external.factorCount", { count: items.length })}
                </span>
              </h4>
              <div className="gq-issue-grid">
                {items.map((factor) => (
                  <ExternalFactorCard key={factor.id} factor={factor} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {hasFactors ? (
        <FooterCard
          title={t("external.readyTitle")}
          description={t("external.readyBody")}
          action={
            <GqButton variant="primary" onClick={onContinue} disabled={isRunning}>
              {t("external.toSynthesis")}
            </GqButton>
          }
        />
      ) : null}

      <ContextRunHistory
        title={t("external.history")}
        runs={runs.map((run) => ({
          id: run.id,
          status: run.status,
          createdAt: run.createdAt,
          errorMessage: run.errorMessage,
          detail:
            t("external.historyDetail", {
              factors: run.factorsCount,
              sources: run.sourcesCount,
            }) +
            (run.searchQueries.length > 0
              ? t("external.historySearches", { count: run.searchQueries.length })
              : ""),
        }))}
      />
    </div>
  );
}
