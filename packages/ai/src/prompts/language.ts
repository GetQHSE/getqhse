/**
 * Output language of project-scoped generations. Mirrors `SupportedLanguage`
 * from `@qhse/contracts`: every AI text produced for a project is written in
 * the project's language, while enum values and keys stay the fixed (French)
 * identifiers the schemas require.
 */
export type OutputLanguage = "fr" | "en" | "ar";

const NAMES_IN_FRENCH: Record<OutputLanguage, string> = {
  fr: "français",
  en: "anglais",
  ar: "arabe standard moderne",
};

const NAMES_IN_ENGLISH: Record<OutputLanguage, string> = {
  fr: "professional French",
  en: "professional English",
  ar: "clear Modern Standard Arabic",
};

export function toOutputLanguage(value: unknown): OutputLanguage {
  return value === "en" || value === "ar" ? value : "fr";
}

/** "en français" / "en anglais" / "en arabe standard moderne" — for French prompts. */
export function inLanguage(language: OutputLanguage): string {
  return `en ${NAMES_IN_FRENCH[language]}`;
}

/** The output-language rule appended to French-written system prompts. */
export function outputLanguageRule(language: OutputLanguage): string {
  const rule = `LANGUE DE SORTIE : rédige TOUS les champs textuels libres ${inLanguage(language)}.`;
  if (language === "fr") return rule;
  return `${rule} Les valeurs d'énumération, clés et libellés imposés par le schéma restent EXACTEMENT tels qu'indiqués (identifiants français), sans traduction. Les extraits de textes réglementaires cités restent dans leur langue d'origine.`;
}

/** The output-language rule for English-written system prompts. */
export function outputLanguageRuleEn(language: OutputLanguage): string {
  return `Reply in ${NAMES_IN_ENGLISH[language]} unless the user writes in another language.`;
}

/**
 * Project language recorded in a profile snapshot (`data.project.language`).
 * Snapshots taken before i18n carry none: those projects are all French.
 */
export function snapshotLanguage(snapshotData: unknown): OutputLanguage {
  const project = (snapshotData as { project?: { language?: unknown } } | null)?.project;
  return toOutputLanguage(project?.language);
}
