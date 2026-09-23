import { describe, expect, it } from "vitest";

import { describeCountries, projectCountryCodes, webSearchLocationFor } from "./countries.js";

describe("projectCountryCodes", () => {
  it("lists the home country first, then the profile's operating countries, deduplicated", () => {
    expect(
      projectCountryCodes({ fields: { "scope.operatingCountries": ["fr", "MA", "TN"] } }, "MA"),
    ).toEqual(["MA", "FR", "TN"]);
  });

  it("falls back to the snapshot's project country when nothing else is known", () => {
    expect(projectCountryCodes({ project: { countryCode: "SN" }, fields: {} })).toEqual(["SN"]);
  });

  it("ignores values that are not ISO alpha-2 codes", () => {
    expect(
      projectCountryCodes({ "scope.operatingCountries": ["Maroc", "", 12, "DZ"] }, "MA"),
    ).toEqual(["MA", "DZ"]);
  });
});

describe("describeCountries / webSearchLocationFor", () => {
  it("names countries in French", () => {
    expect(describeCountries(["MA", "FR"])).toBe("Maroc (MA), France (FR)");
  });

  it("localises the search only for a single-country project", () => {
    expect(webSearchLocationFor(["MA"])).toEqual({ country: "MA", timezone: "Africa/Casablanca" });
    expect(webSearchLocationFor(["MA", "FR"])).toBeNull();
  });
});
