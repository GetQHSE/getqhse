import { describe, expect, it } from "vitest";
import {
  assertRevisionRight,
  assessStructureQuality,
  chunkNormativeProvisions,
  detectNormativeProvisions,
  detectNormativeProvisionsFromBlocks,
  estimateTokens,
  extractExactReference,
  isNormativeSearchEligible,
  reciprocalRankFusion,
  stableCitationLabel,
  STRUCTURE_REVIEW_THRESHOLD,
  type NormativeLanguage,
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
    ).toMatchObject({ type: "article", sourceIdentifier: "المادة 5", pageStart: 4 });
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

// Every fixture below is taken from one of the two documents in tests/factories: the Moroccan
// standard NM 22.0.010 (single-level clauses, a dotted table of contents, a licence footer) and
// the loi 09-08 as the Bulletin officiel typesets it ("Article premier" then "Art. 2").
describe("heading forms Moroccan sources actually use", () => {
  it("opens a provision on the abbreviated article form, not only the spelled-out word", () => {
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        { blockType: "section_header", text: "Article premier", pageNumber: 1 },
        { blockType: "text", text: "L'informatique est au service du citoyen.", pageNumber: 1 },
        {
          blockType: "text",
          text: "Art. 2. - Au sens de la présente loi, on entend par…",
          pageNumber: 1,
        },
        {
          blockType: "text",
          text: "Art 3 : Les données sont collectées loyalement.",
          pageNumber: 2,
        },
      ],
      "fr",
    );

    // Before the abbreviation was recognized, articles 2 and 3 were swallowed into article
    // premier and the law reached review as a single unusable provision.
    expect(provisions.map((provision) => provision.sourceIdentifier)).toEqual([
      "Article premier",
      "Article 2",
      "Article 3",
    ]);
    expect(provisions[1]?.title).toBe("Au sens de la présente loi, on entend par…");
  });

  it("reads an article under either Arabic label and stores one spelling of its number", () => {
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        { blockType: "section_header", text: "الفصل ١٢", pageNumber: 1 },
        { blockType: "text", text: "يعاقب كل من خالف أحكام هذا القانون.", pageNumber: 1 },
        { blockType: "section_header", text: "المادة ٥: النطاق", pageNumber: 2 },
        { blockType: "text", text: "النص", pageNumber: 2 },
      ],
      "ar",
    );

    // Dahirs number articles "الفصل"; later laws use "المادة". Both are stored with ASCII
    // digits so a citation typed either way resolves to the same provision.
    expect(provisions.map((provision) => provision.sourceIdentifier)).toEqual([
      "الفصل 12",
      "المادة 5",
    ]);
  });

  it("opens a clause on the single-level headings a Moroccan standard numbers with", () => {
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        { blockType: "section_header", text: "1 OBJET", pageNumber: 4 },
        {
          blockType: "text",
          text: "La présente norme spécifie les conditions d'emballage.",
          pageNumber: 4,
        },
        { blockType: "section_header", text: "2 DOMAINE D'APPLICATION", pageNumber: 4 },
        { blockType: "text", text: "La présente norme s'applique aux équipements.", pageNumber: 4 },
      ],
      "fr",
    );

    // NM 22.0.010 numbers its clauses 1..5, not 4.1/4.2, so requiring two levels left the
    // whole standard as one untitled section.
    expect(provisions.map((provision) => provision.sourceIdentifier)).toEqual(["1", "2"]);
    expect(provisions[0]?.title).toBe("OBJET");
  });

  it("leaves an enumerated obligation inside the article that introduces it", () => {
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        { blockType: "section_header", text: "Article 8", pageNumber: 3 },
        {
          blockType: "text",
          text: "La personne concernée a le droit d'obtenir :\n1 La confirmation que des données la concernant sont traitées ;\n2 La communication de ces données sous une forme intelligible.",
          pageNumber: 3,
        },
      ],
      "fr",
    );

    // A bare number opening a lowercase sentence is a list item, not a clause heading.
    expect(provisions).toHaveLength(1);
    expect(provisions[0]?.content).toContain("forme intelligible");
  });

  it("does not read a table of contents entry as a clause", () => {
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        { blockType: "section_header", text: "SOMMAIRE", pageNumber: 3 },
        {
          blockType: "text",
          text: "1 OBJET.................................................................4\n2 DOMAINE D'APPLICATION …………………………………………………4",
          pageNumber: 3,
        },
      ],
      "fr",
    );

    // Contents entries repeat headings that appear again as real clauses further on, so
    // admitting them duplicated every clause in the standard.
    expect(
      provisions.flatMap((provision) => (provision.type === "clause" ? [provision] : [])),
    ).toEqual([]);
  });
});

