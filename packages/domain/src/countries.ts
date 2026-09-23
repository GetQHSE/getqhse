/**
 * Countries a project operates in. The profile's `scope.operatingCountries`
 * (ISO 3166-1 alpha-2 codes) is the source of truth; the project's own
 * country is the fallback and stays the "home" country, listed first.
 */

import { INTL_LOCALES, type Language } from "./language.js";

const COUNTRY_CODE = /^[A-Z]{2}$/;

const TIMEZONES: Record<string, string> = {
  MA: "Africa/Casablanca",
  FR: "Europe/Paris",
  DZ: "Africa/Algiers",
  TN: "Africa/Tunis",
  SN: "Africa/Dakar",
  CI: "Africa/Abidjan",
};

export function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return COUNTRY_CODE.test(code) ? code : null;
}

/**
 * Codes from a profile snapshot (`{ project?: { countryCode }, fields?: {...} }`)
 * or plain profile fields, deduplicated, home country first.
 */
export function projectCountryCodes(
  profileData: unknown,
  fallbackCountryCode?: string | null,
): string[] {
  const data = (profileData ?? {}) as {
    project?: { countryCode?: unknown };
    fields?: Record<string, unknown>;
  } & Record<string, unknown>;
  const fields = data.fields ?? data;
  const declared = Array.isArray(fields["scope.operatingCountries"])
    ? (fields["scope.operatingCountries"] as unknown[])
    : [];
  const home =
    normalizeCountryCode(fallbackCountryCode) ?? normalizeCountryCode(data.project?.countryCode);
  const codes = [home, ...declared.map(normalizeCountryCode)].filter(
    (code): code is string => code !== null,
  );
  return [...new Set(codes)];
}

export function countryName(code: string, language: Language = "fr"): string {
  try {
    return new Intl.DisplayNames([language], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** "Maroc (MA), France (FR)" — for prompts and labels. */
export function describeCountries(codes: readonly string[], language: Language = "fr"): string {
  return codes.map((code) => `${countryName(code, language)} (${code})`).join(", ");
}

export function countryTimezone(code: string): string | undefined {
  return TIMEZONES[code.toUpperCase()];
}

/**
 * Web-search localisation for a project: its single country, or no location
 * at all when it spans several — biasing results toward one country would
 * silently under-search the others.
 */
export function webSearchLocationFor(
  codes: readonly string[],
): { country: string; timezone: string | undefined } | null {
  if (codes.length !== 1) return null;
  const country = codes[0]!;
  return { country, timezone: countryTimezone(country) };
}

/** A project covers at most this many countries (veille, context research). */
export const MAX_PROJECT_COUNTRIES = 5;

/** ISO 3166-1 alpha-2 codes offered in the country selectors. */
export const COUNTRY_CODES = [
  "AD",
  "AE",
  "AF",
  "AG",
  "AL",
  "AM",
  "AO",
  "AR",
  "AT",
  "AU",
  "AZ",
  "BA",
  "BB",
  "BD",
  "BE",
  "BF",
  "BG",
  "BH",
  "BI",
  "BJ",
  "BN",
  "BO",
  "BR",
  "BS",
  "BT",
  "BW",
  "BY",
  "BZ",
  "CA",
  "CD",
  "CF",
  "CG",
  "CH",
  "CI",
  "CL",
  "CM",
  "CN",
  "CO",
  "CR",
  "CU",
  "CV",
  "CY",
  "CZ",
  "DE",
  "DJ",
  "DK",
  "DM",
  "DO",
  "DZ",
  "EC",
  "EE",
  "EG",
  "ER",
  "ES",
  "ET",
  "FI",
  "FJ",
  "FM",
  "FR",
  "GA",
  "GB",
  "GD",
  "GE",
  "GH",
  "GM",
  "GN",
  "GQ",
  "GR",
  "GT",
  "GW",
  "GY",
  "HN",
  "HR",
  "HT",
  "HU",
  "ID",
  "IE",
  "IL",
  "IN",
  "IQ",
  "IR",
  "IS",
  "IT",
  "JM",
  "JO",
  "JP",
  "KE",
  "KG",
  "KH",
  "KI",
  "KM",
  "KN",
  "KP",
  "KR",
  "KW",
  "KZ",
  "LA",
  "LB",
  "LC",
  "LI",
  "LK",
  "LR",
  "LS",
  "LT",
  "LU",
  "LV",
  "LY",
  "MA",
  "MC",
  "MD",
  "ME",
  "MG",
  "MH",
  "MK",
  "ML",
  "MM",
  "MN",
  "MR",
  "MT",
  "MU",
  "MV",
  "MW",
  "MX",
  "MY",
  "MZ",
  "NA",
  "NE",
  "NG",
  "NI",
  "NL",
  "NO",
  "NP",
  "NR",
  "NZ",
  "OM",
  "PA",
  "PE",
  "PG",
  "PH",
  "PK",
  "PL",
  "PS",
  "PT",
  "PW",
  "PY",
  "QA",
  "RO",
  "RS",
  "RU",
  "RW",
  "SA",
  "SB",
  "SC",
  "SD",
  "SE",
  "SG",
  "SI",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SR",
  "SS",
  "ST",
  "SV",
  "SY",
  "SZ",
  "TD",
  "TG",
  "TH",
  "TJ",
  "TL",
  "TM",
  "TN",
  "TO",
  "TR",
  "TT",
  "TV",
  "TW",
  "TZ",
  "UA",
  "UG",
  "US",
  "UY",
  "UZ",
  "VA",
  "VC",
  "VE",
  "VN",
  "VU",
  "WS",
  "YE",
  "ZA",
  "ZM",
  "ZW",
] as const;

/** Countries for a selector, sorted by their name in the given language. */
export function countryOptions(language: Language = "fr"): { code: string; name: string }[] {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code, language) })).sort((a, b) =>
    a.name.localeCompare(b.name, INTL_LOCALES[language]),
  );
}
