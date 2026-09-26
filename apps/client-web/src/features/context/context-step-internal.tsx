/**
 * Tab 1 — contexte interne. The questionnaire collects the organisation's own
 * declarations (never AI-generated); once answered, the template's view takes
 * over: the Assistant QHSE deduces forces and faiblesses from them, and the
 * user validates the ones that feed the synthesis.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ContextInternalInput, ContextIssue, SupportedLanguage } from "@qhse/contracts";
import { Textarea } from "@qhse/ui/components/textarea";
import { cn } from "@qhse/ui/lib/utils";

import { clientApi } from "../../app/client-api.js";
import { i18n } from "../../app/i18n.js";
import { IssueEditDialog, type IssueEditInput } from "./context-step-issues.js";
import {
  AiBanner,
  EmptyState,
  ErrorState,
  FooterCard,
  GqButton,
  ProcessingState,
  ResultsHead,
  notify,
} from "./context-ui.js";
import {
  INTERNAL_CONTEXT_SECTIONS,
  questionLabel,
  questionShortLabel,
  sectionHelper,
  sectionTitle,
  type InternalContextSection,
} from "./internal-context-questions.js";

const ALL_QUESTIONS = INTERNAL_CONTEXT_SECTIONS.flatMap((section) => section.questions);
const TOTAL_QUESTIONS = ALL_QUESTIONS.length;

function isAnswered(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

function SectionCard({
  section,
  answers,
  missingKeys,
  registerField,
  disabled,
  onChange,
}: {
  section: InternalContextSection;
  answers: Record<string, string>;
  missingKeys: ReadonlySet<string>;
  registerField: (questionKey: string, element: HTMLTextAreaElement | null) => void;
  disabled: boolean;
  onChange: (questionKey: string, value: string) => void;
}) {
  const { t } = useTranslation("context");
  const answered = section.questions.filter((question) =>
    isAnswered(answers[question.questionKey]),
  ).length;
  return (
    <section className="gq-card">
      <div className="gq-row">
        <div>
          <h3>{sectionTitle(t, section.key)}</h3>
          <p className="gq-lead">{sectionHelper(t, section.key)}</p>
        </div>
        <span className={cn("gq-badge", answered === section.questions.length && "is-valid")}>
          {answered} / {section.questions.length}
        </span>
      </div>
      <div className="mt-2">
        {section.questions.map((question) => {
          const inputId = `internal-input-${question.questionKey}`;
          const missing = missingKeys.has(question.questionKey);
          return (
            <div key={question.questionKey} className="gq-question">
              <label htmlFor={inputId}>{questionLabel(t, question.questionKey)}</label>
              <Textarea
                id={inputId}
                ref={(element) => registerField(question.questionKey, element)}
                value={answers[question.questionKey] ?? ""}
                onChange={(event) => onChange(question.questionKey, event.target.value)}
                disabled={disabled}
                rows={3}
                aria-invalid={missing || undefined}
                className={cn(
                  "min-h-[88px] resize-y text-[13px]",
                  missing && "border-violet-400 ring-2 ring-violet-100",
                )}
                placeholder={t("internal.placeholder")}
              />
              {missing ? (
                <p className="text-[11px] text-slate-500">{t("internal.missing")}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function InternalContextForm({
  projectId,
  projectLanguage,
  existingInputs,
  onCompleted,
}: {
  projectId: string;
  /** Question labels are persisted in the project language: the AI reads them. */
  projectLanguage: SupportedLanguage;
  existingInputs: ContextInternalInput[];
  onCompleted: () => void;
}) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("context");
  const initialAnswers = useMemo(() => {
    const map: Record<string, string> = {};
    for (const input of existingInputs) map[input.questionKey] = input.answerText;
    return map;
  }, [existingInputs]);

  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [attemptedContinue, setAttemptedContinue] = useState(false);
  const fieldRefs = useRef(new Map<string, HTMLTextAreaElement>());

  const save = useMutation({
    mutationFn: (status: "draft" | "completed") => {
      const projectT = i18n.getFixedT(projectLanguage, "context");
      return clientApi.saveContextInternalInputs(projectId, {
        status,
        answers: INTERNAL_CONTEXT_SECTIONS.flatMap((section) =>
          section.questions.map((question) => ({
            sectionKey: question.sectionKey,
            questionKey: question.questionKey,
            questionLabel: questionLabel(projectT, question.questionKey),
            answerText: answers[question.questionKey] ?? "",
          })),
        ),
      });
    },
    onSuccess: (rows) => {
      queryClient.setQueryData(["context-internal-inputs", projectId], rows);
    },
  });

  const registerField = (questionKey: string, element: HTMLTextAreaElement | null) => {
    if (element) fieldRefs.current.set(questionKey, element);
    else fieldRefs.current.delete(questionKey);
  };

  const answeredCount = ALL_QUESTIONS.filter((question) =>
    isAnswered(answers[question.questionKey]),
  ).length;
  const missingQuestions = ALL_QUESTIONS.filter(
    (question) => !isAnswered(answers[question.questionKey]),
  );
  const missingKeys = new Set(attemptedContinue ? missingQuestions.map((q) => q.questionKey) : []);

  const handleSave = async (status: "draft" | "completed") => {
    if (status === "completed" && missingQuestions.length > 0) {
      setAttemptedContinue(true);
      // Keep the step in draft state; persist current work as draft.
      try {
        await save.mutateAsync("draft");
      } catch {
        notify.error(t("internal.saveFailed"));
        return;
      }
      const firstMissing = missingQuestions[0];
      const element = firstMissing ? fieldRefs.current.get(firstMissing.questionKey) : undefined;
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      element?.focus({ preventScroll: true });
      return;
    }
    try {
      await save.mutateAsync(status);
      if (status === "completed") onCompleted();
      else notify.success(t("internal.draftSaved"));
    } catch {
      notify.error(t("internal.saveFailed"));
    }
  };

  return (
    <div className="space-y-4">
      <AiBanner
        title={t("internal.formTitle")}
        description={t("internal.formBody")}
        action={
          <span className={cn("gq-badge", answeredCount === TOTAL_QUESTIONS && "is-valid")}>
            {t("internal.answered", { answered: answeredCount, total: TOTAL_QUESTIONS })}
          </span>
        }
      />

      {attemptedContinue && missingQuestions.length > 0 ? (
        <p role="alert" className="text-[12.5px] text-slate-500">
          {t("internal.completeMissing")}
        </p>
      ) : null}

      {INTERNAL_CONTEXT_SECTIONS.map((section) => (
        <SectionCard
          key={section.key}
          section={section}
          answers={answers}
          missingKeys={missingKeys}
          registerField={registerField}
          disabled={save.isPending}
          onChange={(questionKey, value) =>
            setAnswers((current) => ({ ...current, [questionKey]: value }))
          }
        />
      ))}

      <div className="gq-footer">
        <div>
          <h4>{t("internal.readyTitle")}</h4>
          <p>{t("internal.readyBody")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <GqButton disabled={save.isPending} onClick={() => void handleSave("draft")}>
            {t("internal.saveDraft")}
          </GqButton>
          <GqButton
            variant="primary"
            disabled={save.isPending}
            onClick={() => void handleSave("completed")}
          >
            {t("continue", { ns: "common" })}
          </GqButton>
        </div>
      </div>
    </div>
  );
}