describe("prose that only looks like a heading", () => {
  it("keeps a sanction amount inside the article that imposes it", () => {
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        {
          blockType: "paragraph",
          text: "Article 91\nEst puni d'une amende de\n1.200 à 50.000 dirhams quiconque contrevient\naux dispositions du présent chapitre.",
          pageNumber: 23,
        },
      ],
      "fr",
    );

    // French writes thousands with a full stop, so "1.200" used to open a clause and left the
    // fine as a floating amount with no offence attached to it.
    expect(provisions).toHaveLength(1);
    expect(provisions[0]?.sourceIdentifier).toBe("Article 91");
    expect(provisions[0]?.content).toContain("1.200 à 50.000 dirhams");
  });

  it("keeps an article whole when a wrapped line begins with a container keyword", () => {
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        { blockType: "section_header", text: "Article 5", pageNumber: 2 },
        {
          blockType: "text",
          text: "Demeurent applicables les dispositions du\nchapitre premier de la présente loi relatives au contrôle financier.",
          pageNumber: 2,
        },
      ],
      "fr",
    );

    // Blocks keep the page's line wrapping, so a body line can start on "chapitre". Opening a
    // container there closed the article halfway through its own sentence.
    expect(provisions).toHaveLength(1);
    expect(provisions[0]?.content).toContain("relatives au contrôle financier");
    expect(provisions[0]?.headingPath).toEqual(["Article 5"]);
  });

  it("still opens a container on a genuine chapter heading", () => {
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        { blockType: "section_header", text: "Chapitre premier", pageNumber: 1 },
        { blockType: "section_header", text: "Section première – Définitions", pageNumber: 1 },
        { blockType: "section_header", text: "Article premier", pageNumber: 1 },
        { blockType: "text", text: "Contenu.", pageNumber: 1 },
      ],
      "fr",
    );

    expect(provisions[0]?.headingPath).toEqual([
      "Chapitre premier",
      "Section première – Définitions",
      "Article premier",
    ]);
  });
});

describe("layouts the live extractor actually returns", () => {
  it("takes a heading that follows an article number as that article's title", () => {
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        { blockType: "section_header", text: "Article 6", pageNumber: 3, headingLevel: 1 },
        {
          blockType: "section_header",
          text: "Limites au droit à l'information",
          pageNumber: 3,
          headingLevel: 3,
        },
        {
          blockType: "text",
          text: "L'obligation d'information prévue à l'article 5 n'est pas applicable :",
          pageNumber: 3,
        },
      ],
      "fr",
    );

    // The Bulletin officiel sets an article as its number, then its title, then its body, and
    // the extractor labels the first two as separate headings. Reading the title as a new
    // container closed the article on its own number: a nine-character provision whose text
    // went to a container named after the title.
    expect(provisions).toHaveLength(1);
    expect(provisions[0]).toMatchObject({
      sourceIdentifier: "Article 6",
      title: "Limites au droit à l'information",
    });
    expect(provisions[0]?.content).toContain("n'est pas applicable");
    expect(provisions[0]?.headingPath).toEqual(["Article 6 — Limites au droit à l'information"]);
  });

  it("joins an article keyword and its number when a column break split them", () => {
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        { blockType: "section_header", text: "Article", pageNumber: 5 },
        { blockType: "section_header", text: "14", pageNumber: 5 },
        { blockType: "text", text: "Le responsable du traitement doit adresser.", pageNumber: 5 },
      ],
      "fr",
    );

    // Neither half is a heading on its own, so the article used to disappear entirely and its
    // text joined whatever came before it.
    expect(provisions).toHaveLength(1);
    expect(provisions[0]?.sourceIdentifier).toBe("Article 14");
  });

  it("opens a chapter when OCR read its roman numeral as a lowercase l", () => {
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        { blockType: "section_header", text: "Chapitre premier", pageNumber: 1 },
        { blockType: "section_header", text: "Article 4", pageNumber: 1 },
        { blockType: "text", text: "Contenu de l'article 4.", pageNumber: 1 },
        { blockType: "section_header", text: "Chapitre Il", pageNumber: 3 },
        { blockType: "section_header", text: "Article 5", pageNumber: 3 },
        { blockType: "text", text: "Contenu de l'article 5.", pageNumber: 3 },
      ],
      "fr",
    );

    // A full-page OCR pass returns "Chapitre Il" for "Chapitre II" routinely. Failing to open
    // the second chapter left every article under it still attributed to the first.
    expect(provisions.at(-1)?.headingPath).toEqual(["Chapitre Il", "Article 5"]);
  });

  it("refuses front matter as an ancestor of the provisions that follow it", () => {
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        { blockType: "section_header", text: "SOMMAIRE", pageNumber: 3, headingLevel: 3 },
        { blockType: "section_header", text: "1 OBJET", pageNumber: 4, headingLevel: 4 },
        { blockType: "text", text: "La présente norme spécifie.", pageNumber: 4 },
      ],
      "fr",
    );

    // A contents page is not a parent of the document. Its own text is still kept; only its
    // claim to govern what comes after is refused, so the label stays out of every embedding.
    expect(provisions.at(-1)?.headingPath).toEqual(["1 — OBJET"]);
  });

  it("ignores a level on anything that is not a heading", () => {
    const provisions = detectNormativeProvisionsFromBlocks(
      [
        { blockType: "section_header", text: "Article 4", pageNumber: 1 },
        { blockType: "text", text: "Contenu de la disposition.", pageNumber: 1, headingLevel: 1 },
      ],
      "fr",
    );

    expect(provisions).toHaveLength(1);
    expect(provisions[0]?.content).toContain("Contenu de la disposition.");
  });
});

