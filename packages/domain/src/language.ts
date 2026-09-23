/**
 * Languages the platform speaks. Kept dependency-free here; `@qhse/contracts`
 * validates the same values with `supportedLanguageSchema`.
 */
export type Language = "fr" | "en" | "ar";

export const LANGUAGES: readonly Language[] = ["fr", "en", "ar"];

/** BCP 47 locale used for `Intl` formatting (ar-MA keeps Latin digits). */
export const INTL_LOCALES: Record<Language, string> = {
  fr: "fr-FR",
  en: "en-GB",
  ar: "ar-MA",
};

/** A value per language, with French as the source and fallback. */
export type Localized<T = string> = Record<Language, T>;
