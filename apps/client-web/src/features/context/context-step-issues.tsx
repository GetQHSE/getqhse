/**
 * Steps 3 and 4 — synthèse des enjeux, validation, vue SWOT/PESTEL and
 * export, same layout and wording as the foundation's IssuesSynthesisPanel /
 * IssuesValidationPanel / ContextIssueCard / ManualIssueDialog /
 * ContextVisualSummary / ContextExportCard.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardCheckIcon,
  FileDownIcon,
  FileTextIcon,
  LayersIcon,
  PlusIcon,
  ScaleIcon,
} from "lucide-react";
import type {
  ContextAnalysisMethod,
  ContextAnalysisRunSummary,
  ContextIssue,
  ContextIssueReviewStatus,
} from "@qhse/contracts";
import {
  evidenceSourceLabel,
  groupCorrections,
  hasAnalysisCorrection,
} from "@qhse/domain/smq/context/labels";
import {
  PESTEL_DIMENSIONS,
  SWOT_QUADRANTS,
  analysisMethodLabel,
  pestelDimensionKey,
} from "@qhse/domain/smq/context/method";
import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@qhse/ui/components/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@qhse/ui/components/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@qhse/ui/components/dialog";
import { Input } from "@qhse/ui/components/input";
import { Label } from "@qhse/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@qhse/ui/components/native-select";
import { Textarea } from "@qhse/ui/components/textarea";
import { cn } from "@qhse/ui/lib/utils";

import { clientApi } from "../../app/client-api.js";
import {
  ContextRunHistory,
  EmptyState,
  ErrorState,
  Field,
  ProcessingState,
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

const NATURE_LABELS: Record<string, string> = {
  force: "Force",
  faiblesse: "Faiblesse",
  opportunite: "Opportunité",
  menace: "Menace",
};

const REVIEW_LABELS: Record<ContextIssueReviewStatus, string> = {
  PENDING: "À valider",
  VALIDATED: "Validé",
  MODIFIED: "Modifié par un expert",
  NOT_RETAINED: "Non retenu",
};

const SCORE_HELPER =
  "Les scores représentent l’impact estimé par GetQhse à partir des informations et preuves disponibles. Ils ne constituent pas un système de notation ISO officiel.";

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
  const [editOpen, setEditOpen] = useState(false);
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description ?? "");
  const [nature, setNature] = useState(issue.nature ?? "force");
  const [reason, setReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const scores = issue.scores;
  const auditEvents = useMemo(() => groupCorrections(issue.corrections), [issue.corrections]);
  const humanEdited = issue.humanOverride || hasAnalysisCorrection(issue.corrections);
  const isValidated = issue.reviewStatus === "VALIDATED";
  const isNotRetained = issue.reviewStatus === "NOT_RETAINED";

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
    <Card className="shadow-none">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {issue.origin === "INTERNAL" ? "Enjeu interne" : "Enjeu externe"}
          </Badge>
          {issue.nature ? (
            <Badge variant="outline">{NATURE_LABELS[issue.nature] ?? issue.nature}</Badge>
          ) : null}
          {issue.categoryLabel ? <Badge variant="outline">{issue.categoryLabel}</Badge> : null}
          <Badge variant="outline">{REVIEW_LABELS[issue.reviewStatus]}</Badge>
          {issue.selectedPriority && !isNotRetained ? <Badge>Prioritaire</Badge> : null}
          {issue.comparisonStatus === "recurrent" ? (
            <Badge variant="outline">Récurrent</Badge>
          ) : null}
        </div>
        <CardTitle className="text-base">{issue.title}</CardTitle>
        {issue.description ? <CardDescription>{issue.description}</CardDescription> : null}
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        <div className="space-y-1">
          <dl className="grid gap-3 sm:grid-cols-4">
            <Field label="Objectifs">{scores.influenceObjectives ?? "—"} / 5</Field>
            <Field label="Qualité">{scores.influenceQuality ?? "—"} / 5</Field>
            <Field label="Satisfaction client">{scores.influenceCustomer ?? "—"} / 5</Field>
            <Field label="Influence globale">{scores.overall ?? "—"} / 5</Field>
          </dl>
          <p className="text-xs text-muted-foreground">{SCORE_HELPER}</p>
        </div>

        {issue.impactOverall ? (
          <div>
            <p className="text-xs text-muted-foreground">Impact global identifié</p>
            <p>{issue.impactOverall}</p>
          </div>
        ) : null}

        <Collapsible>
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="px-0" />}>
            Voir le raisonnement et les preuves
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-3">
            {issue.aiReasoning ? (
              <section className="space-y-1">
                <p className="text-xs font-medium text-foreground">Raisonnement de l’analyse</p>
                <p className="text-xs text-muted-foreground">{issue.aiReasoning}</p>
              </section>
            ) : null}

            {issue.evidence.length > 0 ? (
              <section className="space-y-1">
                <p className="text-xs font-medium text-foreground">
                  Preuves rattachées ({issue.evidence.length})
                </p>
                <ul className="space-y-1">
                  {issue.evidence.map((item) => (
                    <li key={item.id} className="text-xs text-muted-foreground">
                      <span className="text-foreground">
                        {item.originKind === "USER"
                          ? "Information ajoutée par l’utilisateur"
                          : evidenceSourceLabel(item.sourceType)}
                      </span>
                      {item.excerpt ? ` — « ${item.excerpt} »` : ""}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {humanEdited ? (
              <section className="space-y-1 rounded-md border border-border/70 bg-muted/30 p-3">
                <p className="text-xs font-medium text-foreground">
                  Conclusion initiale de l’analyse (conservée)
                </p>
                <p className="text-xs text-muted-foreground">
                  {issue.aiTitle}
                  {issue.aiNature ? ` · ${NATURE_LABELS[issue.aiNature] ?? issue.aiNature}` : ""}
                </p>
                {issue.aiDescription ? (
                  <p className="text-xs text-muted-foreground">{issue.aiDescription}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {isValidated
                    ? "Analyse modifiée par un expert avant validation. L’intitulé, la description et la nature affichés plus haut sont la valeur retenue par l’expert."
                    : "L’intitulé, la description et la nature affichés plus haut sont la valeur retenue par l’expert."}
                </p>
              </section>
            ) : null}

            {auditEvents.length > 0 ? (
              <section className="space-y-2">
                <p className="text-xs font-medium text-foreground">
                  Historique des décisions ({auditEvents.length})
                </p>
                <ul className="space-y-2">
                  {auditEvents.map((event) => (
                    <li key={event.id} className="text-xs text-muted-foreground">
                      <span className="text-foreground">{event.label}</span> ·{" "}
                      {new Date(event.createdAt).toLocaleString("fr-FR")}
                      {event.details.length > 0 ? (
                        <span> · {event.details.join(" · ")}</span>
                      ) : null}
                      {event.reason ? <div>Motif : {event.reason}</div> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </CollapsibleContent>
        </Collapsible>

        {showReviewActions && onReview ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {isNotRetained ? (
              <>
                <span className="text-xs text-muted-foreground">
                  Enjeu non retenu — décision conservée dans l’historique.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isReviewing}
                  onClick={() =>
                    onReview({
                      issueId: issue.id,
                      reviewStatus: "PENDING",
                      reason: "Enjeu réintégré à la revue humaine.",
                    })
                  }
                >
                  Réintégrer l’enjeu
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isReviewing}
                  onClick={() => setEditOpen(true)}
                >
                  Modifier l’analyse
                </Button>
              </>
            ) : (
              <>
                {isValidated ? (
                  <span className="text-xs font-medium text-foreground">Enjeu validé</span>
                ) : (
                  <Button
                    size="sm"
                    disabled={isReviewing}
                    onClick={() =>
                      onReview({
                        issueId: issue.id,
                        reviewStatus: "VALIDATED",
                        reason: "Enjeu validé par la revue humaine.",
                      })
                    }
                  >
                    Valider cet enjeu
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isReviewing}
                  onClick={() =>
                    onReview({
                      issueId: issue.id,
                      selectedPriority: !issue.selectedPriority,
                      reason: issue.selectedPriority
                        ? "Enjeu retiré des priorités par la revue humaine."
                        : "Enjeu retenu comme prioritaire par la revue humaine.",
                    })
                  }
                >
                  {issue.selectedPriority ? "Retirer des priorités" : "Marquer prioritaire"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isReviewing}
                  onClick={() => setEditOpen(true)}
                >
                  Modifier l’analyse
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isReviewing}
                  onClick={() => setRejectOpen(true)}
                >
                  Ne pas retenir
                </Button>
              </>
            )}
          </div>
        ) : null}
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l’analyse de cet enjeu</DialogTitle>
            <DialogDescription>
              La conclusion initiale reste conservée et votre correction est enregistrée dans
              l’historique, avec son motif.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`title-${issue.id}`}>Intitulé</Label>
              <Input
                id={`title-${issue.id}`}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`description-${issue.id}`}>Description</Label>
              <Textarea
                id={`description-${issue.id}`}
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`nature-${issue.id}`}>Nature</Label>
              <NativeSelect
                id={`nature-${issue.id}`}
                className="w-full"
                value={nature}
                onChange={(event) => setNature(event.target.value)}
              >
                <NativeSelectOption value="force">Force</NativeSelectOption>
                <NativeSelectOption value="faiblesse">Faiblesse</NativeSelectOption>
                <NativeSelectOption value="opportunite">Opportunité</NativeSelectOption>
                <NativeSelectOption value="menace">Menace</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`reason-${issue.id}`}>Motif de la correction</Label>
              <Textarea
                id={`reason-${issue.id}`}
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Expliquez pourquoi cette analyse doit être corrigée."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Annuler
            </Button>
            <Button disabled={reason.trim().length < 5 || isReviewing} onClick={submitEdit}>
              Enregistrer la correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ne pas retenir cet enjeu</DialogTitle>
            <DialogDescription>
              L’enjeu reste conservé dans l’historique de l’analyse : il est simplement écarté de la
              liste retenue, avec votre motif.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`reject-${issue.id}`}>Motif</Label>
            <Textarea
              id={`reject-${issue.id}`}
              rows={3}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Pourquoi cet enjeu n’est-il pas retenu ?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Annuler
            </Button>
            <Button disabled={rejectReason.trim().length < 5 || isReviewing} onClick={submitReject}>
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------------------------------- step 3 ---------------------------------- */

