import { describe, expect, it } from "vitest";
import { smqScope } from "@qhse/domain";
import type { ScopeMaterial } from "@qhse/contracts";
import { validateScopeGeneration } from "./scope-statement.processor.js";
const material: ScopeMaterial = {
  facts: {
    projectName: "Atlas",
    organizationName: "Atlas Group",
    standard: "ISO_9001",
    language: "en",
    projectActivities: ["Repair"],
    profile: [],
    issues: [],
    parties: [],
    requirements: [],
    risks: [],
  },
  declaration: {
    ...smqScope.emptyDeclaration(),
    activitiesInclusion: "all",
    activities: "Repair",
    productsInclusion: "all",
    products: "Repair services",
    sitesCoverage: "all",
    sites: [{ name: "Workshop", address: "10 Main Street", type: "" }],
    designDeclaration: "customer_specifications",
    thirdPartyProperty: "no",
  },
  fingerprint: "fp",
  verification: {
    id: "v",
    fingerprint: "fp",
    applicability: "applicable",
    justification: "Professional design responsibilities assessment",
    acknowledgedFindings: [],
    authorId: "u",
    reviewedAt: "2026-10-01T12:00:00Z",
  },
};
const statement =
  "The QMS scope of Atlas, defined with reference to ISO 9001, covers repair services at Workshop, 10 Main Street.";
describe("Scope generation boundary", () => {
  it("requires every declared site address", () =>
    expect(() =>
      validateScopeGeneration(
        { statement: statement.replace("10 Main Street", "a declared address"), nonApplicable: [] },
        material,
      ),
    ).toThrow("SCOPE_SITE_MISSING"));
  it("rejects invented ISO exclusions", () =>
    expect(() =>
      validateScopeGeneration(
        {
          statement,
          nonApplicable: [
            { clause: "8.3", justification: "AI decision that has no professional confirmation" },
          ],
        },
        material,
      ),
    ).toThrow("SCOPE_STATEMENT_INVALID"));
  it("accepts neutral scope wording with the reviewed applicability decision", () =>
    expect(() =>
      validateScopeGeneration({ statement, nonApplicable: [] }, material),
    ).not.toThrow());
});
