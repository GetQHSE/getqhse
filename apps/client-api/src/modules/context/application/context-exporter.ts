import ExcelJS from "exceljs";

import type { ContextDocument, ContextDocumentIssue } from "./context-document.js";
import { CONTEXT_EXPORT_LABELS } from "./context-export-labels.js";

type ExportLabels = (typeof CONTEXT_EXPORT_LABELS)[keyof typeof CONTEXT_EXPORT_LABELS];

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

function styleDataRow(sheet: ExcelJS.Worksheet, row: number, columns: number, rtl = false): void {
  for (let column = 1; column <= columns; column += 1) {
    const cell = sheet.getCell(row, column);
    cell.border = border;
    cell.alignment = { vertical: "top", horizontal: rtl ? "right" : "left", wrapText: true };
    cell.font = { name: "Arial", size: 9 };
  }
}

const ISSUE_COLUMNS = [
  { header: "title", key: "title", width: 32 },
  { header: "description", key: "description", width: 40 },
  { header: "origin", key: "originLabel", width: 14 },
  { header: "nature", key: "natureLabel", width: 14 },
  { header: "category", key: "categoryLabel", width: 20 },
  { header: "status", key: "statusLabel", width: 18 },
  { header: "impactQuality", key: "impactQuality", width: 24 },
  { header: "impactCustomer", key: "impactCustomer", width: 24 },
  { header: "impactOverall", key: "impactOverall", width: 24 },
  { header: "priority", key: "priorityLabel", width: 12 },
  { header: "manual", key: "addedManually", width: 12 },
  { header: "corrected", key: "corrected", width: 10 },
] as const;

function writeIssueSheet(
  sheet: ExcelJS.Worksheet,
  issues: ContextDocumentIssue[],
  labels: ExportLabels,
  rtl: boolean,
): void {
  sheet.columns = ISSUE_COLUMNS.map((column) => ({
    header: labels.columns[column.header],
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
    row.getCell(11).value = issue.addedManually ? labels.yes : labels.no;
    row.getCell(12).value = issue.corrected ? labels.yes : labels.no;
    styleDataRow(sheet, index + 2, ISSUE_COLUMNS.length, rtl);
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
  const labels = CONTEXT_EXPORT_LABELS[doc.language];
  // Arabic registers read right to left.
  const rtl = doc.language === "ar";
  const sheetOptions = rtl ? { views: [{ rightToLeft: true }] } : {};

  const summary = workbook.addWorksheet(labels.sheets.summary, sheetOptions);
  summary.columns = [
    { header: labels.columns.field, key: "field", width: 32 },
    { header: labels.columns.value, key: "value", width: 48 },
  ];
  styleHeader(summary, 1, 2);
  const summaryRows: [string, string][] = [
    [labels.summary.organization, doc.organizationName],
    [labels.summary.project, doc.projectName],
    [labels.summary.standard, doc.isoStandard],
    [labels.summary.method, doc.methodLabel],
    [labels.summary.methodSummary, doc.methodSummary],
    [labels.summary.analysisDate, doc.analysisDate ?? "—"],
    [labels.summary.generatedOn, doc.generatedOn],
    [labels.summary.issues, String(doc.summary.issues)],
    [labels.summary.retained, String(doc.summary.retained)],
    [labels.summary.notRetained, String(doc.summary.notRetained)],
    [labels.summary.pending, String(doc.summary.pending)],
    [labels.summary.manual, String(doc.summary.manual)],
    [labels.summary.corrected, String(doc.summary.corrected)],
    [labels.summary.factors, String(doc.summary.factors)],
    [labels.summary.sources, String(doc.summary.sources)],
  ];
  summaryRows.forEach(([field, value], index) => {
    const row = summary.getRow(index + 2);
    row.getCell(1).value = field;
    row.getCell(2).value = value;
    styleDataRow(summary, index + 2, 2, rtl);
  });

  writeIssueSheet(
    workbook.addWorksheet(labels.sheets.register, sheetOptions),
    doc.synthesis,
    labels,
    rtl,
  );

  if (doc.factors.length > 0) {
    const factorSheet = workbook.addWorksheet(labels.sheets.factors, sheetOptions);
    factorSheet.columns = [
      { header: labels.columns.title, key: "title", width: 32 },
      { header: labels.columns.category, key: "categoryLabel", width: 20 },
      { header: labels.columns.description, key: "description", width: 40 },
      { header: labels.columns.relevance, key: "relevance", width: 40 },
      { header: labels.columns.sources, key: "publishers", width: 32 },
    ];
    styleHeader(factorSheet, 1, 5);
    doc.factors.forEach((factor, index) => {
      const row = factorSheet.getRow(index + 2);
      row.getCell(1).value = factor.title;
      row.getCell(2).value = factor.categoryLabel;
      row.getCell(3).value = factor.description;
      row.getCell(4).value = factor.relevance;
      row.getCell(5).value = factor.publishers.join(", ") || "—";
      styleDataRow(factorSheet, index + 2, 5, rtl);
    });
  }

  return workbook;
}
