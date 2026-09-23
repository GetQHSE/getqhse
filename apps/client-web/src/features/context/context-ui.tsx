/**
 * Small presentational pieces shared by the "Analyse des enjeux" steps, in
 * the GetQhse demo template's visual language (see context.css).
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "@qhse/ui/components/toast";
import { cn } from "@qhse/ui/lib/utils";

import { useFormat } from "../../app/format.js";

export const notify = {
  success: (title: string) => toast.add({ title, type: "success" }),
  error: (title: string) => toast.add({ title, type: "error" }),
};

export function GqButton({
  variant = "secondary",
  size,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm";
}) {
  return (
    <button
      type="button"
      className={cn(
        "gq-btn",
        variant === "primary" && "gq-btn-primary",
        variant === "ghost" && "gq-btn-ghost",
        size === "sm" && "gq-btn-sm",
        className,
      )}
      {...props}
    />
  );
}

export const ANALYSIS_STEPS = ["internal", "external", "synthesis", "validation"] as const;

export function AnalysisStepper({
  activeStep,
  completedSteps,
  maxReachableStep,
  onStepChange,
}: {
  activeStep: number;
  completedSteps: number[];
  maxReachableStep: number;
  onStepChange: (step: number) => void;
}) {
  const { t } = useTranslation("context");
  return (
    <nav className="gq-tabs" aria-label={t("ui.stepsNav")}>
      {ANALYSIS_STEPS.map((label, index) => {
        const step = index + 1;
        const isActive = step === activeStep;
        return (
          <button
            key={label}
            type="button"
            className={cn("gq-tab", isActive && "is-active")}
            aria-current={isActive ? "step" : undefined}
            disabled={step > maxReachableStep}
            onClick={() => onStepChange(step)}
          >
            {step}. {t(`ui.steps.${label}`)}
            {completedSteps.includes(step) ? (
              <span className="gq-tab-check" aria-label={t("ui.stepDone")}>
                ✓
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

/** White card with the template's flowing gradient line: the "AI action" header. */
export function AiBanner({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="gq-ai-banner">
      <div className="gq-row">
        <div>
          <h3>
            <span aria-hidden="true">✦ </span>
            {title}
          </h3>
          <p>{description}</p>
        </div>
        {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function ResultsHead({
  label,
  title,
  description,
  badge,
}: {
  label?: string;
  title: string;
  description?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="gq-results-head">
      <div>
        {label ? <span className="gq-label">{label}</span> : null}
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {badge}
    </div>
  );
}

export function FooterCard({
  title,
  description,
  action,
}: {
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="gq-footer">
      <div>
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="gq-placeholder">
      <div className="gq-spark">✦</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

export function ErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="gq-placeholder is-error">
      <div className="gq-spark">⚠</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {onRetry ? (
        <GqButton size="sm" className="mt-4" onClick={onRetry}>
          {t("retry")}
        </GqButton>
      ) : null}
    </div>
  );
}

export function ProcessingState({ title, description }: { title: string; description: string }) {
  return (
    <div role="status" aria-live="polite" className="gq-ai-banner">
      <div className="gq-processing">
        <div>
          <h3>
            <span aria-hidden="true">✦ </span>
            {title}
          </h3>
          <p>{description}</p>
        </div>
        <span aria-hidden="true" className="gq-dots">
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ animationDelay: `${i * 160}ms` }} />
          ))}
        </span>
      </div>
    </div>
  );
}

const RUN_STATUSES = ["DRAFT", "RUNNING", "COMPLETED", "FAILED"] as const;

export function ContextRunHistory({
  title,
  runs,
}: {
  title: string;
  runs: {
    id: string;
    status: string;
    createdAt: string;
    errorMessage: string | null;
    detail: string;
  }[];
}) {
  const { t } = useTranslation("context");
  const format = useFormat();
  if (runs.length === 0) return null;
  return (
    <section className="gq-card mt-6">
      <h3>{title}</h3>
      <div className="mt-2">
        {runs.map((run) => (
          <div key={run.id} className="gq-history-row">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{format.dateTime(run.createdAt)}</span>
              <span className={cn("gq-badge", run.status === "COMPLETED" && "is-valid")}>
                {(RUN_STATUSES as readonly string[]).includes(run.status)
                  ? t(`ui.runStatus.${run.status as (typeof RUN_STATUSES)[number]}`)
                  : run.status}
              </span>
            </div>
            <small>{run.detail}</small>
            {run.errorMessage ? <small>{run.errorMessage}</small> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
