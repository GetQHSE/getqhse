import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  applicableLawDiscoverySchema,
  lawContext,
  materializeLawStructure,
  resolveApplicableLaws,
} from "./law-catalog.js";

const blocks = [
  { blockType: "heading", pageNumber: 1, text: "Chapitre I" },
  { blockType: "heading", pageNumber: 1, text: "Article 1" },
  { blockType: "text", pageNumber: 2, text: "L’employeur doit protéger les salariés." },
];
const nodes = [
  {
    ranges: [{ startBlock: 0, endBlock: 0 }],
    type: "section" as const,
    identifier: null,
    title: "Chapitre I",
    headingPath: [],
  },
  {
    ranges: [{ startBlock: 1, endBlock: 2 }],
    type: "article" as const,
    identifier: "Article 1",
    title: null,
    headingPath: ["Chapitre I"],
  },
];

describe("source-backed law ingestion", () => {
  it("generates an OpenAI-compatible discovery schema", () => {
    expect(JSON.stringify(z.toJSONSchema(applicableLawDiscoverySchema))).not.toContain(
      '"format":"uri"',
    );
  });

  it("copies exact source text and page bounds instead of accepting generated wording", () => {
    const result = materializeLawStructure(blocks, { nodes }, "fr");
    expect(result[1]).toMatchObject({
      content: "Article 1\n\nL’employeur doit protéger les salariés.",
      pageStart: 1,
      pageEnd: 2,
      headingPath: ["Chapitre I"],
    });
    expect(result.map((item) => item.content).join("\n\n")).toBe(
      blocks.map((block) => block.text).join("\n\n"),
    );
  });

  it("joins an article across page furniture without losing either source", () => {
    const pageBlocks = [
      blocks[1]!,
      blocks[2]!,
      { blockType: "page_footer", pageNumber: 2, text: "Page 2" },
      { blockType: "text", pageNumber: 3, text: "Cette obligation continue à la page suivante." },
    ];
    const result = materializeLawStructure(
      pageBlocks,
      {
        nodes: [
          {
            ...nodes[1]!,
            ranges: [
              { startBlock: 0, endBlock: 1 },
              { startBlock: 3, endBlock: 3 },
            ],
          },
          { ...nodes[0]!, type: "note", ranges: [{ startBlock: 2, endBlock: 2 }] },
        ],
      },
      "fr",
    );
    expect(result[0]!.content).toContain("Cette obligation continue");
    expect(result[0]!.content).not.toContain("Page 2");
    expect(result[1]!.content).toBe("Page 2");
  });

  it("rejects missing, overlapping and invented source ranges", () => {
    expect(() => materializeLawStructure(blocks, { nodes: [nodes[1]!] }, "fr")).toThrow(/skipped/);
    expect(() =>
      materializeLawStructure(
        blocks,
        { nodes: [nodes[0]!, { ...nodes[1]!, ranges: [{ startBlock: 0, endBlock: 2 }] }] },
        "fr",
      ),
    ).toThrow(/duplicated/);
    expect(() => materializeLawStructure(blocks, { nodes: [nodes[0]!] }, "fr")).toThrow(/omitted/);
    expect(() =>
      materializeLawStructure(
        blocks,
        { nodes: [nodes[0]!, { ...nodes[1]!, identifier: "Article 99" }] },
        "fr",
      ),
    ).toThrow(/invented/);
  });
});

describe("law catalog and context", () => {
  it("resolves canonical law references after discovery and keeps absent sources separate", () => {
    const catalog = [
      {
        documentId: "law-1",
        title: "Code du travail",
        referenceNumber: "Loi n° 65-99",
        tags: [],
      },
    ];
    const stored = {
      reference: "Loi 65-99",
      title: "Code du travail marocain",
      reason: "Le projet emploie des salariés.",
      sourceUrl: null,
      countryCode: "MA",
      applicableRequirements: [],
    };
    const absent = {
      reference: "Loi 09-08",
      title: "Protection des données personnelles",
      reason: "Le projet traite des données.",
      sourceUrl: "https://adala.justice.gov.ma/example",
      countryCode: "MA",
      applicableRequirements: [],
    };
    expect(resolveApplicableLaws(catalog, [stored, stored, absent])).toEqual({
      documentIds: ["law-1"],
      sourceRequired: [absent],
    });
  });

  it("requires a source when title matching is ambiguous", () => {
    const proposal = {
      reference: "Référence inconnue",
      title: "Réglementation sécurité industrielle",
      reason: "Activité industrielle.",
      sourceUrl: null,
      countryCode: "MA",
      applicableRequirements: [],
    };
    const catalog = ["law-1", "law-2"].map((documentId) => ({
      documentId,
      title: "Réglementation sécurité industrielle",
      referenceNumber: null,
      tags: [],
    }));
    expect(resolveApplicableLaws(catalog, [proposal])).toEqual({
      documentIds: [],
      sourceRequired: [proposal],
    });
  });

  const provisions = [
    {
      id: "scope",
      sourceIdentifier: "Article 1",
      headingPath: [],
      content: "Cette loi concerne les employeurs.",
    },
    {
      id: "duty",
      sourceIdentifier: "Article 2",
      headingPath: ["Chapitre II"],
      content: "L’employeur doit protéger les salariés.",
    },
    {
      id: "exception",
      sourceIdentifier: "Article 3",
      headingPath: ["Chapitre II"],
      content: "Cette obligation ne concerne pas la catégorie X.",
    },
  ];
  it("provides scope and exceptions for a short law", () => {
    const context = lawContext(provisions, "duty");
    expect(context.complete).toBe(true);
    for (const item of provisions) expect(context.text).toContain(item.content);
  });
  it("marks bounded context incomplete and never cuts a provision mid-sentence", () => {
    const context = lawContext(
      [...provisions, { ...provisions[0]!, id: "long", content: "x".repeat(1000) }],
      "duty",
      260,
    );
    expect(context.complete).toBe(false);
    expect(context.text.length).toBeLessThanOrEqual(260);
    expect(context.text).toContain(provisions[1]!.content);
    expect(context.text).not.toContain("xxxx");
  });
});
