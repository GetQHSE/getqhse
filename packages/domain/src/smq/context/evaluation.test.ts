import { describe, expect, it } from "vitest";

import { issueQualification, qualificationLabel } from "./evaluation.js";

describe("issue qualification", () => {
  it.each([
    [3, 1, "majeur"],
    [3, 2, "significatif"],
    [3, 3, "a_surveiller"],
    [2, 1, "significatif"],
    [2, 2, "a_surveiller"],
    [2, 3, "mineur"],
    [1, 1, "a_surveiller"],
    [1, 2, "mineur"],
    [1, 3, "mineur"],
  ] as const)("qualifies impact %i × maîtrise %i as %s", (impact, mastery, expected) => {
    expect(issueQualification(impact, mastery)).toBe(expected);
  });

  it("never qualifies an issue until both ratings are set", () => {
    expect(issueQualification(undefined, 2)).toBeNull();
    expect(issueQualification(3, null)).toBeNull();
    expect(issueQualification(4, 2)).toBeNull();
    expect(issueQualification("3", 2)).toBeNull();
  });

  it("labels each qualification in the requested language", () => {
    expect(qualificationLabel("a_surveiller")).toBe("À surveiller");
    expect(qualificationLabel("majeur", "en")).toBe("Major");
  });
});
