import { describe, expect, it } from "vitest";

import { canonicalKey, factorFingerprint, issueFingerprint } from "./identity.js";
import {
  DEFAULT_ANALYSIS_METHOD,
  HISTORICAL_METHOD_LABEL,
  PESTEL_DIMENSIONS,
  PESTEL_DIMENSION_ENUM,
  analysisMethodLabel,
  pestelDimensions,
  swotQuadrants,
  isAnalysisMethod,
  pestelDimensionKey,
} from "./method.js";

describe("analysis method", () => {
  it("defaults to SWOT", () => {
    expect(DEFAULT_ANALYSIS_METHOD).toBe("swot");
  });

  it("labels a run persisted before the method choice existed", () => {
    expect(analysisMethodLabel(null)).toBe(HISTORICAL_METHOD_LABEL);
    expect(analysisMethodLabel("unknown")).toBe(HISTORICAL_METHOD_LABEL);
  });

  it("rejects anything that is not a known method", () => {
    expect(isAnalysisMethod("swot")).toBe(true);
    expect(isAnalysisMethod("pestel")).toBe(true);
    expect(isAnalysisMethod("SWOT")).toBe(false);
    expect(isAnalysisMethod(null)).toBe(false);
  });

  it("marks the legal dimension as reusing the regulatory watch, never re-searched", () => {
    const legal = PESTEL_DIMENSIONS.find((dimension) => dimension.key === "legal");
    expect(legal?.reusesRegulatory).toBe(true);
    const others = PESTEL_DIMENSIONS.filter((dimension) => dimension.key !== "legal");
    expect(others.every((dimension) => dimension.reusesRegulatory !== true)).toBe(true);
  });

  it("maps a category onto its PESTEL dimension, accent-insensitively", () => {
    expect(pestelDimensionKey("economique")).toBe("economique");
    expect(pestelDimensionKey(null, "Économique")).toBe("economique");
    expect(pestelDimensionKey("attentes_clients")).toBe("social");
    expect(pestelDimensionKey("reglementaire")).toBe("legal");
  });

  it("falls back to 'autre' for an unmapped category", () => {
    expect(pestelDimensionKey("quelque_chose_dautre")).toBe("autre");
    expect(pestelDimensionKey(null, null)).toBe("autre");
  });
});

describe("canonical issue identity", () => {
  it("is independent of wording order, case and accents", () => {
    expect(canonicalKey("Rotation élevée du personnel")).toBe(
      canonicalKey("PERSONNEL rotation elevee"),
    );
  });

  it("drops stop words and words of two characters or less", () => {
    expect(canonicalKey("la rotation du personnel")).toBe("personnel-rotation");
  });

  it("deduplicates repeated concepts", () => {
    expect(canonicalKey("rotation rotation personnel")).toBe("personnel-rotation");
  });

  it("caps the key at fourteen words", () => {
    const long = Array.from({ length: 20 }, (_, index) => `mot${index}`).join(" ");
    expect(canonicalKey(long).split("-")).toHaveLength(14);
  });

  it("keeps Arabic words and ignores harakat, tatweel and letter variants", () => {
    const key = canonicalKey("ارتفاع دوران الموظفين في الشركة");
    expect(key).not.toBe("");
    expect(key.split("-")).toContain("الموظفين");
    expect(key.split("-")).not.toContain("في");
    expect(canonicalKey("الْمُوَظَّفِين")).toBe(canonicalKey("الموظفين"));
    expect(canonicalKey("المـــوظفين")).toBe(canonicalKey("الموظفين"));
    expect(canonicalKey("إدارة الجودة")).toBe(canonicalKey("ادارة الجوده"));
  });

  it("keeps distinct Arabic concepts apart", () => {
    expect(canonicalKey("نقص الكفاءات التقنية")).not.toBe(canonicalKey("ارتفاع تكاليف الطاقة"));
  });

  it("ignores empty parts", () => {
    expect(canonicalKey("personnel", null, undefined, "  ")).toBe("personnel");
  });

  it("excludes the category from the issue fingerprint", async () => {
    const key = canonicalKey("Rotation élevée du personnel");
    const first = await issueFingerprint("project-1", "ai", key);
    const second = await issueFingerprint("project-1", "ai", key);
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it("separates two projects that share a concept", async () => {
    const key = canonicalKey("Rotation élevée du personnel");
    expect(await issueFingerprint("project-1", "ai", key)).not.toBe(
      await issueFingerprint("project-2", "ai", key),
    );
  });

  it("separates a manual issue from an AI issue with the same wording", async () => {
    const key = canonicalKey("Rotation élevée du personnel");
    expect(await issueFingerprint("project-1", "ai", key)).not.toBe(
      await issueFingerprint("project-1", "manual", key),
    );
  });

  it("keys an external factor by its category, unlike an issue", async () => {
    const key = canonicalKey("Hausse du coût de l’énergie");
    expect(await factorFingerprint("project-1", "economique", key)).not.toBe(
      await factorFingerprint("project-1", "environnemental", key),
    );
  });
});

describe("localized method labels", () => {
  it("translates PESTEL and SWOT labels without changing their keys", () => {
    const en = pestelDimensions("en");
    const ar = pestelDimensions("ar");
    expect(en.map((dimension) => dimension.key)).toEqual(PESTEL_DIMENSIONS.map((d) => d.key));
    expect(en.find((dimension) => dimension.key === "legal")!.label).toBe("Legal");
    expect(ar.find((dimension) => dimension.key === "legal")!.label).toBe("قانوني");
    expect(swotQuadrants("en").map((quadrant) => quadrant.label)).toEqual([
      "Strengths",
      "Weaknesses",
      "Opportunities",
      "Threats",
    ]);
    expect(analysisMethodLabel(null, "en")).toBe("Legacy methodology");
  });

  it("keeps the French PESTEL labels as the stable AI enum", () => {
    expect(PESTEL_DIMENSION_ENUM).toContain("Légal");
  });

  it("maps English and Arabic categories onto PESTEL dimensions", () => {
    expect(pestelDimensionKey("regulatory_changes")).toBe("legal");
    expect(pestelDimensionKey(null, "بيئي")).toBe("environnemental");
  });
});
