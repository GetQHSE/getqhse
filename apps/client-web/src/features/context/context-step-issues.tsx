/**
 * Step 3 — synthèse des enjeux, laid out as the demo template's synthesis
 * tab: intro card, qualification legend, evaluation table (impact × capacité
 * de maîtrise → qualification) and a single "Valider la synthèse" action that
 * unlocks the exports. Launching the AI synthesis stays above it.
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ContextIssue } from "@qhse/contracts";
import {
  ISSUE_QUALIFICATIONS,
  isEvaluationLevel,
  issueQualification,
  qualificationLabel,
  type EvaluationLevel,
  type IssueQualification,
} from "@qhse/domain/smq/context/evaluation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@qhse/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@qhse/ui/components/dropdown-menu";
import { Input } from "@qhse/ui/components/input";
import { Label } from "@qhse/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@qhse/ui/components/native-select";
import { Textarea } from "@qhse/ui/components/textarea";
import { cn } from "@qhse/ui/lib/utils";

import { clientApi } from "../../app/client-api.js";
import { currentLanguage } from "../../app/i18n.js";
import { evaluatedIssues } from "./evaluation.js";
import {
  AiBanner,
  EmptyState,
  ErrorState,
  GqButton,
  ProcessingState,
  notify,
} from "./context-ui.js";
import { contextDocumentFileName, type ContextDocument } from "./export/document.js";
import { downloadBlob } from "./export/download.js";

type Nature = "force" | "faiblesse" | "opportunite" | "menace";

const NATURES = ["force", "faiblesse", "opportunite", "menace"] as const;

export type EvaluationField = "impact" | "mastery";

export interface IssueEditInput {
  issueId: string;
  title?: string;
  description?: string;
  nature?: Nature;
  reason: string;
}

const QUALIFICATION_TONES: Record<IssueQualification, string> = {
  majeur: "is-major",
  significatif: "is-significant",
  a_surveiller: "is-watch",
  mineur: "is-minor",
};

const LEVEL_KEYS = { 1: "low", 2: "medium", 3: "high" } as const;

/* --------------------------------- launch --------------------------------- */

export function IssuesSynthesisPanel({
  showLaunch,
  hasIssues,
  canLaunch,
  blockedReason,
  isRunning,
  errorMessage,
  onLaunch,
  children,
}: {
  /** The launch banner: shown until issues exist, or when they need a new run. */
  showLaunch: boolean;
  hasIssues: boolean;
  canLaunch: boolean;
  blockedReason: string | null;
  isRunning: boolean;
  errorMessage: string | null;
  onLaunch: () => void;
  /** The evaluation, shown once issues exist. */
  children?: ReactNode;
}) {
  const { t } = useTranslation("context");

  return (
    <div className="space-y-4">
      {showLaunch ? (
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
      ) : null}

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

      {hasIssues ? children : null}
    </div>
  );
}

/* ------------------------------- evaluation ------------------------------- */

