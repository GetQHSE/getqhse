/** Real, editable .docx export of the canonical context analysis snapshot. */

import {
  contextDocumentFileName,
  exportTranslator,
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

  const t = exportTranslator(doc.language);
  // Arabic documents read right to left: paragraphs, runs and tables are mirrored.
  const rtl = doc.language === "ar";
  const FONT = "Arial";
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const margins = { top: 60, bottom: 60, left: 100, right: 100 };

  const text = (value: string, options: { bold?: boolean; size?: number; color?: string } = {}) =>
    new TextRun({ text: value, font: FONT, rightToLeft: rtl, ...options });

  const body = (value: string, bold = false) =>
    new Paragraph({ bidirectional: rtl, children: [text(value, { size: 20, bold })] });

  const heading = (value: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      bidirectional: rtl,
      children: [text(value, { bold: true, size: 26 })],
    });

  const cell = (value: string, width: number, header = false) =>
    new TableCell({
      borders,
      margins,
      width: { size: width, type: WidthType.DXA },
      ...(header ? { shading: { fill: "F2F5F9", type: ShadingType.CLEAR } } : {}),
      children: value.split("\n").map(
        (line) =>
          new Paragraph({
            bidirectional: rtl,
            children: [text(line, { size: 18, bold: header })],
          }),
      ),
    });

  const ISSUE_WIDTHS = [2400, 3400, 1720, 1840] as const;

  const issueTable = (issues: ContextDocumentIssue[]) =>
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      visuallyRightToLeft: rtl,
      columnWidths: [...ISSUE_WIDTHS],
      rows: [
        new TableRow({
          children: [
            cell(t("export.columns.issue"), ISSUE_WIDTHS[0], true),
            cell(t("export.columns.description"), ISSUE_WIDTHS[1], true),
            cell(t("export.columns.natureCategory"), ISSUE_WIDTHS[2], true),
            cell(t("export.columns.assessment"), ISSUE_WIDTHS[3], true),
          ],
        }),
        ...issues.map(
          (issue) =>
            new TableRow({
              children: [
                cell(
                  [
                    issue.title,
                    issue.addedManually ? t("export.addedByYou") : "",
                    issue.corrected ? t("export.corrected") : "",
                  ]
                    .filter(Boolean)
                    .join("\n"),
                  ISSUE_WIDTHS[0],
                ),
                cell(issue.description, ISSUE_WIDTHS[1]),
                cell(`${issue.natureLabel}\n${issue.categoryLabel}`, ISSUE_WIDTHS[2]),
                cell(
                  [
                    t("export.statusLine", { value: issue.statusLabel }),
                    t("export.qualityLine", { value: issue.impactQuality }),
                    t("export.customerLine", { value: issue.impactCustomer }),
                    t("export.overallLine", { value: issue.impactOverall }),
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
      bidirectional: rtl,
      children: [text(doc.title, { bold: true, size: 32 })],
    }),
    body(`${doc.organizationName} · ${doc.projectName}`),
    body(t("export.standard", { value: doc.isoStandard })),
    body(t("export.method", { method: doc.methodLabel, summary: doc.methodSummary })),
    body(t("export.dates", { analysis: doc.analysisDate ?? "—", generated: doc.generatedOn })),
    body(t("export.summaryLine", doc.summary)),
    body(t("export.factorsDocumented", { count: doc.summary.factors })),
  ];

  children.push(heading(t("export.sectionInternal")));
  if (doc.internalIssues.length === 0) {
    children.push(body(t("export.noInternal")));
  } else {
    children.push(issueTable(doc.internalIssues));
  }
  children.push(body(""));

  children.push(heading(t("export.sectionExternal")));
  if (doc.factors.length === 0) {
    children.push(body(t("export.noFactors")));
  } else {
    for (const factor of doc.factors) {
      children.push(body(`${factor.title} — ${factor.categoryLabel}`, true));
      children.push(body(factor.description));
      children.push(body(t("export.relevanceLine", { value: factor.relevance })));
      if (factor.publishers.length > 0) {
        children.push(body(t("export.publishersLine", { value: factor.publishers.join(", ") })));
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
    groupSection(t("export.sectionSwot", { index }), doc.swot);
    index += 1;
  }
  if (doc.pestel) {
    groupSection(t("export.sectionPestel", { index }), doc.pestel);
    index += 1;
  }

  children.push(heading(t("export.sectionSynthesis", { index })));
  if (doc.synthesis.length === 0) {
    children.push(body(t("export.noIssues")));
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
                alignment: rtl ? AlignmentType.LEFT : AlignmentType.RIGHT,
                bidirectional: rtl,
                children: [
                  text(t("export.page"), { size: 16 }),
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
