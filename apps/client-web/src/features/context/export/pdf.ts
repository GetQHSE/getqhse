/** Real generated PDF export of the canonical context analysis snapshot. */

import {
  contextDocumentFileName,
  exportTranslator,
  type ContextDocument,
  type ContextDocumentGroup,
  type ContextDocumentIssue,
} from "./document.js";
import { downloadBlob } from "./download.js";

const NAVY = [31, 58, 95] as const;

/**
 * jsPDF's built-in Helvetica covers Latin scripts only, so the PDF is offered for
 * French and English projects; Arabic projects export to Word.
 */
export async function buildContextPdfBlob(doc: ContextDocument): Promise<Blob> {
  const t = exportTranslator(doc.language);
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 40;
  const usable = pageWidth - margin * 2;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(doc.title, margin, 52);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(90);
  pdf.text(
    [
      `GetQhse — ${doc.organizationName} · ${doc.projectName}`,
      t("export.standardGenerated", { standard: doc.isoStandard, generated: doc.generatedOn }),
      t("export.methodShort", { method: doc.methodLabel }),
      doc.methodSummary,
      t("export.analysisDate", { value: doc.analysisDate ?? "—" }),
      t("export.summaryIssues", doc.summary),
      t("export.summaryOther", doc.summary),
    ].join("\n"),
    margin,
    70,
  );
  pdf.setTextColor(0);

  let cursor = 158;

  const heading = (label: string, size = 12) => {
    if (cursor > pdf.internal.pageSize.getHeight() - 120) {
      pdf.addPage();
      cursor = 60;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(size);
    pdf.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    pdf.text(label, margin, cursor);
    pdf.setTextColor(0);
    cursor += 12;
  };

  const note = (label: string) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(label, margin, cursor);
    cursor += 24;
  };

  const table = (head: string[][], body: string[][], widths?: Record<number, number>) => {
    autoTable(pdf, {
      head,
      body,
      startY: cursor + 6,
      margin: { left: margin, right: margin },
      styles: { font: "helvetica", fontSize: 8, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: [NAVY[0], NAVY[1], NAVY[2]], textColor: 255, fontStyle: "bold" },
      ...(widths
        ? {
            columnStyles: Object.fromEntries(
              Object.entries(widths).map(([key, value]) => [key, { cellWidth: value }]),
            ),
          }
        : {}),
    });
    cursor = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  };

  const issueTable = (issues: ContextDocumentIssue[]) =>
    table(
      [
        [
          t("export.columns.issue"),
          t("export.columns.description"),
          t("export.columns.natureCategory"),
          t("export.columns.assessment"),
        ],
      ],
      issues.map((issue) => [
        [
          issue.title,
          issue.addedManually ? t("export.addedByYou") : "",
          issue.corrected ? t("export.corrected") : "",
        ]
          .filter(Boolean)
          .join("\n"),
        issue.description,
        `${issue.natureLabel}\n${issue.categoryLabel}`,
        [
          t("export.statusLine", { value: issue.statusLabel }),
          t("export.qualityShort", { value: issue.impactQuality }),
          t("export.customerShort", { value: issue.impactCustomer }),
          t("export.overallShort", { value: issue.impactOverall }),
        ].join("\n"),
      ]),
      { 0: usable * 0.24, 1: usable * 0.36, 2: usable * 0.18, 3: usable * 0.22 },
    );

  const groupSection = (title: string, groups: ContextDocumentGroup[]) => {
    heading(title);
    for (const group of groups) {
      heading(`${group.label} (${group.issues.length})`, 10);
      issueTable(group.issues);
    }
  };

  heading(t("export.sectionInternal"));
  if (doc.internalIssues.length === 0) note(t("export.noInternal"));
  else issueTable(doc.internalIssues);

  heading(t("export.sectionExternal"));
  if (doc.factors.length === 0) {
    note(t("export.noFactors"));
  } else {
    table(
      [
        [
          t("export.columns.factor"),
          t("export.columns.description"),
          t("export.columns.relevance"),
          t("export.columns.publishers"),
        ],
      ],
      doc.factors.map((factor) => [
        `${factor.title}\n${factor.categoryLabel}`,
        factor.description,
        factor.relevance,
        factor.publishers.join(", ") || "—",
      ]),
      { 0: usable * 0.22, 1: usable * 0.32, 2: usable * 0.26, 3: usable * 0.2 },
    );
  }

  let index = 3;
  if (doc.swot) {
    groupSection(t("export.sectionSwot", { index }), doc.swot);
    index += 1;
  }
  if (doc.pestel) {
    groupSection(t("export.sectionPestel", { index }), doc.pestel);
    index += 1;
  }

  heading(t("export.sectionSynthesis", { index }));
  if (doc.synthesis.length === 0) note(t("export.noIssues"));
  else issueTable(doc.synthesis);

  return pdf.output("blob");
}

export async function downloadContextPdf(doc: ContextDocument): Promise<void> {
  const blob = await buildContextPdfBlob(doc);
  downloadBlob(blob, contextDocumentFileName(doc, "pdf"));
}