export function IssuesEvaluation({
  issues,
  validated,
  isSaving,
  isValidating,
  onRate,
  onEdit,
  onValidate,
  onBack,
}: {
  issues: ContextIssue[];
  /** "Valider la synthèse" was done, and nothing changed since. */
  validated: boolean;
  isSaving: boolean;
  isValidating: boolean;
  onRate: (issue: ContextIssue, field: EvaluationField, value: EvaluationLevel) => void;
  onEdit: (input: IssueEditInput) => void;
  onValidate: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation("context");
  const language = currentLanguage();
  const [editing, setEditing] = useState<ContextIssue | null>(null);

  const rows = evaluatedIssues(issues);
  const allRated = rows.every(
    (issue) => issueQualification(issue.scores.impact, issue.scores.mastery) !== null,
  );

  const levelNote = (field: EvaluationField, value: unknown) =>
    isEvaluationLevel(value)
      ? t(
          field === "impact"
            ? `issues.evaluation.impactLevel.${LEVEL_KEYS[value]}`
            : `issues.evaluation.masteryLevel.${LEVEL_KEYS[value]}`,
        )
      : t("issues.evaluation.unrated");

  const levelCell = (issue: ContextIssue, field: EvaluationField, columnLabel: string) => {
    const value = issue.scores[field];
    return (
      <td>
        <select
          aria-label={`${columnLabel} — ${issue.title}`}
          value={isEvaluationLevel(value) ? value : ""}
          disabled={isSaving}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (isEvaluationLevel(next)) onRate(issue, field, next);
          }}
        >
          {isEvaluationLevel(value) ? null : (
            <option value="" disabled>
              —
            </option>
          )}
          {([1, 2, 3] as const).map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
        <span className="gq-scale-note">{levelNote(field, value)}</span>
      </td>
    );
  };

  const impactColumn = t("issues.evaluation.columns.impact");
  const masteryColumn = t("issues.evaluation.columns.mastery");

  return (
    <div className="gq-synthesis-wrap">
      <section className="gq-card gq-synthesis-intro">
        <div>
          <div className="gq-eyebrow">{t("issues.evaluation.eyebrow")}</div>
          <h3>{t("issues.evaluation.title")}</h3>
          <p>{t("issues.evaluation.body")}</p>
        </div>
        <div className="gq-synthesis-actions">
          <GqButton onClick={onBack}>{t("issues.evaluation.back")}</GqButton>
          <GqButton
            variant="primary"
            onClick={() =>
              document.getElementById("issues-eval-table")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            {t("issues.evaluation.evaluate")}
          </GqButton>
        </div>
      </section>

      <div className="gq-score-legend">
        {ISSUE_QUALIFICATIONS.map((qualification) => (
          <span key={qualification}>
            <i className={cn("gq-dot", QUALIFICATION_TONES[qualification])} aria-hidden />
            <b>{qualificationLabel(qualification, language)}</b>
          </span>
        ))}
        <small>{t("issues.evaluation.legendNote")}</small>
      </div>

      <section className="gq-card gq-eval-card" id="issues-eval-table">
        <div className="gq-eval-head">
          <div>
            <h3>{t("issues.evaluation.tableTitle")}</h3>
            <p>{t("issues.evaluation.tableBody")}</p>
          </div>
          <span className="gq-ai-pill">{t("issues.evaluation.aiPill")}</span>
        </div>
        <div className="gq-eval-scroll">
          <table className="gq-eval-table">
            <thead>
              <tr>
                <th>{t("issues.evaluation.columns.issue")}</th>
                <th>{t("issues.evaluation.columns.nature")}</th>
                <th>{impactColumn}</th>
                <th>{masteryColumn}</th>
                <th>{t("issues.evaluation.columns.qualification")}</th>
                <th>
                  <span className="sr-only">{t("issues.evaluation.columns.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((issue) => {
                const qualification = issueQualification(issue.scores.impact, issue.scores.mastery);
                return (
                  <tr key={issue.id}>
                    <td>
                      <strong>{issue.title}</strong>
                      {issue.categoryLabel ? <small>{issue.categoryLabel}</small> : null}
                    </td>
                    <td>
                      <span
                        className={cn(
                          "gq-nature",
                          issue.origin === "INTERNAL" ? "is-internal" : "is-external",
                        )}
                      >
                        {t(`issues.evaluation.origin.${issue.origin}`)}
                      </span>
                    </td>
                    {levelCell(issue, "impact", impactColumn)}
                    {levelCell(issue, "mastery", masteryColumn)}
                    <td>
                      {qualification ? (
                        <span
                          className={cn("gq-qualification", QUALIFICATION_TONES[qualification])}
                        >
                          {qualificationLabel(qualification, language)}
                        </span>
                      ) : (
                        <span className="gq-qualification">{t("issues.evaluation.unrated")}</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="gq-edit-mini"
                        disabled={isSaving}
                        onClick={() => setEditing(issue)}
                      >
                        {t("issues.evaluation.edit")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="gq-eval-footer">
          <span>
            {validated
              ? t("issues.evaluation.validatedNote")
              : allRated
                ? t("issues.evaluation.editableNote")
                : t("issues.evaluation.unratedNote")}
          </span>
          <div>
            <span className="gq-valid-note">
              {validated
                ? t("issues.evaluation.validationDone")
                : t("issues.evaluation.validationRequired")}
            </span>
            <GqButton
              variant="primary"
              disabled={validated || !allRated || isValidating}
              onClick={onValidate}
            >
              {validated ? t("issues.evaluation.validated") : t("issues.evaluation.validate")}
            </GqButton>
          </div>
        </div>
      </section>

      {editing ? (
        <IssueEditDialog
          key={editing.id}
          issue={editing}
          isSaving={isSaving}
          onClose={() => setEditing(null)}
          onSubmit={(input) => {
            onEdit(input);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * "Modifier": the audited correction of an issue's analysis. The AI's
 * initial conclusion stays stored; the correction is kept with its reason.
 */
export function IssueEditDialog({
  issue,
  isSaving,
  onClose,
  onSubmit,
}: {
  issue: ContextIssue;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (input: IssueEditInput) => void;
}) {
  const { t } = useTranslation("context");
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description ?? "");
  const [nature, setNature] = useState(issue.nature ?? "force");
  const [reason, setReason] = useState("");

  const submit = () => {
    if (reason.trim().length < 5) return;
    const input: IssueEditInput = { issueId: issue.id, reason: reason.trim() };
    if (title.trim() && title.trim() !== issue.title) input.title = title.trim();
    if (description.trim() !== (issue.description ?? "")) input.description = description.trim();
    if (nature !== issue.nature) input.nature = nature as Nature;
    onSubmit(input);
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
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
          <GqButton onClick={onClose}>{t("cancel", { ns: "common" })}</GqButton>
          <GqButton
            variant="primary"
            disabled={reason.trim().length < 5 || isSaving}
            onClick={submit}
          >
            {t("issues.saveCorrection")}
          </GqButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- export --------------------------------- */

type ExportFormat = "xlsx" | "docx" | "pdf";

/**
 * The template's "Exporter" menu: disabled until the synthesis is validated.
 * Word and PDF are generated in the browser from the canonical document; the
 * Excel register is built by the API from the same data.
 */
export function ContextExportMenu({
  projectId,
  document,
  enabled,
}: {
  projectId: string;
  document: ContextDocument | null;
  enabled: boolean;
}) {
  const { t } = useTranslation("context");
  const [busy, setBusy] = useState(false);
  // jsPDF's built-in fonts have no Arabic glyphs; Word renders Arabic natively.
  const pdfAvailable = document?.language !== "ar";
  const ready = enabled && document !== null && !busy;

  const run = async (format: ExportFormat) => {
    if (!document || busy) return;
    setBusy(true);
    try {
      if (format === "xlsx") {
        const data = await clientApi.exportContextRegister(projectId);
        downloadBlob(
          new Blob([data], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
          contextDocumentFileName(document, "xlsx"),
        );
      } else if (format === "docx") {
        const { downloadContextWord } = await import("./export/word.js");
        await downloadContextWord(document);
      } else {
        const { downloadContextPdf } = await import("./export/pdf.js");
        await downloadContextPdf(document);
      }
    } catch {
      notify.error(t("issues.exportMenu.failed"));
    } finally {
      setBusy(false);
    }
  };

  const items: { format: ExportFormat; icon: string; label: string; disabled?: boolean }[] = [
    { format: "xlsx", icon: "▦", label: "Excel" },
    { format: "docx", icon: "▤", label: "Word" },
    { format: "pdf", icon: "▧", label: "PDF", disabled: !pdfAvailable },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={!ready}
        className={cn("gq-export-btn", ready && "is-enabled")}
        title={enabled ? undefined : t("issues.evaluation.validationRequired")}
      >
        <span aria-hidden>⇩</span>
        {busy ? t("issues.exportMenu.generating") : t("issues.exportMenu.label")}
        <span aria-hidden>⌄</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[210px] rounded-[13px] p-[7px]">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.format}
            disabled={item.disabled}
            className="h-[39px] gap-2.5 rounded-[9px] px-2.5 text-xs font-medium text-slate-700"
            title={item.disabled ? t("issues.exportMenu.pdfArabicUnavailable") : undefined}
            onClick={() => void run(item.format)}
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
            <span className="ms-auto text-[10px] text-slate-400">.{item.format}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