const NATURE_GROUPS: { key: string; label: string; helper: string }[] = [
  { key: "force", label: "Forces", helper: "Contexte interne favorable" },
  { key: "faiblesse", label: "Faiblesses", helper: "Contexte interne à renforcer" },
  { key: "opportunite", label: "Opportunités", helper: "Contexte externe favorable" },
  { key: "menace", label: "Menaces", helper: "Contexte externe défavorable" },
];

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
  const hasIssues = issues.length > 0;
  const others = issues.filter(
    (issue) => !NATURE_GROUPS.some((group) => group.key === issue.nature),
  );

  return (
    <div className="space-y-6">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-lg">Synthèse des enjeux</CardTitle>
          <CardDescription>
            GetQhse croise votre contexte interne déclaré, votre profil validé, les facteurs
            externes documentés et votre contexte réglementaire établi pour identifier vos enjeux.
            Chaque enjeu est rattaché aux éléments qui le justifient ; rien n’est ajouté hors de ce
            matériel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {blockedReason ? <p className="text-sm text-muted-foreground">{blockedReason}</p> : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {hasIssues ? (
              <Button variant="outline" onClick={onContinue} disabled={isRunning}>
                Continuer vers la validation
              </Button>
            ) : null}
            <Button type="button" disabled={!canLaunch || isRunning} onClick={onLaunch}>
              {isRunning
                ? "Synthèse en cours…"
                : hasIssues
                  ? "Relancer la synthèse"
                  : "Lancer la synthèse des enjeux"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isRunning ? (
        <ProcessingState
          title="Synthèse des enjeux en cours…"
          description="Croisement du contexte interne, des facteurs externes et du contexte réglementaire établi. Cette étape peut prendre plusieurs minutes."
        />
      ) : null}

      {errorMessage ? (
        <ErrorState
          title="La synthèse n’a pas abouti"
          description={errorMessage}
          onRetry={canLaunch ? onLaunch : undefined}
        />
      ) : null}

      {!hasIssues && !isRunning && !errorMessage ? (
        <EmptyState
          icon={LayersIcon}
          title="Aucun enjeu n’a encore été identifié."
          description="Lancez la synthèse : les enjeux internes et externes seront proposés avec leur justification, puis soumis à votre validation."
        />
      ) : null}

      {hasIssues
        ? NATURE_GROUPS.map((group) => {
            const items = issues.filter((issue) => issue.nature === group.key);
            if (items.length === 0) return null;
            return (
              <section key={group.key} className="space-y-3">
                <div>
                  <h2 className="text-sm font-medium text-foreground">
                    {group.label} · {items.length}
                  </h2>
                  <p className="text-xs text-muted-foreground">{group.helper}</p>
                </div>
                {items.map((issue) => (
                  <ContextIssueCard key={issue.id} issue={issue} />
                ))}
              </section>
            );
          })
        : null}

      {hasIssues && others.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">Autres enjeux · {others.length}</h2>
          {others.map((issue) => (
            <ContextIssueCard key={issue.id} issue={issue} />
          ))}
        </section>
      ) : null}

      <ContextRunHistory
        title="Historique des synthèses"
        runs={runs.map((run) => ({
          id: run.id,
          status: run.status,
          createdAt: run.createdAt,
          errorMessage: run.errorMessage,
          detail: `${run.issuesCount} enjeu(x) · ${run.internalCount} interne(s) · ${run.externalCount} externe(s)`,
        }))}
      />
    </div>
  );
}

