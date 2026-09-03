/**
 * Replays captured extractor output through segmentation and grades the result.
 *
 * The fixtures hold block sequences rather than PDFs, so this runs in CI with no Docling
 * container, no model weights and no OCR pass -- it measures the segmenter, which is the part
 * that changes. Re-capture a fixture with `pnpm eval:extraction:capture` when the extractor's
 * own behaviour changes, and expect the diff to be reviewed rather than rubber-stamped.
 *
 * The strongest assertion here is contiguous numbering. Articles are consecutive by
 * construction, so a gap is not a matter of taste: it is a boundary the segmenter failed to
 * find, and no amount of plausible-looking output makes up for it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  assessStructureQuality,
  detectNormativeProvisionsFromBlocks,
  STRUCTURE_REVIEW_THRESHOLD,
  type ExtractedBlock,
  type NormativeLanguage,
} from "@qhse/knowledge";

type Fixture = {
  name: string;
  source: string;
  redacted: boolean;
  capturedFrom: Record<string, string>;
  blocks: ExtractedBlock[];
};

type SpotCheck = {
  why: string;
  identifier: string;
  titleContains?: string;
  contentContains?: string;
  headingPathStartsWith?: string;
};

type Expectation = {
  name: string;
  language: NormativeLanguage;
  notes?: string;
  /** A fixture that must score badly. The gate is only worth having if it refuses something. */
  expectDegraded?: boolean;
  minStructureScore?: number;
  maxStructureScore?: number;
  expectedConcern?: string;
  maxFragments: number;
  contiguousNumbering?: { from: number; to: number };
  requiredIdentifiers: string[];
  spotChecks?: SpotCheck[];
};

const directory = new URL("fixtures/", import.meta.url);
const read = <T>(file: string): T =>
  JSON.parse(readFileSync(new URL(file, directory), "utf8")) as T;

const names = readdirSync(directory)
  .filter((file) => file.endsWith(".expected.json"))
  .map((file) => file.replace(".expected.json", ""))
  .sort();

describe.each(names)("document extraction: %s", (name) => {
  const expected = read<Expectation>(`${name}.expected.json`);
  const fixture = read<Fixture>(`${name}.blocks.json`);
  const provisions = detectNormativeProvisionsFromBlocks(fixture.blocks, expected.language);
  const quality = assessStructureQuality(fixture.blocks, provisions);
  const byIdentifier = new Map(
    provisions.flatMap((provision) =>
      provision.sourceIdentifier ? [[provision.sourceIdentifier, provision] as const] : [],
    ),
  );

  it("segments every identifier the source is known to contain", () => {
    const missing = expected.requiredIdentifiers.filter(
      (identifier) => !byIdentifier.has(identifier),
    );
    expect(missing, `identifiers absent from ${fixture.source}`).toEqual([]);
  });

  if (expected.contiguousNumbering) {
    const { from, to } = expected.contiguousNumbering;
    it(`numbers ${from} through ${to} without a gap`, () => {
      expect(quality.signals.missingNumbers).toEqual([]);
      expect(quality.signals.duplicateIdentifiers).toEqual([]);
    });
  }

  it("leaves no provision truncated to its own heading", () => {
    expect(quality.signals.fragments).toBeLessThanOrEqual(expected.maxFragments);
  });

  if (expected.minStructureScore !== undefined) {
    it("scores above the quality floor recorded for this source", () => {
      expect(quality.score, quality.concerns.join(" | ")).toBeGreaterThanOrEqual(
        expected.minStructureScore ?? 0,
      );
    });
  }

  if (expected.expectDegraded) {
    it("is refused by the quality gate", () => {
      // A gate that has never rejected anything is not a gate. This fixture is the proof that
      // the signals still fire on a document whose layout is perfect and whose text is not
      // language -- the case every structural check passes.
      expect(quality.score).toBeLessThanOrEqual(expected.maxStructureScore ?? 0.5);
      expect(quality.score).toBeLessThan(STRUCTURE_REVIEW_THRESHOLD);
      if (expected.expectedConcern)
        expect(quality.concerns.join(" | ")).toContain(expected.expectedConcern);
    });
  }

  for (const check of expected.spotChecks ?? []) {
    it(`keeps ${check.identifier} intact: ${check.why}`, () => {
      const provision = byIdentifier.get(check.identifier);
      expect(provision, `${check.identifier} was not segmented`).toBeDefined();
      if (check.titleContains) expect(provision?.title ?? "").toContain(check.titleContains);
      if (check.contentContains) expect(provision?.content).toContain(check.contentContains);
      if (check.headingPathStartsWith)
        expect(provision?.headingPath[0]).toBe(check.headingPathStartsWith);
    });
  }
});
