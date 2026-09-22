/**
 * Step 1 — contexte interne déclaré. Same form, same draft/"Continuer" flow
 * and same results view as the foundation: answers are the organisation's
 * declarations, never AI-generated.
 */
import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2Icon, FileTextIcon, InfoIcon } from "lucide-react";
import type { ContextInternalInput } from "@qhse/contracts";
import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@qhse/ui/components/card";
import { Label } from "@qhse/ui/components/label";
import { Textarea } from "@qhse/ui/components/textarea";
import { cn } from "@qhse/ui/lib/utils";

import { clientApi } from "../../app/client-api.js";
import { notify } from "./context-ui.js";
import {
  INTERNAL_CONTEXT_SECTIONS,
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
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">{section.title}</CardTitle>
        <CardDescription>{section.helper}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {section.questions.map((question) => {
          const inputId = `internal-input-${question.questionKey}`;
          const missing = missingKeys.has(question.questionKey);
          return (
            <div key={question.questionKey} className="space-y-2">
              <Label htmlFor={inputId} className="text-sm font-normal text-foreground">
                {question.label}
              </Label>
              <Textarea
                id={inputId}
                ref={(element) => registerField(question.questionKey, element)}
                value={answers[question.questionKey] ?? ""}
                onChange={(event) => onChange(question.questionKey, event.target.value)}
                disabled={disabled}
                rows={3}
                aria-invalid={missing || undefined}
                className={cn(
                  "min-h-[96px] resize-y",
                  missing && "border-primary/50 ring-1 ring-primary/30",
                )}
                placeholder="Votre réponse, en vos propres mots…"
              />
              {missing ? (
                <p className="text-xs text-muted-foreground">
                  Information à renseigner avant de continuer.
                </p>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function InternalContextForm({
  projectId,
  existingInputs,
  onCompleted,
}: {
  projectId: string;
  existingInputs: ContextInternalInput[];
  onCompleted: () => void;
}) {
  const queryClient = useQueryClient();
  const initialAnswers = useMemo(() => {
    const map: Record<string, string> = {};
    for (const input of existingInputs) map[input.questionKey] = input.answerText;
    return map;
  }, [existingInputs]);

  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [attemptedContinue, setAttemptedContinue] = useState(false);
  const fieldRefs = useRef(new Map<string, HTMLTextAreaElement>());

  const save = useMutation({
    mutationFn: (status: "draft" | "completed") =>
      clientApi.saveContextInternalInputs(projectId, {
        status,
        answers: INTERNAL_CONTEXT_SECTIONS.flatMap((section) =>
          section.questions.map((question) => ({
            sectionKey: question.sectionKey,
            questionKey: question.questionKey,
            questionLabel: question.label,
            answerText: answers[question.questionKey] ?? "",
          })),
        ),
      }),
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
        notify.error("Les informations n'ont pas pu être enregistrées. Réessayez.");
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
      else notify.success("Brouillon enregistré");
    } catch {
      notify.error("Les informations n'ont pas pu être enregistrées. Réessayez.");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-lg">
            Complétez le contexte interne de votre organisation
          </CardTitle>
          <CardDescription>
            GetQhse connaît déjà votre activité, vos objectifs et votre contexte réglementaire.
            Ajoutez maintenant les informations internes que seule votre organisation peut
            connaître.
          </CardDescription>
          <p className="text-xs text-muted-foreground">
            {answeredCount} / {TOTAL_QUESTIONS} informations renseignées
          </p>
        </CardHeader>
      </Card>

      {attemptedContinue && missingQuestions.length > 0 ? (
        <p role="alert" className="text-sm text-muted-foreground">
          Complétez les informations manquantes avant de continuer.
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

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          disabled={save.isPending}
          onClick={() => void handleSave("draft")}
        >
          Enregistrer comme brouillon
        </Button>
        <Button disabled={save.isPending} onClick={() => void handleSave("completed")}>
          Continuer
        </Button>
      </div>
    </div>
  );
}

export function InternalContextResults({
  inputs,
  onEdit,
}: {
  inputs: ContextInternalInput[];
  onEdit: () => void;
}) {
  const byQuestion = new Map(inputs.map((input) => [input.questionKey, input]));
  const lastUpdate = inputs
    .map((input) => input.updatedAt)
    .sort()
    .at(-1);

  return (
    <div className="space-y-6">
      <Card className="shadow-none">
        <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
          <CheckCircle2Icon className="size-8 shrink-0 text-emerald-600" aria-hidden />
          <div className="flex-1 space-y-1">
            <p className="font-medium text-foreground">Contexte interne enregistré</p>
            <p className="text-sm text-muted-foreground">
              Voici vos réponses telles qu’enregistrées
              {lastUpdate
                ? ` (dernière mise à jour le ${new Date(lastUpdate).toLocaleDateString("fr-FR")})`
                : ""}
              .
            </p>
          </div>
          <Button variant="outline" onClick={onEdit}>
            Modifier les réponses
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-lg">Résultats du contexte interne déclaré</CardTitle>
          <CardDescription className="flex items-start gap-2">
            <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Ces éléments sont vos déclarations internes. Ce ne sont pas encore les enjeux finaux :
              ceux-ci seront produits à l’étape 3, après l’analyse externe.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {INTERNAL_CONTEXT_SECTIONS.map((section) => (
            <section key={section.key} className="space-y-3">
              <h3 className="font-medium text-foreground">{section.title}</h3>
              <dl className="space-y-3">
                {section.questions.map((question) => {
                  const record = byQuestion.get(question.questionKey);
                  return (
                    <div key={question.questionKey} className="rounded-lg border border-border p-4">
                      <dt className="text-sm text-muted-foreground">{question.label}</dt>
                      <dd className="mt-1 text-sm whitespace-pre-line text-foreground">
                        {record?.answerText?.trim() || "Non renseigné"}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/** Informational placeholder only — no upload behaviour yet. */
export function SupportingDocumentsCard() {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <FileTextIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="space-y-1.5">
              <CardTitle className="text-base">
                Vous disposez déjà d’informations complémentaires ?
              </CardTitle>
              <CardDescription>
                Rapports d’activité, enquêtes de satisfaction, comptes-rendus de réunions ou autres
                documents pourront enrichir l’analyse.
              </CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0">
            Ajout de documents bientôt disponible
          </Badge>
        </div>
      </CardHeader>
    </Card>
  );
}
