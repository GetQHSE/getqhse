import { describe, expect, it } from "vitest";

import {
  buildRegulatoryQueries,
  computeProfileChanges,
  matchProvisionRevision,
} from "./regulatory-analysis.processor.js";

describe("regulatory analysis query planning", () => {
  it("builds bounded searches from the regulatory profile snapshot", () => {
    const queries = buildRegulatoryQueries({
      fields: {
        "organization.primarySector": "Métallurgie",
        "organization.offerings": ["Armoires métalliques", "Soudage"],
        "operations.keyProcesses": ["Découpe", "Peinture"],
        "scope.operatingCountries": ["MA"],
        "regulatory.knownRequirements": ["ISO 9001"],
      },
    });
    expect(queries).toHaveLength(6);
    expect(queries[0]).toContain("Métallurgie");
    expect(queries.some((query) => query.includes("ISO 9001"))).toBe(true);
    expect(queries.every((query) => query.length < 20_000)).toBe(true);
  });

  it("computes only material profile changes", () => {
    expect(
      computeProfileChanges(
        { fields: { sector: "Métallurgie", countries: ["MA"] } },
        { fields: { sector: "Métallurgie", countries: ["MA", "FR"] } },
      ),
    ).toEqual([{ key: "countries", previous: ["MA"], current: ["MA", "FR"] }]);
  });

  it("matches unchanged and modified provisions across revisions by logical identity", () => {
    const previous = {
      documentId: "document-1",
      language: "fr",
      identifier: "Article 12",
      headingPath: ["Titre II"],
      contentHash: "hash-1",
    };
    expect(matchProvisionRevision(previous, [{ ...previous }]).changeType).toBe("UNCHANGED");
    expect(
      matchProvisionRevision(previous, [{ ...previous, contentHash: "hash-2" }]).changeType,
    ).toBe("MODIFIED");
  });

  it("never guesses when a provision is missing or ambiguous", () => {
    const previous = {
      documentId: "document-1",
      language: "ar",
      identifier: null,
      headingPath: ["المادة 12"],
      contentHash: "hash-1",
    };
    expect(matchProvisionRevision(previous, [])).toEqual({
      match: null,
      changeType: "REMOVAL_PROPOSED",
      ambiguous: false,
    });
    expect(matchProvisionRevision(previous, [{ ...previous }, { ...previous }])).toMatchObject({
      match: null,
      changeType: "REMOVAL_PROPOSED",
      ambiguous: true,
    });
  });
});
