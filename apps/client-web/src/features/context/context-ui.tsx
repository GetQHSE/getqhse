/**
 * Small presentational pieces shared by the "Analyse des enjeux" steps, in
 * the GetQhse demo template's visual language (see context.css).
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "@qhse/ui/components/toast";
import { cn } from "@qhse/ui/lib/utils";

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

export const ANALYSIS_STEPS = ["internal", "external", "synthesis"] as const;

export function AnalysisStepper({
  activeStep,
  completedSteps,
  maxReachableStep,
  onStepChange,
  action,
}: {
  activeStep: number;
  completedSteps: number[];
  maxReachableStep: number;
  onStepChange: (step: number) => void;
  /** Shown at the end of the row, as the template's "Exporter" menu. */
  action?: ReactNode;
}) {
  const { t } = useTranslation("context");
  return (
    <div className="gq-tabs-row">
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
      {action ? <div className="gq-tabs-action">{action}</div> : null}
    </div>
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
