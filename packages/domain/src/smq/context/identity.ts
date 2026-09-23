/**
 * Stable cross-run identity helpers for the "Analyse des enjeux" module.
 *
 * A canonical key is a normalized representation of the underlying business
 * concept, deliberately independent from wording AND from the category (which
 * may be revised by a QHSE expert without changing the issue itself).
 *
 * Fingerprints are computed once, at insert time, and are never recomputed in
 * place for historical rows: a methodology change creates new runs, it does
 * not rewrite past identities.
 */

import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";

const STOP_WORDS = new Set([
  "le",
  "la",
  "les",
  "un",
  "une",
  "des",
  "du",
  "de",
  "d",
  "et",
  "ou",
  "au",
  "aux",
  "en",
  "dans",
  "sur",
  "pour",
  "par",
  "avec",
  "sans",
  "the",
  "a",
  "an",
  "of",
  "to",
  "for",
  "and",
  "or",
  "في",
  "من",
  "على",
  "الى",
  "عن",
  "مع",
]);

/**
 * Arabic harakat, superscript alef and tatweel carry no concept meaning. NFD
 * already splits hamza/madda off alef, so they are stripped here too.
 */
const ARABIC_MARKS = /[\u064B-\u065F\u0670\u0640]/g;
/** Keeps Latin behaviour byte-identical and adds the Arabic letters and digits. */
const NON_WORD = /[^a-z0-9\u0621-\u064A\u0660-\u0669]+/g;

/** Normalizes free text into a stable concept key (accent/case/word-order safe). */
export function canonicalKey(...parts: (string | null | undefined)[]): string {
  const words = parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(ARABIC_MARKS, "")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(NON_WORD, " ")
    .trim()
    .split(" ")
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

  const unique = Array.from(new Set(words)).sort();
  return unique.slice(0, 14).join("-");
}

/**
 * Fingerprints are computed server-side at insert time only. The digest stays
 * sha256-hex so identities remain byte-identical to those already persisted.
 */
async function sha256(value: string): Promise<string> {
  const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** sha256(project_id | ai_origin | canonical_key) — category is NOT part of identity. */
export function issueFingerprint(projectId: string, origin: string, key: string): Promise<string> {
  return sha256([projectId, origin, key].join("|"));
}

/** sha256(project_id | category_key | canonical_key) for external factors. */
export function factorFingerprint(
  projectId: string,
  categoryKey: string,
  key: string,
): Promise<string> {
  return sha256([projectId, categoryKey, key].join("|"));
}