/* ---------------------------------- step 4 ---------------------------------- */

type Filter = "pending" | "retained" | "not_retained" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "À valider" },
  { key: "retained", label: "Retenus" },
  { key: "not_retained", label: "Non retenus" },
  { key: "all", label: "Tous" },
];

const DESTINATION_LABELS: Record<ContextIssueReviewStatus, string> = {
  VALIDATED: "Retenus",
  MODIFIED: "Retenus",
  NOT_RETAINED: "Non retenus",
  PENDING: "À valider",
};

export function IssuesValidationPanel({
  issues,
  metrics,
  isReviewing,
  onReview,
  analysisDate,
  methodologyVersion,
}: {
  issues: ContextIssue[];
  metrics: ReturnType<typeof computeIssueMetrics>;
  isReviewing: boolean;
  onReview: (input: ReviewIssueInput) => void;
  analysisDate: string | null;
  methodologyVersion: string | null;
}) {
  const [filter, setFilter] = useState<Filter>("pending");

  const filtered = issues.filter((issue) => {
    if (filter === "all") return true;
    if (filter === "pending") return issue.reviewStatus === "PENDING";
    if (filter === "not_retained") return issue.reviewStatus === "NOT_RETAINED";
    return issue.reviewStatus === "VALIDATED" || issue.reviewStatus === "MODIFIED";
  });

  const handleReview = (input: ReviewIssueInput) => {
    onReview(input);
    if (input.reviewStatus && filter !== "all") {
      const destination = DESTINATION_LABELS[input.reviewStatus];
      if (destination !== FILTERS.find((item) => item.key === filter)?.label) {
        notify.success(
          `Modification enregistrée. L’enjeu est maintenant visible dans « ${destination} ».`,
        );
      }
    }
  };

  if (issues.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheckIcon}
        title="Aucun enjeu à valider pour l’instant."
        description="Lancez d’abord la synthèse des enjeux (étape 3)."
      />
    );
  }

  const retained = metrics.total - metrics.notRetained;

  return (
    <div className="space-y-6">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-lg">Validation des enjeux</CardTitle>
          <CardDescription>
            Vous restez décideur : validez, corrigez, priorisez ou écartez chaque enjeu. Chaque
            décision est enregistrée avec son motif, et la conclusion initiale de l’analyse est
            toujours conservée.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="Enjeux">{metrics.total}</Field>
            <Field label="À valider">{metrics.pending}</Field>
            <Field label="Validés">{metrics.validated}</Field>
            <Field label="Corrigés">{metrics.modified}</Field>
            <Field label="Non retenus">{metrics.notRetained}</Field>
            <Field label="Prioritaires">{metrics.priority}</Field>
          </dl>
          <p className="text-xs text-muted-foreground">
            « Corrigés » compte les enjeux dont l’analyse a été modifiée par un expert, même s’ils
            ont ensuite été validés. Ces compteurs décrivent des dimensions différentes et ne
            s’additionnent pas.
          </p>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <Button
                key={item.key}
                type="button"
                size="sm"
                variant={filter === item.key ? "default" : "outline"}
                className={cn(filter === item.key && "pointer-events-none")}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </div>

          {metrics.pending === 0 ? (
            <div className="space-y-1 rounded-md border border-border/70 bg-muted/30 p-4">
              <p className="text-sm font-medium text-foreground">Analyse des enjeux validée</p>
              <p className="text-xs text-muted-foreground">
                Revue humaine terminée : {retained} enjeu(x) retenu(s) · {metrics.notRetained} non
                retenu(s) · {metrics.priority} prioritaire(s)
                {analysisDate
                  ? ` · analyse du ${new Date(analysisDate).toLocaleDateString("fr-FR")}`
                  : ""}
                {methodologyVersion ? ` · méthodologie ${methodologyVersion}` : ""}.
              </p>
              <p className="text-xs text-muted-foreground">
                Cela signifie uniquement que votre revue de cette analyse du contexte est terminée :
                il ne s’agit ni d’une certification, ni d’une conformité ISO, ni d’une validation
                juridique.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun enjeu dans cette sélection.</p>
      ) : (
        filtered.map((issue) => (
          <ContextIssueCard
            key={issue.id}
            issue={issue}
            showReviewActions
            isReviewing={isReviewing}
            onReview={handleReview}
          />
        ))
      )}
    </div>
  );
}

