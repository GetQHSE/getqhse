import { describe, expect, it } from "vitest";

import ar from "./ar/index.js";
import en from "./en/index.js";
import fr from "./fr/index.js";

const ARABIC_ONLY_PLURALS = /_(zero|two|few|many)$/;

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]!).sort();
}

function leaves(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leaves(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("translation catalogs", () => {
  const source = keys(fr).sort();

  it("gives English exactly the French keys", () => {
    expect(keys(en).sort()).toEqual(source);
  });

  it("gives Arabic the French keys, plus its extra plural forms only", () => {
    const arabic = keys(ar);
    expect(arabic.filter((key) => !ARABIC_ONLY_PLURALS.test(key)).sort()).toEqual(source);
  });

  it("keeps the same interpolation placeholders in every language", () => {
    const french = new Map(leaves(fr));
    for (const [language, catalog] of [
      ["en", en],
      ["ar", ar],
    ] as const) {
      for (const [key, text] of leaves(catalog)) {
        const sourceKey = key.replace(ARABIC_ONLY_PLURALS, "_other");
        const reference = french.get(sourceKey);
        if (reference === undefined) continue;
        const expected = placeholders(reference).filter(
          // Arabic spells out one and two ("مشروعان") rather than printing the count.
          (name) => !(name === "count" && language === "ar"),
        );
        expect(
          placeholders(text).filter((name) => expected.includes(name)),
          key,
        ).toEqual(expected);
      }
    }
  });
});
