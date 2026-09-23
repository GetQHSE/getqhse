import type { SupportedLanguage } from "@qhse/contracts";
import { INTL_LOCALES } from "@qhse/domain/language";
import { useTranslation } from "react-i18next";

import { currentLanguage } from "./i18n.js";

type DateInput = string | number | Date;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Locale-aware formatters for a given language (UI or project language). */
export function formatters(language: SupportedLanguage) {
  const locale = INTL_LOCALES[language];
  return {
    locale,
    date: (value: DateInput, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) =>
      new Intl.DateTimeFormat(locale, options).format(toDate(value)),
    dateTime: (value: DateInput) =>
      new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
        toDate(value),
      ),
    number: (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale, options).format(value),
    list: (values: string[]) =>
      new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(values),
  };
}

export type Formatters = ReturnType<typeof formatters>;

/** Formatters bound to the current interface language; re-renders on change. */
export function useFormat(): Formatters {
  const { i18n } = useTranslation();
  void i18n.language;
  return formatters(currentLanguage());
}