/**
 * Manual addition of an issue by a member: saved as added by the
 * organisation (never as an AI conclusion) and retained.
 */
export function ManualIssueDialog({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<"INTERNAL" | "EXTERNAL">("INTERNAL");
  const [nature, setNature] = useState<Nature>("force");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      clientApi.createManualContextIssue(projectId, {
        origin,
        nature,
        title: title.trim(),
        description: description.trim(),
        categoryKey: "ajout_manuel",
        categoryLabel: category.trim() || "Ajout manuel",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["context-issues", projectId] });
      notify.success("Enjeu ajouté et retenu.");
      setOpen(false);
      reset();
    },
    onError: (mutationError) =>
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "L’enjeu n’a pas pu être ajouté. Réessayez.",
      ),
  });

  const natureOptions: { value: Nature; label: string }[] =
    origin === "INTERNAL"
      ? [
          { value: "force", label: "Force" },
          { value: "faiblesse", label: "Faiblesse" },
        ]
      : [
          { value: "opportunite", label: "Opportunité" },
          { value: "menace", label: "Menace" },
        ];

  const reset = () => {
    setOrigin("INTERNAL");
    setNature("force");
    setTitle("");
    setDescription("");
    setCategory("");
    setError(null);
  };

  const submit = () => {
    setError(null);
    if (title.trim().length < 3) {
      setError("Indiquez un intitulé d’au moins 3 caractères.");
      return;
    }
    if (description.trim().length < 3) {
      setError("Décrivez l’enjeu en quelques mots.");
      return;
    }
    create.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <PlusIcon className="mr-2 size-4" aria-hidden />
        Ajouter un enjeu
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un enjeu</DialogTitle>
          <DialogDescription>
            Cet enjeu sera enregistré comme ajouté par vous, avec votre nom et la date, et sera
            retenu pour la suite de l’analyse.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="manual-issue-origin">Origine</Label>
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
                <NativeSelectOption value="INTERNAL">Contexte interne</NativeSelectOption>
                <NativeSelectOption value="EXTERNAL">Contexte externe</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-issue-nature">Nature</Label>
              <NativeSelect
                id="manual-issue-nature"
                className="w-full"
                value={nature}
                onChange={(event) => setNature(event.target.value as Nature)}
              >
                {natureOptions.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-issue-title">Intitulé de l’enjeu</Label>
            <Input
              id="manual-issue-title"
              value={title}
              maxLength={240}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-issue-description">Description</Label>
            <Textarea
              id="manual-issue-description"
              rows={4}
              value={description}
              maxLength={4000}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-issue-category">Catégorie (facultatif)</Label>
            <Input
              id="manual-issue-category"
              value={category}
              maxLength={160}
              placeholder="Par exemple : compétences, marché, logistique"
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
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={create.isPending}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Enregistrement…" : "Ajouter l’enjeu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ SWOT / PESTEL view ----------------------------- */

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
  const retained = issues.filter(
    (issue) => issue.reviewStatus === "VALIDATED" || issue.reviewStatus === "MODIFIED",
  );
  if (retained.length === 0) return null;
  const label = analysisMethodLabel(method.toLowerCase());

  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-lg">
            {method === "PESTEL" ? "Vue PESTEL" : "Matrice SWOT"}
          </CardTitle>
          <Badge variant="secondary">{methodExplicit ? label : `${label} (par défaut)`}</Badge>
          <Badge variant="outline">Référence ISO 9001:2015 — §4.1</Badge>
        </div>
        <CardDescription>
          Construite à partir des enjeux retenus et de leurs valeurs effectives (vos corrections
          incluses).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {method === "PESTEL" ? <PestelGrid issues={retained} /> : <SwotMatrix issues={retained} />}
      </CardContent>
    </Card>
  );
}

