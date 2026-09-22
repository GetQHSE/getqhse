/**
 * Step 2 — méthode d'analyse + analyse du contexte externe, same layout and
 * wording as the foundation's AnalysisMethodCard / ExternalAnalysisPanel.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, ExternalLinkIcon, Globe2Icon, LoaderCircleIcon } from "lucide-react";
import type {
  ContextAnalysisMethod,
  ContextExternalFactor,
  ContextExternalRunSummary,
  ProjectContextSettings,
} from "@qhse/contracts";
import { ANALYSIS_METHOD_OPTIONS, analysisMethodLabel } from "@qhse/domain/smq/context/method";
import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@qhse/ui/components/card";

import { clientApi } from "../../app/client-api.js";
import {
  ContextRunHistory,
  EmptyState,
  ErrorState,
  Field,
  ProcessingState,
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
  const current = settings?.analysisMethod ?? "SWOT";
  const explicit = settings?.explicit ?? false;

  const save = useMutation({
    mutationFn: (method: ContextAnalysisMethod) =>
      clientApi.setContextMethod(projectId, { method }),
    onSuccess: (next) => {
      queryClient.setQueryData(["context-settings", projectId], next);
      notify.success(
        `Méthode ${analysisMethodLabel(next.analysisMethod.toLowerCase())} enregistrée. Elle s’appliquera à vos prochaines analyses.`,
      );
    },
    onError: () => notify.error("La méthode n’a pas pu être enregistrée. Réessayez."),
  });

  const choose = (method: ContextAnalysisMethod) => {
    if (save.isPending || (explicit && method === current)) return;
    save.mutate(method);
  };

  const currentLabel = analysisMethodLabel(current.toLowerCase());

  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-lg">Méthode d’analyse</CardTitle>
          <Badge variant="secondary">
            {explicit ? currentLabel : `${currentLabel} (par défaut)`}
          </Badge>
        </div>
        <CardDescription>
          Choisissez la méthode utilisée pour structurer votre analyse. Ce choix s’applique
          uniquement aux prochaines analyses : les analyses déjà réalisées restent inchangées.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {ANALYSIS_METHOD_OPTIONS.map((option) => {
          const value = option.value.toUpperCase() as ContextAnalysisMethod;
          const selected = value === current;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => choose(value)}
              disabled={save.isPending}
              className={`rounded-lg border p-4 text-left transition-colors disabled:opacity-60 ${
                selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
              }`}
            >
              <span className="flex items-center gap-2 font-medium text-foreground">
                {option.title}
                {selected ? <CheckIcon className="size-4 text-primary" aria-hidden /> : null}
                {save.isPending && save.variables === value ? (
                  <LoaderCircleIcon
                    className="size-4 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                ) : null}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">{option.description}</span>
            </button>
          );
        })}
      </CardContent>
      <CardContent className="pt-0">
        <Button variant="ghost" size="sm" disabled className="pointer-events-none opacity-70">
          Aucune analyse n’est lancée automatiquement
        </Button>
      </CardContent>
    </Card>
  );
}

const ORIENTATION_LABELS: Record<string, string> = {
  favorable: "Influence plutôt favorable",
  defavorable: "Influence plutôt défavorable",
  incertain: "Influence incertaine",
};

const STRENGTH_LABELS: Record<string, string> = {
  solide: "Preuves solides",
  moderee: "Preuves modérées",
  faible: "Preuves faibles",
};

function hostname(url: string | null): string {
  if (!url) return "source";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

export function ExternalFactorCard({ factor }: { factor: ContextExternalFactor }) {
  return (
    <Card className="shadow-none">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{factor.categoryLabel}</Badge>
          {factor.orientation ? (
            <Badge variant="outline">
              {ORIENTATION_LABELS[factor.orientation] ?? factor.orientation}
            </Badge>
          ) : null}
          {factor.evidenceStrength ? (
            <Badge variant="outline">
              {STRENGTH_LABELS[factor.evidenceStrength] ?? factor.evidenceStrength}
            </Badge>
          ) : null}
          {factor.comparisonStatus === "recurrent" ? (
            <Badge variant="outline">Déjà identifié lors d’une analyse précédente</Badge>
          ) : null}
        </div>
        <CardTitle className="text-base">{factor.title}</CardTitle>
        {factor.description ? <CardDescription>{factor.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {factor.relevanceToCompany ? (
          <div>
            <p className="text-xs text-muted-foreground">Lien avec votre organisation</p>
            <p>{factor.relevanceToCompany}</p>
          </div>
        ) : null}

        <dl className="grid gap-3 sm:grid-cols-3">
          {factor.influenceOnObjectives ? (
            <Field label="Objectifs">{factor.influenceOnObjectives}</Field>
          ) : null}
          {factor.influenceOnQuality ? (
            <Field label="Qualité">{factor.influenceOnQuality}</Field>
          ) : null}
          {factor.influenceOnCustomerSatisfaction ? (
            <Field label="Satisfaction client">{factor.influenceOnCustomerSatisfaction}</Field>
          ) : null}
        </dl>

        {factor.geographicScope ? (
          <p className="text-xs text-muted-foreground">
            Portée géographique : {factor.geographicScope}
          </p>
        ) : null}

        {factor.sources.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Sources réellement consultées ({factor.sources.length})
            </p>
            <ul className="space-y-2">
              {factor.sources.map((source) => {
                const isRegulatory =
                  factor.sourceOrigin === "regulatory" ||
                  source.groundingOrigin === "regulatory" ||
                  source.groundingOrigin === "regulatory_reuse";
                const label = source.title ?? hostname(source.url);
                const meta = [
                  source.publisher ?? (source.url ? hostname(source.url) : null),
                  source.sourceDate
                    ? new Date(source.sourceDate).toLocaleDateString("fr-FR")
                    : null,
                ].filter(Boolean) as string[];
                return (
                  <li key={source.id} className="space-y-0.5">
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-xs text-foreground underline underline-offset-2"
                      >
                        {label}
                        <ExternalLinkIcon className="size-3" aria-hidden />
                      </a>
                    ) : (
                      <span className="text-xs text-foreground">
                        {source.title ?? "Source non renseignée"}
                      </span>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {isRegulatory ? "Veille réglementaire" : "Source web"}
                      {meta.length > 0 ? ` · ${meta.join(" · ")}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
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
  const grouped = new Map<string, ContextExternalFactor[]>();
  for (const factor of factors) {
    const bucket = grouped.get(factor.categoryLabel) ?? [];
    bucket.push(factor);
    grouped.set(factor.categoryLabel, bucket);
  }
  const hasFactors = factors.length > 0;

  return (
    <div className="space-y-6">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-lg">Analyse du contexte externe</CardTitle>
          <CardDescription>
            GetQhse recherche sur le web des facteurs externes réels susceptibles d’influencer vos
            objectifs, la qualité de vos produits et services, la satisfaction de vos clients et le
            fonctionnement de votre système de management. Les obligations légales ne sont pas
            recherchées ici : elles proviennent de votre veille réglementaire.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scopeRows.map((row) => (
              <Field key={row.label} label={row.label}>
                {row.value}
              </Field>
            ))}
          </dl>

          {blockedReason ? <p className="text-sm text-muted-foreground">{blockedReason}</p> : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {hasFactors ? (
              <Button variant="outline" onClick={onContinue} disabled={isRunning}>
                Continuer vers la synthèse
              </Button>
            ) : null}
            <Button type="button" disabled={!canLaunch || isRunning} onClick={onLaunch}>
              {isRunning
                ? "Analyse externe en cours…"
                : hasFactors
                  ? "Relancer l’analyse externe"
                  : "Lancer l’analyse externe"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isRunning ? (
        <ProcessingState
          title="Analyse externe en cours…"
          description="Définition du périmètre de recherche, recherche web réelle, vérification des sources et structuration des facteurs externes. Cette étape peut prendre plusieurs minutes."
        />
      ) : null}

      {errorMessage ? (
        <ErrorState
          title="L’analyse externe n’a pas abouti"
          description={errorMessage}
          onRetry={canLaunch ? onLaunch : undefined}
        />
      ) : null}

      {!hasFactors && !isRunning && !errorMessage ? (
        <EmptyState
          icon={Globe2Icon}
          title="Aucun facteur externe n’a encore été documenté."
          description="Lancez l’analyse externe : chaque facteur retenu sera rattaché aux sources réellement consultées. Aucun résultat n’est inventé."
        />
      ) : null}

      {hasFactors
        ? Array.from(grouped.entries()).map(([category, items]) => (
            <section key={category} className="space-y-3">
              <h2 className="text-sm font-medium text-foreground">
                {category} · {items.length} facteur{items.length > 1 ? "s" : ""}
              </h2>
              {items.map((factor) => (
                <ExternalFactorCard key={factor.id} factor={factor} />
              ))}
            </section>
          ))
        : null}

      <ContextRunHistory
        title="Historique des analyses externes"
        runs={runs.map((run) => ({
          id: run.id,
          status: run.status,
          createdAt: run.createdAt,
          errorMessage: run.errorMessage,
          detail: `${run.factorsCount} facteur(s) · ${run.sourcesCount} source(s)${
            run.searchQueries.length > 0 ? ` · ${run.searchQueries.length} recherche(s) web` : ""
          }`,
        }))}
      />
    </div>
  );
}
