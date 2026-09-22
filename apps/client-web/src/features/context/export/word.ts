/** Real, editable .docx export of the canonical context analysis snapshot. */

import {
  contextDocumentFileName,
  type ContextDocument,
  type ContextDocumentGroup,
  type ContextDocumentIssue,
} from "./document.js";
import { downloadBlob } from "./download.js";

export async function buildContextWordBlob(doc: ContextDocument): Promise<Blob> {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    HeadingLevel,
    PageNumber,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    ShadingType,
    WidthType,
  } = await import("docx");

  const FONT = "Arial";
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const margins = { top: 60, bottom: 60, left: 100, right: 100 };

  const text = (value: string, options: { bold?: boolean; size?: number; color?: string } = {}) =>
    new TextRun({ text: value, font: FONT, ...options });

  const body = (value: string, bold = false) =>
    new Paragraph({ children: [text(value, { size: 20, bold })] });

  const heading = (value: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [text(value, { bold: true, size: 26 })],
    });

  const cell = (value: string, width: number, header = false) =>
    new TableCell({
      borders,
      margins,
      width: { size: width, type: WidthType.DXA },
      ...(header ? { shading: { fill: "F2F5F9", type: ShadingType.CLEAR } } : {}),
      children: value
        .split("\n")
        .map((line) => new Paragraph({ children: [text(line, { size: 18, bold: header })] })),
    });

  const ISSUE_WIDTHS = [2400, 3400, 1720, 1840] as const;

  const issueTable = (issues: ContextDocumentIssue[]) =>
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [...ISSUE_WIDTHS],
      rows: [
        new TableRow({
          children: [
            cell("Enjeu", ISSUE_WIDTHS[0], true),
            cell("Description", ISSUE_WIDTHS[1], true),
            cell("Nature / catégorie", ISSUE_WIDTHS[2], true),
            cell("Évaluation / statut", ISSUE_WIDTHS[3], true),
          ],
        }),
        ...issues.map(
          (issue) =>
            new TableRow({
              children: [
                cell(
                  [
                    issue.title,
                    issue.addedManually ? "Ajouté par vous" : "",
                    issue.corrected ? "Corrigé" : "",
                  ]
                    .filter(Boolean)
                    .join("\n"),
                  ISSUE_WIDTHS[0],
                ),
                cell(issue.description, ISSUE_WIDTHS[1]),
                cell(`${issue.natureLabel}\n${issue.categoryLabel}`, ISSUE_WIDTHS[2]),
                cell(
                  [
                    `Statut : ${issue.statusLabel}`,
                    `Impact qualité : ${issue.impactQuality}`,
                    `Satisfaction client : ${issue.impactCustomer}`,
                    `Influence globale : ${issue.impactOverall}`,
                  ].join("\n"),
                  ISSUE_WIDTHS[3],
                ),
              ],
            }),
        ),
      ],
    });

  const children: object[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [text(doc.title, { bold: true, size: 32 })],
    }),
    body(`${doc.organizationName} · ${doc.projectName}`),
    body(`Référentiel : ${doc.isoStandard}`),
    body(`Méthode d’analyse : ${doc.methodLabel} — ${doc.methodSummary}`),
    body(
      `Date de l’analyse : ${doc.analysisDate ?? "—"}   |   Document généré le ${doc.generatedOn}`,
    ),
    body(
      `Enjeux : ${doc.summary.issues}   |   Retenus : ${doc.summary.retained}   |   Non retenus : ${doc.summary.notRetained}   |   À examiner : ${doc.summary.pending}   |   Corrigés : ${doc.summary.corrected}   |   Ajoutés manuellement : ${doc.summary.manual}`,
    ),
    body(`Facteurs externes documentés : ${doc.summary.factors}`),
  ];

  children.push(heading("1. Contexte interne — enjeux retenus"));
  if (doc.internalIssues.length === 0) {
    children.push(body("Aucun enjeu interne identifié."));
  } else {
    children.push(issueTable(doc.internalIssues));
  }
  children.push(body(""));

  children.push(heading("2. Analyse externe"));
  if (doc.factors.length === 0) {
    children.push(body("Aucun facteur externe documenté."));
  } else {
    for (const factor of doc.factors) {
      children.push(body(`${factor.title} — ${factor.categoryLabel}`, true));
      children.push(body(factor.description));
      children.push(body(`Pertinence : ${factor.relevance}`));
      if (factor.publishers.length > 0) {
        children.push(body(`Organismes cités : ${factor.publishers.join(", ")}`));
      }
      children.push(body(""));
    }
  }

  const groupSection = (title: string, groups: ContextDocumentGroup[]) => {
    children.push(heading(title));
    for (const group of groups) {
      children.push(body(`${group.label} (${group.issues.length})`, true));
      children.push(body(group.helper));
      children.push(issueTable(group.issues));
      children.push(body(""));
    }
  };

  let index = 3;
  if (doc.swot) {
    groupSection(`${index}. Analyse SWOT`, doc.swot);
    index += 1;
  }
  if (doc.pestel) {
    groupSection(`${index}. Analyse PESTEL`, doc.pestel);
    index += 1;
  }

  children.push(heading(`${index}. Synthèse des enjeux`));
  if (doc.synthesis.length === 0) {
    children.push(body("Aucun enjeu enregistré."));
  } else {
    children.push(issueTable(doc.synthesis));
  }

  const document = new Document({
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  text("Page ", { size: 16 }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16 }),
                ],
              }),
            ],
          }),
        },
        children: children as never,
      },
    ],
  });

  return await Packer.toBlob(document);
}

export async function downloadContextWord(doc: ContextDocument): Promise<void> {
  const blob = await buildContextWordBlob(doc);
  downloadBlob(blob, contextDocumentFileName(doc, "docx"));
}