describe("exact reference lookup", () => {
  it("normalizes a citation to the spelling provisions are stored under", () => {
    expect(extractExactReference("que dit l'art. 12 de cette loi ?")).toBe("article 12");
    expect(extractExactReference("ما هو نص المادة ٥؟")).toBe("المادة 5");
    expect(extractExactReference("الفصل ٧ من الظهير")).toBe("الفصل 7");
    expect(extractExactReference("exigence 4.1 de la norme")).toBe("4.1");
  });
});

describe("chunking", () => {
  const arabic =
    "يعاقب بغرامة من ألف ومائتين إلى خمسين ألف درهم كل من خالف أحكام هذا القانون، وإذا كان " +
    "المخالف شخصا معنويا فإنه يعاقب بغرامة من خمسين ألف إلى مليون درهم. ";
  const french =
    "Le responsable du traitement doit adresser une déclaration préalable à la Commission " +
    "nationale avant la mise en oeuvre du traitement envisagé. ";
  const provision = (content: string, language: NormativeLanguage = "fr") => [
    {
      type: "article" as const,
      sourceIdentifier: "Article 12",
      title: null,
      headingPath: ["Chapitre III", "Article 12"],
      language,
      content,
      contentHash: "hash",
      pageStart: 1,
      pageEnd: 1,
      orderIndex: 0,
    },
  ];

  it("counts Arabic tokens at their real cost rather than at the Latin rate", () => {
    // Measured against cl100k_base: French runs ~4.1 characters to a token, Arabic ~1.44.
    // Dividing characters by four is right for French and under-reports Arabic threefold.
    const sample = arabic.repeat(20);
    const naive = Math.ceil(sample.length / 4);

    expect(estimateTokens(sample)).toBeGreaterThan(naive * 2.5);
    expect(estimateTokens(french.repeat(20))).toBeCloseTo(
      Math.ceil((french.repeat(20).length / 4) * 1.0),
      -1,
    );
  });

  it("charges a mixed-script provision proportionally", () => {
    const mixed = french.repeat(10) + arabic.repeat(10);

    // Blending the two rates instead of the character counts is the tempting version, and it
    // under-reports mixed text by about a fifth.
    const sumOfParts = estimateTokens(french.repeat(10)) + estimateTokens(arabic.repeat(10));
    expect(estimateTokens(mixed)).toBeGreaterThan(sumOfParts * 0.95);
    expect(estimateTokens(mixed)).toBeLessThan(sumOfParts * 1.05);
  });

  it("keeps an Arabic provision inside the same token budget as a French one", () => {
    const budget = 300;
    const arabicChunks = chunkNormativeProvisions(
      provision(arabic.repeat(30), "ar"),
      { documentTitle: "قانون" },
      budget,
    );

    // A character budget bought nearly three times as much Arabic as French, so an Arabic
    // chunk packed far more of its provision into one vector and retrieved less precisely.
    expect(arabicChunks.length).toBeGreaterThan(1);
    for (const chunk of arabicChunks) expect(chunk.tokenCount).toBeLessThanOrEqual(budget);
  });

  it("charges the metadata prefix against the budget it shares with the content", () => {
    // The prefix is embedded along with the content, so leaving it out of the accounting
    // understated every chunk by the length of its own heading path.
    const chunks = chunkNormativeProvisions(
      provision(french.repeat(40)),
      {
        documentTitle: "Loi 09-08 relative à la protection des personnes physiques",
        referenceNumber: "09-08",
      },
      300,
    );

    for (const chunk of chunks) expect(estimateTokens(chunk.searchText)).toBeLessThanOrEqual(300);
  });

  it("cuts between sentences rather than through one", () => {
    const chunks = chunkNormativeProvisions(
      provision(french.repeat(40)),
      { documentTitle: "x" },
      200,
    );

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks.slice(0, -1)) expect(chunk.content.trimEnd()).toMatch(/[.!?؟۔]$/u);
  });

  it("never lets a chunk exceed the budget it was given", () => {
    const budget = 250;
    const chunks = chunkNormativeProvisions(
      provision(french.repeat(30)),
      { documentTitle: "x" },
      budget,
    );

    // The budget covers the metadata prefix as well as the content, because both are embedded.
    for (const chunk of chunks) expect(chunk.tokenCount).toBeLessThanOrEqual(budget);
  });
});

