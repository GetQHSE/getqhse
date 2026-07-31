import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  checklistIsComplete,
  publicationChecklist,
} from "./index.js";

describe("document lifecycle", () => {
  it("allows only centralized transitions", () => {
    expect(canTransition("uploaded", "processing")).toBe(true);
    expect(canTransition("uploaded", "published")).toBe(false);
    expect(() => assertTransition("published", "validated")).toThrow("Invalid document transition");
  });

  it("keeps published content immutable except for archival", () => {
    expect(canTransition("published", "archived")).toBe(true);
    expect(canTransition("published", "processing")).toBe(false);
    expect(canTransition("archived", "published")).toBe(false);
  });

  it("blocks publication for unresolved blocking issues", () => {
    const checklist = publicationChecklist({
      metadataValidated: true,
      filesVerified: true,
      extractionCompleted: true,
      ocrRequired: false,
      ocrReviewed: false,
      structureValidated: true,
      classificationApproved: true,
      relationshipConfirmed: true,
      blockingIssueCount: 1,
    });
    expect(checklistIsComplete(checklist)).toBe(false);
  });
});
