/**
 * Tab 2 — analyse externe, as in the template: SWOT and/or PESTEL (both by
 * default, never none), then one independent deliverable per method, never
 * merged. SWOT puts the forces/faiblesses validated in tab 1 next to the
 * opportunités/menaces found by the external research; PESTEL lays the
 * researched factors out by dimension, the légal one reusing the published veille.
 */
import { ExternalLinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ContextAnalysisMethod, ContextExternalFactor, ContextIssue } from "@qhse/contracts";
import {
  analysisMethodOptions,
  pestelDimensionKey,
  pestelDimensions,
  swotQuadrants,
  type SwotQuadrantKey,
} from "@qhse/domain/smq/context/method";
import { cn } from "@qhse/ui/lib/utils";

import { currentLanguage } from "../../app/i18n.js";
import {
  AiBanner,
  ErrorState,
  FooterCard,
  GqButton,
  ProcessingState,
  ResultsHead,
} from "./context-ui.js";

const SWOT_TONES: Record<SwotQuadrantKey, string> = {
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

interface Item {
  id: string;
  title: string;
  text: string | null;
  source?: { label: string; url: string | null } | null;
}

function hostname(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function factorItem(factor: ContextExternalFactor, regulatoryLabel: string): Item {
  const source = factor.sources[0];
  const regulatory = factor.sourceOrigin === "regulatory";
  return {
    id: factor.id,
    title: factor.title,
    text: factor.description ?? factor.relevanceToCompany,
    source:
      regulatory || source
        ? {
            label: regulatory
              ? regulatoryLabel
              : (source?.title ?? hostname(source?.url ?? null) ?? ""),
            url: source?.url ?? null,
          }
        : null,
  };
}

function Items({ items, empty }: { items: Item[]; empty: string }) {
  const { t } = useTranslation("context");
  if (items.length === 0) return <p className="gq-item-empty">{empty}</p>;
  return (
    <>
      {items.map((item) => (
        <div key={item.id} className="gq-item">
          <strong>{item.title}</strong>
          {item.text ? <span>{item.text}</span> : null}
          {item.source ? (
            <small className="gq-item-source">
              {t("external.source")} ·{" "}
              {item.source.url ? (
                <a
                  href={item.source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="gq-link"
                >
                  {item.source.label}
                  <ExternalLinkIcon className="size-3" aria-hidden />
                </a>
              ) : (
                item.source.label
              )}
            </small>
          ) : null}
        </div>
      ))}
    </>
  );
}

function SwotMatrix({
  internalIssues,
  factors,
}: {
  internalIssues: ContextIssue[];
  factors: ContextExternalFactor[];
}) {
  const { t } = useTranslation("context");
  const regulatory = t("external.regulatorySource");
  const items: Record<SwotQuadrantKey, Item[]> = {
    force: internalIssues
      .filter((issue) => issue.nature === "force")
      .map((issue) => ({ id: issue.id, title: issue.title, text: issue.description })),
    faiblesse: internalIssues
      .filter((issue) => issue.nature === "faiblesse")
      .map((issue) => ({ id: issue.id, title: issue.title, text: issue.description })),
    opportunite: factors
      .filter((factor) => factor.orientation === "favorable")
      .map((factor) => factorItem(factor, regulatory)),
    menace: factors
      .filter((factor) => factor.orientation === "defavorable")
      .map((factor) => factorItem(factor, regulatory)),
  };

  return (
    <div className="gq-swot">
      {swotQuadrants(currentLanguage()).map((quadrant) => (
        <section key={quadrant.key} className={cn("gq-quadrant", SWOT_TONES[quadrant.key])}>
          <div className="gq-quadrant-head">
            <div>
              <h4>{quadrant.label}</h4>
              <small>{t(`external.swotSub.${quadrant.key}`)}</small>
            </div>
            <span className="gq-badge">{items[quadrant.key].length}</span>
          </div>
          <Items
            items={items[quadrant.key]}
            empty={
              quadrant.key === "force" || quadrant.key === "faiblesse"
                ? t("external.swotEmptyInternal")
                : t("external.swotEmptyExternal")
            }
          />
        </section>
      ))}
    </div>
  );
}

function PestelGrid({ factors }: { factors: ContextExternalFactor[] }) {
  const { t } = useTranslation("context");
  const regulatory = t("external.regulatorySource");
  return (
    <div className="gq-pestel">
      {pestelDimensions(currentLanguage()).map((dimension) => {
        const items = factors
          .filter(
            (factor) =>
              pestelDimensionKey(factor.categoryKey, factor.categoryLabel) === dimension.key,
          )
          .map((factor) => factorItem(factor, regulatory));
        return (
          <section key={dimension.key} className="gq-dimension">
            <div className="gq-dimension-head">
              <span className="gq-dimension-icon" aria-hidden>
                {PESTEL_ICONS[dimension.key] ?? "•"}
              </span>
              <h4>{dimension.label}</h4>
              <span className="gq-badge ms-auto">{items.length}</span>
            </div>
            <Items items={items} empty={t("external.pestelEmpty")} />
          </section>
        );
      })}
    </div>
  );
}

export function ExternalAnalysisView({
  methods,
  generated,
  factors,
  internalIssues,
  isSavingMethods,
  isRunning,
  errorMessage,
  canLaunch,
  blockedReason,
  onToggleMethod,
  onLaunch,
  onContinue,
}: {
  methods: ContextAnalysisMethod[];
  /** True once an analysis made with exactly these methods is available. */
  generated: boolean;
  factors: ContextExternalFactor[];
  /** The forces and faiblesses validated in tab 1, for the SWOT matrix. */
  internalIssues: ContextIssue[];
  isSavingMethods: boolean;
  isRunning: boolean;
  errorMessage: string | null;
  canLaunch: boolean;
  blockedReason: string | null;
  onToggleMethod: (method: ContextAnalysisMethod) => void;
  onLaunch: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation("context");
  const both = methods.length === 2;
  const selection = methods.join(" + ");

  return (
    <div className="space-y-4">
      <section className="gq-card">
        <h3>{t("external.methodTitle")}</h3>
        <p className="gq-lead mt-1.5">{t("external.methodBody")}</p>
        <div className="gq-method-grid">
          {analysisMethodOptions(currentLanguage()).map((option) => {
            const value = option.value.toUpperCase() as ContextAnalysisMethod;
            const selected = methods.includes(value);
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                disabled={isSavingMethods || isRunning}
                onClick={() => onToggleMethod(value)}
                className={cn("gq-method-card", selected && "is-selected")}
              >
                <h4>
                  {option.title}
                  {selected ? <span className="gq-check">✓</span> : null}
                </h4>
                <p>{option.description}</p>
              </button>
            );
          })}
        </div>
        <div className="gq-row mt-5">
          <div>
            <strong className="text-[13px]">{selection}</strong>
            <div className="mt-1 text-[11px] text-slate-500">
              {both ? t("external.twoAnalyses") : t("external.oneAnalysis")}
            </div>
          </div>
          <GqButton variant="primary" disabled={!canLaunch || isRunning} onClick={onLaunch}>
            {isRunning
              ? t("external.running")
              : generated
                ? both
                  ? t("external.regenerateBoth")
                  : t("external.regenerateOne")
                : both
                  ? t("external.generateBoth")
                  : t("external.generateOne")}
          </GqButton>
        </div>
        {blockedReason ? (
          <p className="mt-3 text-[12.5px] text-slate-500">{blockedReason}</p>
        ) : null}
      </section>

      {isRunning ? (
        <ProcessingState title={t("external.running")} description={t("external.runningBody")} />
      ) : null}

      {errorMessage && !isRunning ? (
        <ErrorState
          title={t("external.failed")}
          description={errorMessage}
          onRetry={canLaunch ? onLaunch : undefined}
        />
      ) : null}

      {!generated && !isRunning && !errorMessage ? (
        <AiBanner title={t("external.pendingTitle")} description={t("external.pendingBody")} />
      ) : null}

      {generated && !isRunning && methods.includes("SWOT") ? (
        <section className="gq-section">
          <ResultsHead
            label={t("external.swotLabel")}
            title={t("external.swotTitle")}
            description={t("external.swotBody")}
            badge={<span className="gq-badge is-valid">{t("external.done")}</span>}
          />
          <SwotMatrix internalIssues={internalIssues} factors={factors} />
        </section>
      ) : null}

      {generated && !isRunning && methods.includes("PESTEL") ? (
        <section className="gq-section">
          <ResultsHead
            label={t("external.pestelLabel")}
            title={t("external.pestelTitle")}
            description={t("external.pestelBody")}
            badge={<span className="gq-badge is-valid">{t("external.done")}</span>}
          />
          <PestelGrid factors={factors} />
        </section>
      ) : null}

      {generated && !isRunning ? (
        <FooterCard
          title={t("external.readyTitle")}
          description={both ? t("external.preparedBoth") : t("external.preparedOne")}
          action={
            <GqButton variant="primary" onClick={onContinue}>
              {t("external.toSynthesis")}
            </GqButton>
          }
        />
      ) : null}
    </div>
  );
}
