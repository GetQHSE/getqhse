import { describe, expect, it } from "vitest";

import {
  PIP_CATEGORIES,
  PIP_METHODOLOGY_VERSION,
  PIP_SCALES,
  computeCriticality,
  criticalityBand,
  powerInterestStrategy,
  provenanceLabel,
} from "./methodology.js";

describe("criticality", () => {
  it("is impact × niveau d'exigence", () => {
    expect(computeCriticality(3, 3)).toBe(9);
    expect(computeCriticality(1, 1)).toBe(1);
  });

  it("returns null when either axis is missing", () => {
    expect(computeCriticality(null, 3)).toBeNull();
    expect(computeCriticality(3, undefined)).toBeNull();
  });

  it("stays inside the declared 1–9 scale for every valid input", () => {
    for (let impact = PIP_SCALES.impact.min; impact <= PIP_SCALES.impact.max; impact += 1) {
      for (
        let level = PIP_SCALES.requirementLevel.min;
        level <= PIP_SCALES.requirementLevel.max;
        level += 1
      ) {
        const value = computeCriticality(impact, level);
        expect(value).toBeGreaterThanOrEqual(PIP_SCALES.criticality.min);
        expect(value).toBeLessThanOrEqual(PIP_SCALES.criticality.max);
      }
    }
  });

  it.each([
    [1, "Faible"],
    [3, "Faible"],
    [4, "Moyenne"],
    [6, "Moyenne"],
    [7, "Élevée"],
    [9, "Élevée"],
  ])("bands %i as %s", (value, label) => {
    expect(criticalityBand(value)?.label).toBe(label);
  });

  it("has no band outside the scale", () => {
    expect(criticalityBand(0)).toBeNull();
    expect(criticalityBand(10)).toBeNull();
    expect(criticalityBand(null)).toBeNull();
  });
});

describe("power/interest strategy", () => {
  it("places a high-power, high-interest party as the key actor", () => {
    expect(powerInterestStrategy(5, 5)).toBe("key_actor");
    expect(powerInterestStrategy(4, 4)).toBe("key_actor");
  });

  it("keeps a powerful but less interested party satisfied", () => {
    expect(powerInterestStrategy(5, 3)).toBe("keep_satisfied");
  });

  it("keeps an interested but less powerful party informed", () => {
    expect(powerInterestStrategy(3, 5)).toBe("keep_informed");
  });

  it("monitors the rest", () => {
    expect(powerInterestStrategy(3, 3)).toBe("monitor");
    expect(powerInterestStrategy(1, 1)).toBe("monitor");
  });

  it("treats 4 as the high threshold on both axes", () => {
    expect(powerInterestStrategy(4, 3)).toBe("keep_satisfied");
    expect(powerInterestStrategy(3, 4)).toBe("keep_informed");
  });

  it("returns null when a coordinate is missing", () => {
    expect(powerInterestStrategy(null, 4)).toBeNull();
    expect(powerInterestStrategy(4, undefined)).toBeNull();
  });
});

describe("catalogue", () => {
  it("pins the methodology version", () => {
    expect(PIP_METHODOLOGY_VERSION).toBe("pip-v1");
  });

  it("has unique category keys", () => {
    const keys = PIP_CATEGORIES.map((category) => category.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("labels a known provenance and degrades gracefully on an unknown one", () => {
    expect(provenanceLabel("regulatory_item")).toBe("Veille réglementaire");
    expect(provenanceLabel("some_new_source")).toBe("Some new source");
  });
});
