import { describe, expect, it } from "vitest";

import { buildContextDigest, contextScopeCountries } from "./prompts/context-digest.js";

const base = {
  project: {
    name: "Usine Nord",
    entityType: "COMPANY",
    description: "Fabrication de pièces automobiles.",
    standardCode: "ISO_9001",
    countryCode: "MA",
    organizationName: "Groupe Nord",
    activities: ["Emboutissage"],
  },
  profileFields: {},
  internalInputs: [],
  registerEntries: [],
};

describe("buildContextDigest", () => {
  it("tells the model the légal dimension must not be searched when the veille is empty", () => {
    expect(buildContextDigest(base)).toContain("ne doit PAS être recherchée ici");
  });

  it("carries identity, validated profile answers and register entries like the foundation", () => {
    const digest = buildContextDigest({
      ...base,
      profileFields: {
        "organization.mission": "Produire des pièces fiables",
        "project.logoUrl": "x",
      },
      registerEntries: [
        {
          citationLabel: "Code du travail — Art. 24",
          sourceTitle: null,
          sourceReference: "Loi 65-99",
          applicabilityRationale: "L'entreprise emploie des salariés.",
        },
      ],
    });
    expect(digest).toContain("Organisation : Groupe Nord");
    expect(digest).toContain("Activités : Emboutissage");
    expect(digest).toContain("Pays / juridictions identifiés : Maroc");
    expect(digest).toContain("[organization.mission]");
    expect(digest).toContain("Réponse validée : Produire des pièces fiables");
    expect(digest).not.toContain("project.logoUrl");
    expect(digest).toContain(
      "- Code du travail — Art. 24 (Loi 65-99) — Maroc — décision IA : applicable",
    );
    expect(digest).toContain("  Motif : L'entreprise emploie des salariés.");
  });
});

describe("contextScopeCountries", () => {
  it("prefers the validated operating countries over the project country", () => {
    expect(
      contextScopeCountries({
        ...base,
        profileFields: { "scope.operatingCountries": ["FR", "MA"] },
      }),
    ).toEqual(["France", "Maroc"]);
  });
});
