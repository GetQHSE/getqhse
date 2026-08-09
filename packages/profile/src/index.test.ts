import { describe, expect, it } from "vitest";

import {
  calculateProfileCompletion,
  getNextProfileQuestion,
  parseProfileToolAnswer,
  profileFieldKeys,
  profileQuestionByKey,
  profileQuestions,
  validateProfileFieldValue,
} from "./index.js";

describe("project profile catalog", () => {
  it("contains all 32 workbook questions plus the optional logo", () => {
    expect(profileQuestions).toHaveLength(33);
    expect(profileQuestions.filter(({ required }) => required)).toHaveLength(32);
    expect(new Set(profileFieldKeys).size).toBe(profileFieldKeys.length);
    expect(profileQuestions.every(({ prompt }) => Boolean(prompt.ar))).toBe(true);
  });

  it("validates field-specific structured values", () => {
    expect(validateProfileFieldValue("organization.employeeCount", 42).success).toBe(true);
    expect(validateProfileFieldValue("organization.employeeCount", "42").success).toBe(false);
    expect(
      validateProfileFieldValue("operations.externalProviders", {
        usesExternalProviders: true,
        providers: [],
      }).success,
    ).toBe(false);
  });

  it("only allows not-applicable where the catalog explicitly permits it", () => {
    expect(profileQuestionByKey.get("project.logoUrl")?.allowNotApplicable).toBe(true);
    expect(profileQuestionByKey.get("organization.mission")?.allowNotApplicable).toBe(false);
  });

  it("computes deterministic completeness and the next missing question", () => {
    const fields = [
      { key: "project.name" as const, value: "Atlas", status: "CONFIRMED" as const },
      {
        key: "organization.mission" as const,
        value: "Fabriquer des composants fiables",
        status: "ANSWERED" as const,
      },
    ];
    const completion = calculateProfileCompletion(fields);
    expect(completion.answeredRequired).toBe(2);
    expect(completion.totalRequired).toBe(32);
    expect(getNextProfileQuestion(fields)?.key).toBe("organization.offerings");
  });

  it("parses and validates JSON values produced by the profile tool", () => {
    expect(
      parseProfileToolAnswer({
        key: "scope.operatingCountries",
        valueJson: '["MA","FR"]',
        confidence: 0.98,
      }),
    ).toMatchObject({ success: true, value: ["MA", "FR"] });
    expect(
      parseProfileToolAnswer({
        key: "scope.operatingCountries",
        valueJson: "not-json",
        confidence: 1,
      }),
    ).toMatchObject({ success: false });
  });
});
