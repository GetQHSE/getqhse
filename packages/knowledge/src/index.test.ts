import { describe, expect, it } from "vitest";
import {
  assertRevisionRight,
  chunkNormativeProvisions,
  detectNormativeProvisions,
  detectNormativeProvisionsFromBlocks,
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

describe("block-based normative structure", () => {
  it("carries container headings into every provision they govern", () => {
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        { blockType: "section_header", text: "Chapitre V — Des infractions", pageNumber: 22 },
        { blockType: "section_header", text: "Article 90", pageNumber: 22 },
        {
          blockType: "text",
          text: "Est puni quiconque contrevient au présent titre.",
          pageNumber: 22,
        },
        { blockType: "section_header", text: "Article 91", pageNumber: 23 },
        { blockType: "text", text: "Si le contrevenant est une personne morale…", pageNumber: 23 },
      ],
      "fr",
    );

    expect(provisions.map((provision) => provision.sourceIdentifier)).toEqual([
      "Article 90",
      "Article 91",
    ]);
    // The chapter is the context a sanction article needs to be interpretable on its own.
    expect(provisions[1]?.headingPath).toEqual(["Chapitre V — Des infractions", "Article 91"]);
  });

  it("replaces sibling and deeper containers when a new one opens", () => {
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        { blockType: "section_header", text: "Titre II — Du contrôle", pageNumber: 1 },
        { blockType: "section_header", text: "Chapitre I — Des agents", pageNumber: 1 },
        { blockType: "section_header", text: "Chapitre II — Des sanctions", pageNumber: 2 },
        { blockType: "section_header", text: "Article 4", pageNumber: 2 },
        { blockType: "text", text: "Contenu de l'article 4.", pageNumber: 2 },
      ],
      "fr",
    );

    expect(provisions[0]?.headingPath).toEqual([
      "Titre II — Du contrôle",
      "Chapitre II — Des sanctions",
      "Article 4",
    ]);
  });

  it("keeps a table whole inside its provision instead of splitting its rows", () => {
    const table = "| Infraction | Amende |\n| --- | --- |\n| Défaut d'affichage | 1.200 à 50.000 |";
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        { blockType: "section_header", text: "Article 12", pageNumber: 5 },
        { blockType: "table", text: table, pageNumber: 5 },
      ],
      "fr",
    );

    expect(provisions).toHaveLength(1);
    expect(provisions[0]?.content).toContain("Défaut d'affichage");
    expect(provisions[0]?.content).toContain("Infraction | Amende");
  });

  it("never lets running headers or footers enter a provision", () => {
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        { blockType: "section_header", text: "Article 7", pageNumber: 8 },
        { blockType: "page_header", text: "Bulletin Officiel n° 6404", pageNumber: 8 },
        { blockType: "text", text: "L'employeur doit afficher le règlement.", pageNumber: 8 },
        { blockType: "page_footer", text: "18", pageNumber: 8 },
      ],
      "fr",
    );

    expect(provisions[0]?.content).toBe("Article 7\n\nL'employeur doit afficher le règlement.");
  });

  it("still splits unlabeled blocks by line so the pdftotext fallback keeps working", () => {
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        {
          blockType: "paragraph",
          text: "Article 1 — Objet\nPremier contenu.\nArticle 2 — Portée\nSecond contenu.",
          pageNumber: 1,
        },
      ],
      "fr",
    );

    expect(provisions.map((provision) => provision.sourceIdentifier)).toEqual([
      "Article 1",
      "Article 2",
    ]);
    expect(provisions[1]?.content).toContain("Second contenu.");
  });

  it("embeds a bare sanction article together with the offence chapter it punishes", () => {
    // Reproduces the loi 31-08 page that reached review as an unusable fragment: a penalty
    // article whose offence lives in the chapter heading and a neighbouring table, with a
    // running header cutting through the middle of it.
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        { blockType: "page_header", text: "Bulletin Officiel n° 6404", pageNumber: 23 },
        {
          blockType: "section_header",
          text: "Chapitre III — Des infractions et des sanctions",
          pageNumber: 23,
        },
        { blockType: "section_header", text: "Article 91", pageNumber: 23 },
        {
          blockType: "table",
          text: "| Infraction | Amende |\n| --- | --- |\n| Défaut d'affichage des prix | 1.200 à 50.000 dirhams |",
          pageNumber: 23,
        },
        { blockType: "page_footer", text: "p. 23", pageNumber: 23 },
        {
          blockType: "text",
          text: "Si le contrevenant est une personne morale, il sera puni d'une amende de 50.000 à 1.000.000 dirhams.",
          pageNumber: 23,
        },
      ],
      "fr",
    );

    expect(provisions).toHaveLength(1);
    const [chunk] = chunkNormativeProvisions(provisions, {
      documentTitle: "Loi 31-08 édictant des mesures de protection du consommateur",
      referenceNumber: "Loi 31-08",
    });
    // The offence, its fine, and the aggravated penalty now travel together, so the sanction
    // is no longer a floating amount with nothing to attach it to.
    expect(chunk?.embeddingText).toContain("Des infractions et des sanctions");
    expect(chunk?.embeddingText).toContain("Défaut d'affichage des prix");
    expect(chunk?.embeddingText).toContain("personne morale");
    expect(chunk?.embeddingText).not.toContain("Bulletin Officiel");
    expect(chunk?.embeddingText).not.toContain("p. 23");
  });

  it("does not repeat an identifier that its own heading path already carries", () => {
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        { blockType: "section_header", text: "Article 91", pageNumber: 1 },
        { blockType: "text", text: "Contenu de la disposition.", pageNumber: 1 },
      ],
      "fr",
    );
    const [chunk] = chunkNormativeProvisions(provisions, {
      documentTitle: "Loi 31-08",
      referenceNumber: "Loi 31-08",
    });

    // "Loi 31-08" is both title and reference; "Article 91" is both heading path and
    // identifier. Repeating them dilutes the embedding without adding meaning.
    expect(chunk?.embeddingText.match(/Article 91/g)).toHaveLength(2); // metadata + content
    expect(chunk?.embeddingText.match(/Loi 31-08/g)).toHaveLength(1);
  });

  it("tracks the page a provision starts and ends on across block boundaries", () => {
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        { blockType: "section_header", text: "Article 3", pageNumber: 4 },
        { blockType: "text", text: "Début.", pageNumber: 4 },
        { blockType: "text", text: "Suite sur la page suivante.", pageNumber: 5 },
      ],
      "fr",
    );

    expect(provisions[0]).toMatchObject({ pageStart: 4, pageEnd: 5 });
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