/** "Thème : réponse" pills, the declared facts the analysis starts from. */
const FACT_LENGTH = 48;

function factSnippet(answer: string): string {
  const text = answer.trim().replace(/\s+/g, " ");
  return text.length > FACT_LENGTH ? `${text.slice(0, FACT_LENGTH).trimEnd()}…` : text;
}

/** The declared fact an internal issue was deduced from ("Fait utilisé"). */
function usedFact(issue: ContextIssue): string | null {
  const fact =
    issue.evidence.find((item) => item.sourceType === "declared_fact") ??
    issue.evidence.find((item) => item.excerpt);
  return fact?.excerpt ?? null;
}

function isRetained(issue: ContextIssue): boolean {
  return issue.reviewStatus === "VALIDATED" || issue.reviewStatus === "MODIFIED";
}

/**
 * Tab 1 once the questions are answered, as in the template: the Assistant QHSE
 * turns the declared internal context into forces and faiblesses, each tied to
 * the fact it comes from, and the user validates the ones that feed the synthesis.
 */
export function InternalIssuesView({
  inputs,
  issues,
  isRunning,
  isSaving,
  errorMessage,
  onGenerate,
  onToggleValidated,
  onEdit,
  onEditAnswers,
  onContinue,
}: {
  inputs: ContextInternalInput[];
  issues: ContextIssue[];
  isRunning: boolean;
  isSaving: boolean;
  errorMessage: string | null;
  onGenerate: () => void;
  onToggleValidated: (issue: ContextIssue) => void;
  onEdit: (input: IssueEditInput) => void;
  onEditAnswers: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation("context");
  const [editing, setEditing] = useState<ContextIssue | null>(null);
  const answers = new Map(inputs.map((input) => [input.questionKey, input.answerText]));
  const facts = ALL_QUESTIONS.filter((question) => isAnswered(answers.get(question.questionKey)));
  const generated = issues.length > 0;
  const validated = issues.filter(isRetained).length;

  return (
    <div className="space-y-4">
      <AiBanner
        title={t("internal.assistantTitle")}
        description={t("internal.assistantBody")}
        action={
          <GqButton variant="primary" disabled={isRunning} onClick={onGenerate}>
            {isRunning
              ? t("internal.generating")
              : generated
                ? t("internal.regenerate")
                : t("internal.generate")}
          </GqButton>
        }
      />

      <section className="gq-card">
        <div className="gq-row">
          <div>
            <h3>{t("internal.declaredTitle")}</h3>
            <p className="gq-lead">{t("internal.declaredBody")}</p>
          </div>
          <GqButton variant="ghost" size="sm" onClick={onEditAnswers}>
            {t("internal.editAnswers")}
          </GqButton>
        </div>
        <div className="gq-pills mt-3">
          {facts.map((question) => (
            <span key={question.questionKey} className="gq-pill">
              ✓ {questionShortLabel(t, question.questionKey)} :{" "}
              {factSnippet(answers.get(question.questionKey) ?? "")}
            </span>
          ))}
        </div>
      </section>

      {isRunning ? (
        <ProcessingState
          title={t("internal.generating")}
          description={t("internal.generatingBody")}
        />
      ) : null}

      {errorMessage && !isRunning ? (
        <ErrorState title={t("internal.failed")} description={errorMessage} onRetry={onGenerate} />
      ) : null}

      {generated && !isRunning ? (
        <>
          <ResultsHead
            title={t("internal.resultsTitle")}
            description={t("internal.resultsBody", { count: issues.length })}
            badge={<span className="gq-badge is-valid">{t("internal.aiDone")}</span>}
          />
          <div className="gq-issue-grid">
            {issues.map((issue) => {
              const fact = usedFact(issue);
              const retained = isRetained(issue);
              return (
                <article key={issue.id} className={cn("gq-issue-card", retained && "is-validated")}>
                  <div className="gq-issue-tags">
                    <span
                      className={cn(
                        "gq-type",
                        issue.nature === "force" ? "is-strength" : "is-weak",
                      )}
                    >
                      {issue.nature === "force"
                        ? t("issues.nature.force")
                        : t("issues.nature.faiblesse")}
                    </span>
                  </div>
                  <h4>{issue.title}</h4>
                  {issue.description ? <p>{issue.description}</p> : null}
                  {fact ? (
                    <div className="gq-evidence">{t("internal.factUsed", { fact })}</div>
                  ) : null}
                  <div className="gq-issue-actions">
                    <GqButton size="sm" disabled={isSaving} onClick={() => setEditing(issue)}>
                      {t("internal.edit")}
                    </GqButton>
                    <GqButton
                      size="sm"
                      variant={retained ? "secondary" : "primary"}
                      disabled={isSaving}
                      onClick={() => onToggleValidated(issue)}
                    >
                      {retained ? t("internal.validated") : t("internal.validate")}
                    </GqButton>
                  </div>
                </article>
              );
            })}
          </div>
          <FooterCard
            title={t("internal.validatedCount", { validated, total: issues.length })}
            description={t("internal.validatedCountBody")}
            action={
              <GqButton variant="primary" onClick={onContinue}>
                {t("internal.toExternal")}
              </GqButton>
            }
          />
        </>
      ) : null}

      {!generated && !isRunning && !errorMessage ? (
        <EmptyState
          title={t("internal.placeholderTitle")}
          description={t("internal.placeholderBody")}
        />
      ) : null}

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
