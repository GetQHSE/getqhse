/**
 * Step 1 — contexte interne déclaré. Same form, same draft/"Continuer" flow
 * and same results view as the foundation: answers are the organisation's
 * declarations, never AI-generated.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ContextInternalInput, SupportedLanguage } from "@qhse/contracts";
import { Textarea } from "@qhse/ui/components/textarea";
import { cn } from "@qhse/ui/lib/utils";

import { clientApi } from "../../app/client-api.js";
import { useFormat } from "../../app/format.js";
import { i18n } from "../../app/i18n.js";
import { AiBanner, GqButton, notify } from "./context-ui.js";
import {
  INTERNAL_CONTEXT_SECTIONS,
  questionLabel,
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

export function InternalContextResults({
  inputs,
  onEdit,
  onContinue,
}: {
  inputs: ContextInternalInput[];
  onEdit: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation("context");
  const format = useFormat();
  const byQuestion = new Map(inputs.map((input) => [input.questionKey, input]));
  const lastUpdate = inputs
    .map((input) => input.updatedAt)
    .sort()
    .at(-1);

  return (
    <div className="space-y-4">
      <AiBanner
        title={t("internal.savedTitle")}
        description={
          lastUpdate
            ? t("internal.savedBodyDated", { date: format.date(lastUpdate) })
            : t("internal.savedBody")
        }
        action={<GqButton onClick={onEdit}>{t("internal.editAnswers")}</GqButton>}
      />

      {INTERNAL_CONTEXT_SECTIONS.map((section) => (
        <section key={section.key} className="gq-card">
          <h3>{sectionTitle(t, section.key)}</h3>
          <dl className="mt-2">
            {section.questions.map((question) => (
              <div key={question.questionKey} className="gq-question">
                <dt className="text-[12px] text-slate-500">
                  {questionLabel(t, question.questionKey)}
                </dt>
                <dd className="gq-answer m-0">
                  {byQuestion.get(question.questionKey)?.answerText?.trim() ||
                    t("internal.notProvided")}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <FooterContinue onContinue={onContinue} />
    </div>
  );
}

function FooterContinue({ onContinue }: { onContinue: () => void }) {
  const { t } = useTranslation("context");
  return (
    <div className="gq-footer">
      <div>
        <h4>{t("internal.validatedTitle")}</h4>
        <p>{t("internal.validatedBody")}</p>
      </div>
      <GqButton variant="primary" onClick={onContinue}>
        {t("internal.toExternal")}
      </GqButton>
    </div>
  );
}

/** Informational placeholder only — no upload behaviour yet. */
export function SupportingDocumentsCard() {
  const { t } = useTranslation("context");
  return (
    <section className="gq-card mt-4">
      <div className="gq-row">
        <div>
          <h3>{t("internal.documentsTitle")}</h3>
          <p className="gq-lead">{t("internal.documentsBody")}</p>
        </div>
        <span className="gq-badge">{t("internal.documentsSoon")}</span>
      </div>
    </section>
  );
}