describe("structure quality gate", () => {
  const article = (identifier: string) => ({
    blockType: "section_header",
    text: identifier,
    pageNumber: 1,
  });
  const body = (characters: number) => ({
    blockType: "text",
    text: "x".repeat(characters),
    pageNumber: 1,
  });
  const run = (blocks: Array<{ blockType: string; text: string; pageNumber: number }>) => {
    const provisions = detectNormativeProvisionsFromBlocks(blocks, "fr");
    return assessStructureQuality(blocks, provisions);
  };

  it("passes a document whose articles run consecutively", () => {
    const quality = run([article("Article premier"), body(400), article("Article 2"), body(400)]);

    expect(quality.score).toBe(1);
    expect(quality.concerns).toEqual([]);
    expect(quality.signals.missingNumbers).toEqual([]);
  });

  it("catches a gap in the numbering, which is a boundary the segmenter missed", () => {
    const quality = run([
      article("Article premier"),
      body(400),
      article("Article 2"),
      body(400),
      article("Article 5"),
      body(400),
    ]);

    // Articles are consecutive by construction, so a missing number is not a matter of taste.
    expect(quality.signals.missingNumbers).toEqual([3, 4]);
    expect(quality.score).toBeLessThan(1);
    expect(quality.concerns.join(" ")).toContain("numbering skips 3, 4");
  });

  it("does not invent a gap when a document starts partway through", () => {
    // An amending text that opens at article 30 is not missing the first twenty-nine.
    const quality = run([article("Article 30"), body(400), article("Article 31"), body(400)]);

    expect(quality.signals.missingNumbers).toEqual([]);
    expect(quality.score).toBe(1);
  });

  it("catches an article truncated to its own heading", () => {
    const quality = run([article("Article premier"), body(400), article("Article 2"), body(10)]);

    expect(quality.signals.fragments).toBe(1);
    expect(quality.concerns.join(" ")).toContain("under 120 characters");
  });

  it("catches a document whose text never decoded into citable provisions", () => {
    // The shape a broken text layer produces: plenty of provisions, not one of them citable.
    const quality = run([
      { blockType: "text", text: "$UWLFOH SUHPLHU ".repeat(30), pageNumber: 1 },
      { blockType: "text", text: "OHV GLVSRVLWLRQV ".repeat(30), pageNumber: 2 },
    ]);

    expect(quality.signals.identified).toBe(0);
    expect(quality.score).toBeLessThan(STRUCTURE_REVIEW_THRESHOLD);
    expect(quality.concerns.join(" ")).toContain("no provision carries an article or clause");
  });

  it("scores an empty segmentation at zero rather than leaving it to look ordinary", () => {
    expect(assessStructureQuality([], [])).toMatchObject({ score: 0 });
  });

  it("counts an identifier that opened a provision twice", () => {
    const quality = run([
      article("Article premier"),
      body(400),
      article("Article 2"),
      body(400),
      article("Article 2"),
      body(400),
    ]);

    expect(quality.signals.duplicateIdentifiers).toEqual(["Article 2"]);
    expect(quality.score).toBeLessThan(1);
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
