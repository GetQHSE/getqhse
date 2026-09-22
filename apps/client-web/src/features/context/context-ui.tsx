/**
 * Small presentational pieces shared by the "Analyse des enjeux" steps —
 * the platform equivalents of the foundation's kit states and stepper.
 */
import type { ReactNode } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  InboxIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@qhse/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@qhse/ui/components/card";
import { toast } from "@qhse/ui/components/toast";
import { cn } from "@qhse/ui/lib/utils";

export const notify = {
  success: (title: string) => toast.add({ title, type: "success" }),
  error: (title: string) => toast.add({ title, type: "error" }),
};

export const ANALYSIS_STEPS = [
  "Contexte interne",
  "Analyse externe",
  "Synthèse des enjeux",
  "Validation",
] as const;

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
  return (
    <ol className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Étapes de l’analyse">
      {ANALYSIS_STEPS.map((label, index) => {
        const step = index + 1;
        const isActive = step === activeStep;
        const isCompleted = completedSteps.includes(step);
        const isReachable = step <= maxReachableStep;
        const content = (
          <>
            {isActive ? (
              <SparklesIcon className="size-4 text-violet-600" aria-hidden />
            ) : isCompleted ? (
              <CheckIcon className="size-4 text-muted-foreground" aria-hidden />
            ) : (
              <span className="size-4 rounded-full border border-border" aria-hidden />
            )}
            <span
              className={cn(
                "text-sm",
                isActive ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {step}. {label}
            </span>
          </>
        );
        return (
          <li
            key={label}
            className="flex items-center gap-2"
            aria-current={isActive ? "step" : undefined}
          >
            {isReachable && !isActive ? (
              <button
                type="button"
                className="flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:text-foreground"
                onClick={() => onStepChange(step)}
              >
                {content}
              </button>
            ) : (
              <span className={cn("flex items-center gap-2", !isReachable && "opacity-60")}>
                {content}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
      <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
      <h2 className="mt-3 text-base font-medium text-foreground">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
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
  return (
    <div
      role="alert"
      className="flex flex-col items-center rounded-lg border border-destructive/25 bg-destructive/5 px-6 py-10 text-center"
    >
      <AlertTriangleIcon aria-hidden="true" className="size-5 text-destructive" />
      <h2 className="mt-3 text-base font-medium text-foreground">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          Réessayer
        </Button>
      ) : null}
    </div>
  );
}

export function ProcessingState({ title, description }: { title: string; description: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-4"
    >
      <SparklesIcon className="size-5 shrink-0 animate-pulse text-violet-600" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-medium text-card-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <span aria-hidden="true" className="ml-auto flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{ animationDelay: `${i * 160}ms` }}
            className="size-1.5 animate-pulse rounded-full bg-violet-500"
          />
        ))}
      </span>
    </div>
  );
}

const RUN_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Préparation",
  RUNNING: "En cours",
  COMPLETED: "Terminée",
  FAILED: "Échec",
};

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
  if (runs.length === 0) return null;
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {runs.map((run) => (
          <div
            key={run.id}
            className="flex flex-col gap-1 border-b border-border pb-3 last:border-0 last:pb-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">{new Date(run.createdAt).toLocaleString("fr-FR")}</span>
              <span className="text-xs text-muted-foreground">
                {RUN_STATUS_LABELS[run.status] ?? run.status}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{run.detail}</p>
            {run.errorMessage ? (
              <p className="text-xs text-muted-foreground">{run.errorMessage}</p>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
