import { describe, expect, it } from "vitest";
import {
  assertRevisionRight,
  chunkNormativeProvisions,
  detectNormativeProvisions,
  isNormativeSearchEligible,
  reciprocalRankFusion,
  stableCitationLabel,
} from "./index.js";

describe("normative structure", () => {
  it("preserves pages and parses ISO clauses", () => {
    const provisions = detectNormativeProvisions(
      [
        { pageNumber: 1, text: "4.1 Contexte de l'organisme\nTexte page un" },
        { pageNumber: 2, text: "Suite du texte\n4.2 Parties intéressées\nAutre texte" },
      ],
      "fr",
    );
    expect(provisions.map(({ sourceIdentifier }) => sourceIdentifier)).toEqual(["4.1", "4.2"]);
    expect(provisions[0]).toMatchObject({ pageStart: 1, pageEnd: 2 });
  });

  it("parses French and Arabic legal articles", () => {
    expect(
      detectNormativeProvisions([{ pageNumber: 3, text: "Article 12 — Objet\nContenu" }], "fr")[0],
    ).toMatchObject({ type: "article", sourceIdentifier: "Article 12", pageStart: 3 });
    expect(
      detectNormativeProvisions([{ pageNumber: 4, text: "المادة ٥: النطاق\nالنص" }], "ar")[0],
    ).toMatchObject({ type: "article", sourceIdentifier: "المادة ٥", pageStart: 4 });
  });

  it("only splits provisions over the configured limit", () => {
    const provisions = detectNormativeProvisions(
      [{ pageNumber: 1, text: `4.1 Clause\n${"texte ".repeat(100)}` }],
      "fr",
    );
    expect(
      chunkNormativeProvisions(provisions, { documentTitle: "ISO test" }, 120).length,
    ).toBeGreaterThan(1);
  });
});

describe("retrieval policies", () => {
  it("denies rights by default", () => {
    expect(() =>
      assertRevisionRight(
        {
          storage: false,
          extraction: false,
          embedding: false,
          aiProcessing: false,
          externalProviderProcessing: false,
          excerptDisplay: false,
        },
        "embed",
      ),
    ).toThrow(/do not permit embed/);
  });

  it.each([
    ["unpublished", { revisionStatus: "VALIDATED" }],
    ["archived", { documentStatus: "ARCHIVED" }],
    ["expired", { expirationDate: "2026-08-08" }],
    ["restricted", { visibility: "RESTRICTED" }],
    ["incomplete embeddings", { allChunksEmbedded: false }],
    ["wrong jurisdiction", { countryCode: "FR", jurisdiction: "France" }],
  ])("excludes %s content", (_name, override) => {
    const rights = {
      storage: true,
      extraction: true,
      embedding: true,
      aiProcessing: true,
      externalProviderProcessing: true,
      excerptDisplay: true,
    };
    expect(
      isNormativeSearchEligible({
        revisionStatus: "PUBLISHED",
        humanValidated: true,
        documentStatus: "PUBLISHED",
        visibility: "ORGANIZATION_AVAILABLE",
        documentFamily: "standard",
        countryCode: null,
        jurisdiction: "global",
        language: "fr",
        requestedLanguages: ["fr", "ar"],
        asOf: "2026-08-08",
        effectiveDate: "2020-01-01",
        expirationDate: null,
        rights,
        allChunksEmbedded: true,
        ...override,
      }),
    ).toBe(false);
  });

  it("fuses independent rankings deterministically", () => {
    const result = reciprocalRankFusion(
      [
        { id: "exact", rank: 1 },
        { id: "keyword", rank: 2 },
      ],
      [
        { id: "semantic", rank: 1 },
        { id: "exact", rank: 2 },
      ],
    );
    expect(result[0]?.id).toBe("exact");
  });

  it("builds a stable citation", () => {
    expect(
      stableCitationLabel({
        documentTitle: "Norme",
        referenceNumber: "ISO 9001",
        revisionLabel: "r2",
        provisionIdentifier: "4.1",
        pageStart: 8,
        pageEnd: 9,
      }),
    ).toBe("ISO 9001 (r2), 4.1, p. 8–9");
  });
});
