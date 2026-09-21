import ExcelJS from "exceljs";

import type { ContextDocument, ContextDocumentIssue } from "./context-document.js";

const border: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } },
};

function styleHeader(sheet: ExcelJS.Worksheet, row: number, columns: number): void {
  for (let column = 1; column <= columns; column += 1) {
    const cell = sheet.getCell(row, column);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBF7" } };
    cell.border = border;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.font = { name: "Calibri", size: 11, bold: true };
  }
}

function styleDataRow(sheet: ExcelJS.Worksheet, row: number, columns: number): void {
  for (let column = 1; column <= columns; column += 1) {
    const cell = sheet.getCell(row, column);
    cell.border = border;
    cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
    cell.font = { name: "Arial", size: 9 };
  }
}

const ISSUE_COLUMNS = [
  { header: "Intitulé", key: "title", width: 32 },
  { header: "Description", key: "description", width: 40 },
  { header: "Origine", key: "originLabel", width: 14 },
  { header: "Nature", key: "natureLabel", width: 14 },
  { header: "Catégorie", key: "categoryLabel", width: 20 },
  { header: "Statut", key: "statusLabel", width: 18 },
  { header: "Impact qualité", key: "impactQuality", width: 24 },
  { header: "Impact satisfaction client", key: "impactCustomer", width: 24 },
  { header: "Impact global", key: "impactOverall", width: 24 },
  { header: "Priorité", key: "priorityLabel", width: 12 },
  { header: "Ajout manuel", key: "addedManually", width: 12 },
  { header: "Corrigé", key: "corrected", width: 10 },
] as const;

function writeIssueSheet(sheet: ExcelJS.Worksheet, issues: ContextDocumentIssue[]): void {
  sheet.columns = ISSUE_COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
  }));
  styleHeader(sheet, 1, ISSUE_COLUMNS.length);
  sheet.getRow(1).height = 24;

  issues.forEach((issue, index) => {
    const row = sheet.getRow(index + 2);
    row.getCell(1).value = issue.title;
    row.getCell(2).value = issue.description;
    row.getCell(3).value = issue.originLabel;
    row.getCell(4).value = issue.natureLabel;
    row.getCell(5).value = issue.categoryLabel;
    row.getCell(6).value = issue.statusLabel;
    row.getCell(7).value = issue.impactQuality;
    row.getCell(8).value = issue.impactCustomer;
    row.getCell(9).value = issue.impactOverall;
    row.getCell(10).value = issue.priorityLabel;
    row.getCell(11).value = issue.addedManually ? "Oui" : "Non";
    row.getCell(12).value = issue.corrected ? "Oui" : "Non";
    styleDataRow(sheet, index + 2, ISSUE_COLUMNS.length);
  });
}

/**
 * Builds the .xlsx workbook for the "Analyse des enjeux" register: one
 * summary sheet, one register sheet (all issues, whatever their status —
 * matching ContextDocument.synthesis), and one external factors sheet when
 * the module actually produced any (step 2 completed).
 */
export function buildContextRegisterWorkbook(doc: ContextDocument): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "GetQhse AI";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Synthèse");
  summary.columns = [
    { header: "Champ", key: "field", width: 32 },
    { header: "Valeur", key: "value", width: 48 },
  ];
  styleHeader(summary, 1, 2);
  const summaryRows: [string, string][] = [
    ["Organisation", doc.organizationName],
    ["Projet", doc.projectName],
    ["Référentiel", doc.isoStandard],
    ["Méthode", doc.methodLabel],
    ["Résumé de la méthode", doc.methodSummary],
    ["Date de l'analyse", doc.analysisDate ?? "—"],
    ["Généré le", doc.generatedOn],
    ["Enjeux au total", String(doc.summary.issues)],
    ["Retenus", String(doc.summary.retained)],
    ["Non retenus", String(doc.summary.notRetained)],
    ["À examiner", String(doc.summary.pending)],
    ["Ajoutés manuellement", String(doc.summary.manual)],
    ["Corrigés par un expert", String(doc.summary.corrected)],
    ["Facteurs externes documentés", String(doc.summary.factors)],
    ["Sources externes citées", String(doc.summary.sources)],
  ];
  summaryRows.forEach(([field, value], index) => {
    const row = summary.getRow(index + 2);
    row.getCell(1).value = field;
    row.getCell(2).value = value;
    styleDataRow(summary, index + 2, 2);
  });

  writeIssueSheet(workbook.addWorksheet("Registre des enjeux"), doc.synthesis);

  if (doc.factors.length > 0) {
    const factorSheet = workbook.addWorksheet("Facteurs externes");
    factorSheet.columns = [
      { header: "Intitulé", key: "title", width: 32 },
      { header: "Catégorie", key: "categoryLabel", width: 20 },
      { header: "Description", key: "description", width: 40 },
      { header: "Lien avec l'organisation", key: "relevance", width: 40 },
      { header: "Sources", key: "publishers", width: 32 },
    ];
    styleHeader(factorSheet, 1, 5);
    doc.factors.forEach((factor, index) => {
      const row = factorSheet.getRow(index + 2);
      row.getCell(1).value = factor.title;
      row.getCell(2).value = factor.categoryLabel;
      row.getCell(3).value = factor.description;
      row.getCell(4).value = factor.relevance;
      row.getCell(5).value = factor.publishers.join(", ") || "—";
      styleDataRow(factorSheet, index + 2, 5);
    });
  }

  return workbook;
}