function SwotMatrix({ issues }: { issues: ContextIssue[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {SWOT_QUADRANTS.map((quadrant) => {
        const rows = issues.filter((issue) => issue.nature === quadrant.key);
        return (
          <section key={quadrant.key} className="rounded-lg border border-border p-4">
            <header className="mb-2">
              <h3 className="font-medium text-foreground">
                {quadrant.label}{" "}
                <span className="text-sm text-muted-foreground">({rows.length})</span>
              </h3>
              <p className="text-sm text-muted-foreground">{quadrant.helper}</p>
            </header>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun enjeu retenu.</p>
            ) : (
              <ul className="space-y-2">
                {rows.map((issue) => (
                  <li key={issue.id} className="text-sm text-foreground">
                    <span className="font-medium">{issue.title}</span>
                    {issue.sourceKind === "MANUAL" ? (
                      <Badge variant="outline" className="ml-2">
                        Ajouté par vous
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function PestelGrid({ issues }: { issues: ContextIssue[] }) {
  const internal = issues.filter((issue) => issue.origin === "INTERNAL");
  const external = issues.filter((issue) => issue.origin === "EXTERNAL");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PESTEL_DIMENSIONS.map((dimension) => {
          const rows = external.filter(
            (issue) => pestelDimensionKey(issue.categoryKey, issue.categoryLabel) === dimension.key,
          );
          return (
            <section key={dimension.key} className="rounded-lg border border-border p-4">
              <header className="mb-2">
                <h3 className="flex items-center gap-2 font-medium text-foreground">
                  {dimension.reusesRegulatory ? (
                    <ScaleIcon className="size-4 text-muted-foreground" aria-hidden />
                  ) : null}
                  {dimension.label}{" "}
                  <span className="text-sm text-muted-foreground">({rows.length})</span>
                </h3>
                <p className="text-sm text-muted-foreground">{dimension.helper}</p>
              </header>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun enjeu retenu.</p>
              ) : (
                <ul className="space-y-2">
                  {rows.map((issue) => (
                    <li key={issue.id} className="text-sm text-foreground">
                      <span className="font-medium">{issue.title}</span>
                      <span className="ml-2 text-sm text-muted-foreground">
                        {issue.nature === "opportunite" ? "Opportunité" : "Menace"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <section className="rounded-lg border border-border p-4">
        <h3 className="font-medium text-foreground">
          Contexte interne{" "}
          <span className="text-sm text-muted-foreground">({internal.length})</span>
        </h3>
        <p className="text-sm text-muted-foreground">
          Le contexte interne fait partie du contexte de l’organisation selon l’ISO : il est
          conservé même avec la méthode PESTEL.
        </p>
        {internal.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Aucun enjeu interne retenu.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {internal.map((issue) => (
              <li key={issue.id} className="text-sm text-foreground">
                <span className="font-medium">{issue.title}</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {issue.nature === "force" ? "Force" : "Faiblesse"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------- export ---------------------------------- */

/** Word and PDF exports, both built from one shared snapshot. */
export function ContextExportCard({ document }: { document: ContextDocument | null }) {
  const [busy, setBusy] = useState<"docx" | "pdf" | null>(null);

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
      notify.error("Le document n’a pas pu être généré. Réessayez.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-lg">Exporter l’analyse des enjeux</CardTitle>
        <CardDescription>
          Le document reprend votre contexte interne déclaré, les facteurs externes et leurs
          sources, les enjeux et vos décisions. Les deux formats contiennent exactement les mêmes
          données.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={!document || busy !== null}
          onClick={() => void run("docx")}
        >
          <FileTextIcon className="mr-2 size-4" aria-hidden />
          {busy === "docx" ? "Génération…" : "Word (.docx)"}
        </Button>
        <Button
          variant="outline"
          disabled={!document || busy !== null}
          onClick={() => void run("pdf")}
        >
          <FileDownIcon className="mr-2 size-4" aria-hidden />
          {busy === "pdf" ? "Génération…" : "PDF"}
        </Button>
      </CardContent>
    </Card>
  );
}
