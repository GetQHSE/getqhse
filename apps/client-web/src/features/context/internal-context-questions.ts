/**
 * Internal-context collection questionnaire.
 *
 * Keys are stable identifiers persisted in `context_internal_inputs`
 * (UNIQUE(project_id, question_key)). Labels are stored alongside answers so
 * a later methodology change never breaks traceability of existing rows; they
 * are stored in the project language (the AI reads them), while the form shows
 * them in the interface language. Texts live in the `context:questions` catalog.
 */
import type { TFunction } from "i18next";

export type InternalContextSectionKey =
  "culture_valeurs" | "ressources_competences" | "gouvernance_processus";

export type InternalContextQuestionKey =
  | "cv_climat_social"
  | "cv_reaction_changement"
  | "cv_valeurs"
  | "rc_expertise"
  | "rc_competences_manquantes"
  | "rc_equipements"
  | "rc_ressources_critiques"
  | "gp_efficacite"
  | "gp_communication"
  | "gp_decisions"
  | "gp_processus";

export interface InternalContextQuestion {
  sectionKey: InternalContextSectionKey;
  questionKey: InternalContextQuestionKey;
}

export interface InternalContextSection {
  key: InternalContextSectionKey;
  questions: InternalContextQuestion[];
}

const section = (
  key: InternalContextSectionKey,
  questionKeys: InternalContextQuestionKey[],
): InternalContextSection => ({
  key,
  questions: questionKeys.map((questionKey) => ({ sectionKey: key, questionKey })),
});

export const INTERNAL_CONTEXT_SECTIONS: InternalContextSection[] = [
  section("culture_valeurs", ["cv_climat_social", "cv_reaction_changement", "cv_valeurs"]),
  section("ressources_competences", [
    "rc_expertise",
    "rc_competences_manquantes",
    "rc_equipements",
    "rc_ressources_critiques",
  ]),
  section("gouvernance_processus", [
    "gp_efficacite",
    "gp_communication",
    "gp_decisions",
    "gp_processus",
  ]),
];

export function sectionTitle(t: TFunction<"context">, key: InternalContextSectionKey): string {
  return t(`questions.${key}.title`);
}

export function sectionHelper(t: TFunction<"context">, key: InternalContextSectionKey): string {
  return t(`questions.${key}.helper`);
}

export function questionLabel(t: TFunction<"context">, key: InternalContextQuestionKey): string {
  return t(`questions.${key}`);
}
