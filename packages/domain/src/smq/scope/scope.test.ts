import { describe, expect, it } from "vitest";
import {
  emptyDeclaration,
  missingDeclarations,
  findings,
  designProposal,
  canVerify,
  validStatement,
} from "./index.js";
const declaration = {
  ...emptyDeclaration(),
  activitiesInclusion: "all" as const,
  activities: "Repair",
  productsInclusion: "all" as const,
  products: "Repair services",
  sitesCoverage: "all" as const,
  sites: [{ name: "Workshop", address: "10 Main Street", type: "" }],
  designDeclaration: "customer_specifications" as const,
  thirdPartyProperty: "no" as const,
};
const facts = {
  projectName: "Atlas",
  standard: "ISO_9001",
  profile: [{ key: "mission", value: "Repair" }],
  issues: [{ id: "i" }],
  parties: [{ id: "p" }],
  requirements: [],
};
const verification = {
  applicability: "applicable",
  justification: "Professional assessment of actual responsibilities",
};
const statement =
  "The QMS scope of Atlas, defined with reference to ISO 9001, covers repair services at Workshop, 10 Main Street.";
describe("Scope professional boundary decisions", () => {
  it("requires named sites with addresses even for all sites", () => {
    expect(missingDeclarations({ ...declaration, sites: [] })).toContain("sites");
    expect(
      missingDeclarations({ ...declaration, sites: [{ name: "Workshop", address: "", type: "" }] }),
    ).toContain("sites");
    expect(missingDeclarations(declaration)).toEqual([]);
  });
  it("never confirms non-applicability from customer specifications", () =>
    expect(designProposal(declaration)).toBe("candidate_non_applicable"));
  it("requires an exclusion description AND a justification", () =>
    expect(
      missingDeclarations({
        ...declaration,
        activitiesInclusion: "exclude_some",
        excludedActivities: "Design",
      }),
    ).toContain("activitiesExcluded"));
  it("blocks conflicting inclusion/exclusion declarations", () =>
    expect(canVerify({ ...declaration, excludedActivities: "Design" }, facts, [])).toBe(false));
  it("requires explicit review of absent upstream evidence", () => {
    const f = { ...facts, profile: [], issues: [], parties: [] };
    expect(canVerify(declaration, f, [])).toBe(false);
    expect(
      canVerify(
        declaration,
        f,
        findings(declaration, f).map((row) => row.key),
      ),
    ).toBe(true);
  });
  it("only raises property findings from explicit retained evidence", () => {
    expect(findings(declaration, facts).some((f) => f.key === "propertyConflict")).toBe(false);
    expect(
      findings(declaration, {
        ...facts,
        requirements: [{ partyName: "Customers", text: "Protection of customer property" }],
      }).some((f) => f.key === "propertyConflict"),
    ).toBe(true);
  });
  it("requires exact professional ISO decisions in generated content", () => {
    expect(
      validStatement({ statement, nonApplicable: [] }, { facts, declaration, verification }),
    ).toBe(true);
    expect(
      validStatement(
        {
          statement,
          nonApplicable: [{ clause: "8.3", justification: verification.justification }],
        },
        { facts, declaration, verification },
      ),
    ).toBe(false);
    expect(
      validStatement(
        { statement, nonApplicable: [] },
        { facts, declaration, verification: { ...verification, applicability: "not_applicable" } },
      ),
    ).toBe(false);
  });
  it("rejects an omitted site or a certification claim", () => {
    expect(
      validStatement(
        { statement: statement.replace("Workshop", "Site"), nonApplicable: [] },
        { facts, declaration, verification },
      ),
    ).toBe(false);
    expect(
      validStatement(
        { statement: statement + " The system is certified to ISO 9001.", nonApplicable: [] },
        { facts, declaration, verification },
      ),
    ).toBe(false);
  });
});
