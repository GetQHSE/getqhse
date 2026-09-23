import { supportedLanguages, toSupportedLanguage, type SupportedLanguage } from "@qhse/contracts";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { z } from "zod";

import ar from "../locales/ar/index.js";
import en from "../locales/en/index.js";
import fr from "../locales/fr/index.js";

export const defaultNS = "common";
export const resources = { fr, en, ar } as const;

const STORAGE_KEY = "qhse.interface-language";

/** Native names: a language is always offered in its own script. */
export const languageNames: Record<SupportedLanguage, string> = {
  fr: "Français",
  en: "English",
  ar: "العربية",
};

export function languageDirection(language: SupportedLanguage): "ltr" | "rtl" {
  return language === "ar" ? "rtl" : "ltr";
}

function storedLanguage(): SupportedLanguage | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value ? toSupportedLanguage(value) : null;
  } catch {
    return null;
  }
}

export function rememberLanguage(language: SupportedLanguage): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Storage may be unavailable (private mode); the account preference still applies.
  }
}

/** First paint: cached choice, then the browser, then the deployment default. */
function initialLanguage(): SupportedLanguage {
  const cached = storedLanguage();
  if (cached) return cached;
  const fallback = toSupportedLanguage(import.meta.env["VITE_DEFAULT_LOCALE"]);
  const browser = typeof navigator === "undefined" ? undefined : navigator.language;
  return browser ? toSupportedLanguage(browser, fallback) : fallback;
}

/** Zod's built-in messages (shared contract schemas) follow the interface too. */
const zodLocales = { fr: z.locales.fr, en: z.locales.en, ar: z.locales.ar };

function applyDocumentLanguage(language: string): void {
  const supported = toSupportedLanguage(language);
  document.documentElement.lang = supported;
  document.documentElement.dir = languageDirection(supported);
  z.config(zodLocales[supported]());
}

i18n.on("languageChanged", applyDocumentLanguage);

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  supportedLngs: [...supportedLanguages],
  fallbackLng: "fr",
  defaultNS,
  ns: Object.keys(fr),
  interpolation: { escapeValue: false },
  returnNull: false,
});
applyDocumentLanguage(i18n.language);

export function currentLanguage(): SupportedLanguage {
  return toSupportedLanguage(i18n.resolvedLanguage ?? i18n.language);
}

export { i18n };
