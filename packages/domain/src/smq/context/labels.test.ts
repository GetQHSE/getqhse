import { describe, expect, it } from "vitest";

import { evidenceSourceLabel, groupCorrections, hasAnalysisCorrection } from "./labels.js";

describe("evidence source label", () => {
  it("labels a known source", () => {
    expect(evidenceSourceLabel("regulatory_item")).toBe("Veille réglementaire");
    expect(evidenceSourceLabel("external_factor")).toBe("Analyse externe");
  });

  it("degrades gracefully for an unknown source", () => {
    expect(evidenceSourceLabel("some_new_source")).toBe("Some new source");
  });
});

describe("audit grouping", () => {
  const base = {
    id: "c1",
    fieldName: "title",
    previousValue: "old",
    newValue: "new",
    correctionReason: "clarification",
    createdAt: "2026-09-20T10:00:00.000Z",
  };

  it("groups corrections from one action, by second and reason, into one event", () => {
    const events = groupCorrections([
      base,
      { ...base, id: "c2", fieldName: "description", createdAt: "2026-09-20T10:00:00.500Z" },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]!.details).toContain("Description modifiée");
  });

  it("keeps corrections from a different second as separate events", () => {
    const events = groupCorrections([
      base,
      { ...base, id: "c2", createdAt: "2026-09-20T10:00:05.000Z" },
    ]);
    expect(events).toHaveLength(2);
  });

  it("prioritizes the review-status label over a plain field label", () => {
    const events = groupCorrections([
      { ...base, fieldName: "review_status", previousValue: "pending", newValue: "validated" },
    ]);
    expect(events[0]!.label).toBe("Enjeu validé par la revue humaine");
  });

  it("labels a priority toggle distinctly from an analysis edit", () => {
    const marked = groupCorrections([
      { ...base, fieldName: "user_selected_priority", previousValue: false, newValue: true },
    ]);
    expect(marked[0]!.label).toBe("Enjeu marqué prioritaire");

    const removed = groupCorrections([
      { ...base, fieldName: "user_selected_priority", previousValue: true, newValue: false },
    ]);
    expect(removed[0]!.label).toBe("Priorité retirée");
  });

  it("orders events most recent first", () => {
    const events = groupCorrections([
      { ...base, id: "old", createdAt: "2026-09-20T09:00:00.000Z" },
      { ...base, id: "new", createdAt: "2026-09-20T11:00:00.000Z", fieldName: "description" },
    ]);
    expect(events.map((event) => event.id)).toEqual(["new", "old"]);
  });

  it("carries the correction reason onto the event", () => {
    const events = groupCorrections([base]);
    expect(events[0]!.reason).toBe("clarification");
  });
});

describe("hasAnalysisCorrection", () => {
  it("is true only when the analysis itself changed, not just its review state", () => {
    expect(hasAnalysisCorrection([{ ...base(), fieldName: "title" }])).toBe(true);
    expect(hasAnalysisCorrection([{ ...base(), fieldName: "review_status" }])).toBe(false);
    expect(hasAnalysisCorrection([{ ...base(), fieldName: "user_selected_priority" }])).toBe(false);
  });

  function base() {
    return {
      id: "c1",
      fieldName: "title",
      previousValue: null,
      newValue: null,
      correctionReason: null,
      createdAt: "2026-09-20T10:00:00.000Z",
    };
  }
});

describe("localized labels", () => {
  const correction = {
    id: "c1",
    fieldName: "review_status",
    previousValue: "pending",
    newValue: "validated",
    correctionReason: null,
    createdAt: "2026-09-20T10:00:00.000Z",
  };

  it("labels evidence sources and audit events in English and Arabic", () => {
    expect(evidenceSourceLabel("regulatory_item", "en")).toBe("Regulatory watch");
    expect(evidenceSourceLabel("regulatory_item", "ar")).toBe("اليقظة التنظيمية");
    expect(groupCorrections([correction], "en")[0]!.label).toBe("Issue validated by human review");
    expect(groupCorrections([correction], "ar")[0]!.label).toBe(
      "تم اعتماد الرهان بعد المراجعة البشرية",
    );
  });

  it("keeps the priority detail logic language-independent", () => {
    const events = groupCorrections(
      [
        { ...correction, fieldName: "title", previousValue: "a", newValue: "b" },
        { ...correction, id: "c2", fieldName: "user_selected_priority", newValue: true },
      ],
      "en",
    );
    expect(events[0]!.label).toBe("Title changed");
    expect(events[0]!.details).toEqual(["Marked as priority"]);
  });
});
