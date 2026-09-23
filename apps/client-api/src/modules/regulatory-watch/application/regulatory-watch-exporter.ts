import type { SupportedLanguage } from "@qhse/contracts";
import ExcelJS from "exceljs";

export type RegulatoryExportEntry = {
  documentLabel: string;
  provisionIdentifier: string;
  sourceText: string;
  requirement: string;
  result: "CONFORMING" | "PARTIAL" | "NON_CONFORMING" | "NOT_ASSESSED";
  aiRationale?: string | null;
  aiRemediationPlan?: string | null;
  evidence: string[];
  comment: string | null;
  actions: Array<{
    title: string;
    assignee: string | null;
    resources: string | null;
    dueDate: string | null;
    completedDate: string | null;
    effectivenessCriteria: string | null;
    effectiveness: "PENDING" | "EFFECTIVE" | "INEFFECTIVE";
    comment: string | null;
  }>;
};

const border: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } },
};

type WorkbookLabels = {
  sheet: string;
  documentsTitle: string;
  documentsHeader: string;
  articlesHeader: string;
  evaluationTitle: string;
  headers: string[];
  result: Record<RegulatoryExportEntry["result"], string>;
  effectiveness: Record<RegulatoryExportEntry["actions"][number]["effectiveness"], string | null>;
  aiRationale: string;
  remediation: string;
  fullText: string;
  sourceToAttach: string;
  evidence: string;
};

/**
 * The French labels reproduce the customer’s “canevas module 1” template verbatim (including its
 * spelling and trailing spaces); the register is written in the project language.
 */
export const REGULATORY_WORKBOOK_LABELS: Record<SupportedLanguage, WorkbookLabels> = {
  fr: {
    sheet: "canevas module 1",
    documentsTitle: "Liste des textes réglementaires et normatives",
    documentsHeader: "Textes réglementaires et normatives ",
    articlesHeader: "Articles applicables",
    evaluationTitle: "EVALUATION REGLEMENTAIRE ET NORMATIVE ",
    headers: [
      "Textes réglementaires/Normes ",
      "Exigences applicables ",
      "conformité",
      "Preuve ",
      "Actions ",
      "responsables",
      "Ressources",
      "Date prévue ",
      "Date Réelle ",
      "Critères d'efficacité de l'action ",
      "Action efficace oui/non",
      "commentaire",
    ],
    result: {
      CONFORMING: "Conforme",
      PARTIAL: "Partiellement conforme",
      NON_CONFORMING: "Non conforme",
      NOT_ASSESSED: "À évaluer",
    },
    effectiveness: { PENDING: null, EFFECTIVE: "Oui", INEFFECTIVE: "Non" },
    aiRationale: "Analyse IA : ",
    remediation: "Mise en conformité : ",
    fullText: "Texte complet",
    sourceToAttach: "Source officielle à rattacher",
    evidence: "Preuve",
  },
  en: {
    sheet: "module 1 template",
    documentsTitle: "List of regulatory and normative texts",
    documentsHeader: "Regulatory and normative texts",
    articlesHeader: "Applicable articles",
    evaluationTitle: "REGULATORY AND NORMATIVE ASSESSMENT",
    headers: [
      "Regulatory texts/Standards",
      "Applicable requirements",
      "Compliance",
      "Evidence",
      "Actions",
      "Owners",
      "Resources",
      "Due date",
      "Actual date",
      "Action effectiveness criteria",
      "Effective action yes/no",
      "Comment",
    ],
    result: {
      CONFORMING: "Compliant",
      PARTIAL: "Partially compliant",
      NON_CONFORMING: "Non-compliant",
      NOT_ASSESSED: "To assess",
    },
    effectiveness: { PENDING: null, EFFECTIVE: "Yes", INEFFECTIVE: "No" },
    aiRationale: "AI analysis: ",
    remediation: "Remediation: ",
    fullText: "Full text",
    sourceToAttach: "Official source to attach",
    evidence: "Evidence",
  },
  ar: {
    sheet: "نموذج الوحدة 1",
    documentsTitle: "قائمة النصوص التنظيمية والمعيارية",
    documentsHeader: "النصوص التنظيمية والمعيارية",
    articlesHeader: "المواد المطبَّقة",
    evaluationTitle: "التقييم التنظيمي والمعياري",
    headers: [
      "النصوص التنظيمية/المعايير",
      "المتطلبات المطبَّقة",
      "المطابقة",
      "الإثبات",
      "الإجراءات",
      "المسؤولون",
      "الموارد",
      "التاريخ المتوقع",
      "التاريخ الفعلي",
      "معايير فعالية الإجراء",
      "إجراء فعّال نعم/لا",
      "التعليق",
    ],
    result: {
      CONFORMING: "مطابق",
      PARTIAL: "مطابق جزئيًا",
      NON_CONFORMING: "غير مطابق",
      NOT_ASSESSED: "يجب تقييمه",
    },
    effectiveness: { PENDING: null, EFFECTIVE: "نعم", INEFFECTIVE: "لا" },
    aiRationale: "تحليل الذكاء الاصطناعي: ",
    remediation: "تحقيق المطابقة: ",
    fullText: "النص الكامل",
    sourceToAttach: "المصدر الرسمي يجب ربطه",
    evidence: "إثبات",
  },
};

function styleTitle(row: ExcelJS.Row, rtl = false): void {
  row.height = 22;
  for (let column = 1; column <= 7; column += 1) {
    const cell = row.getCell(column);
    cell.border = border;
    cell.alignment = {
      vertical: "middle",
      horizontal: column === 7 ? (rtl ? "right" : "left") : "center",
    };
    cell.font = {
      name: "Calibri",
      size: 11,
      bold: true,
      color: { argb: column === 7 ? "FF000000" : "FFFF0000" },
    };
  }
}

function styleHeader(
  sheet: ExcelJS.Worksheet,
  fromRow: number,
  fromColumn: number,
  toRow: number,
  toColumn: number,
  fontSize: number,
): void {
  for (let row = fromRow; row <= toRow; row += 1) {
    for (let column = fromColumn; column <= toColumn; column += 1) {
      const cell = sheet.getCell(row, column);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBF7" } };
      cell.border = border;
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.font = { name: fontSize === 12 ? "Calibri" : "Arial", size: fontSize, bold: true };
    }
  }
}

function styleData(
  sheet: ExcelJS.Worksheet,
  fromRow: number,
  fromColumn: number,
  toRow: number,
  toColumn: number,
  rtl = false,
): void {
  for (let row = fromRow; row <= toRow; row += 1) {
    for (let column = fromColumn; column <= toColumn; column += 1) {
      const cell = sheet.getCell(row, column);
      cell.border = border;
      cell.alignment = { vertical: "top", horizontal: rtl ? "right" : "left", wrapText: true };
      cell.font = { name: "Arial", size: 9 };
    }
  }
}

function isoDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function normalizeWhitespace(value: string): string {
  return value
    .normalize("NFC")
    .replaceAll("\u00a0", " ")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizedOfficialProvisionText(
  sourceText: string,
  provisionIdentifier: string,
): string {
  let text = normalizeWhitespace(sourceText);
  const escapedIdentifier = provisionIdentifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const identifierPrefix = new RegExp(`^${escapedIdentifier}(?:\\s*[:.\u2013\u2014-])?\\s*`, "iu");
  text = text.replace(identifierPrefix, "");
  const lines = text.split("\n");
  if (
    lines.length > 1 &&
    normalizeWhitespace(lines[0] ?? "").toLocaleLowerCase("fr") ===
      normalizeWhitespace((lines[1] ?? "").replace(identifierPrefix, "")).toLocaleLowerCase("fr")
  ) {
    lines.splice(1, 1);
    text = lines.join("\n");
  }
  return [provisionIdentifier, text].filter(Boolean).join("\n");
}

function dynamicRowHeight(values: Array<string | null | undefined>, widths: number[]): number {
  const lines = values.reduce((maximum, value, index) => {
    if (!value) return maximum;
    const explicitLines = value.split("\n");
    const width = Math.max(widths[index] ?? 20, 8);
    const estimated = explicitLines.reduce(
      (count, line) => count + Math.max(1, Math.ceil(line.length / width)),
      0,
    );
    return Math.max(maximum, estimated);
  }, 1);
  return Math.min(409, Math.max(24, lines * 13));
}

export async function buildRegulatoryWatchWorkbook(
  entries: readonly RegulatoryExportEntry[],
  language: SupportedLanguage = "fr",
): Promise<Buffer> {
  const labels = REGULATORY_WORKBOOK_LABELS[language];
  const rtl = language === "ar";
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "GetQHSE";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(labels.sheet, {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  const widths = [32, 20, 40, 22, 22, 20, 20, 16, 16, 24, 20, 24];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  sheet.mergeCells("A1:F1");
  sheet.getCell("A1").value = labels.documentsTitle;
  sheet.getCell("G1").value = "EN";
  styleTitle(sheet.getRow(1), rtl);

  sheet.mergeCells("A3:C3");
  sheet.mergeCells("D3:E3");
  sheet.getCell("A3").value = labels.documentsHeader;
  sheet.getCell("D3").value = labels.articlesHeader;
  styleHeader(sheet, 3, 1, 3, 5, 12);

  const grouped = new Map<string, RegulatoryExportEntry[]>();
  for (const entry of entries) {
    grouped.set(entry.documentLabel, [...(grouped.get(entry.documentLabel) ?? []), entry]);
  }
  const registerRows = Math.max(entries.length, 1);
  let rowIndex = 4;
  if (grouped.size === 0) {
    sheet.mergeCells(`A${rowIndex}:C${rowIndex}`);
    sheet.mergeCells(`D${rowIndex}:E${rowIndex}`);
    styleData(sheet, rowIndex, 1, rowIndex, 5, rtl);
  } else {
    for (const [documentLabel, provisions] of grouped) {
      const documentStart = rowIndex;
      const documentEnd = rowIndex + provisions.length - 1;
      sheet.mergeCells(`A${documentStart}:C${documentEnd}`);
      sheet.getCell(`A${documentStart}`).value = documentLabel;
      for (const provision of provisions) {
        sheet.mergeCells(`D${rowIndex}:E${rowIndex}`);
        const officialText = normalizedOfficialProvisionText(
          provision.sourceText,
          provision.provisionIdentifier,
        );
        sheet.getCell(`D${rowIndex}`).value = officialText;
        sheet.getRow(rowIndex).height = dynamicRowHeight([documentLabel, officialText], [32, 65]);
        styleData(sheet, rowIndex, 1, rowIndex, 5, rtl);
        rowIndex += 1;
      }
    }
  }

  const evaluationTitleRow = 4 + registerRows + 1;
  sheet.mergeCells(`A${evaluationTitleRow}:F${evaluationTitleRow}`);
  sheet.getCell(`A${evaluationTitleRow}`).value = labels.evaluationTitle;
  sheet.getCell(`G${evaluationTitleRow}`).value = "EN";
  styleTitle(sheet.getRow(evaluationTitleRow), rtl);

  const headerTop = evaluationTitleRow + 2;
  const headerBottom = headerTop + 1;
  labels.headers.forEach((header, index) => {
    const column = index + 1;
    sheet.mergeCells(headerTop, column, headerBottom, column);
    sheet.getCell(headerTop, column).value = header;
  });
  sheet.getRow(headerTop).height = 34;
  sheet.getRow(headerBottom).height = 34;
  styleHeader(sheet, headerTop, 1, headerBottom, 12, 9);

  let evaluationRow = headerBottom + 1;
  for (const entry of entries) {
    // The conformity pass writes its proposal into a real action, so there is nothing left to
    // synthesise here — the export shows the same plan the register does.
    const actions = entry.actions.length ? entry.actions : [null];
    for (const action of actions) {
      const row = sheet.getRow(evaluationRow);
      row.values = [
        entry.documentLabel,
        `${entry.provisionIdentifier}\n${entry.requirement}`.trim(),
        labels.result[entry.result],
        entry.evidence.length ? entry.evidence.join("\n") : null,
        action?.title ?? null,
        action?.assignee ?? null,
        action?.resources ?? null,
        isoDate(action?.dueDate ?? null),
        isoDate(action?.completedDate ?? null),
        action?.effectivenessCriteria ?? null,
        action ? labels.effectiveness[action.effectiveness] : null,
        [
          entry.comment,
          entry.aiRationale ? `${labels.aiRationale}${entry.aiRationale}` : null,
          entry.aiRemediationPlan ? `${labels.remediation}${entry.aiRemediationPlan}` : null,
          action?.comment,
        ]
          .filter(Boolean)
          .join("\n") || null,
      ];
      row.height = dynamicRowHeight(
        [
          entry.documentLabel,
          `${entry.provisionIdentifier}\n${entry.requirement}`,
          entry.evidence.join("\n"),
          action?.title,
          action?.resources,
          action?.effectivenessCriteria,
          [entry.comment, entry.aiRationale, entry.aiRemediationPlan, action?.comment]
            .filter(Boolean)
            .join("\n"),
        ],
        [32, 40, 22, 22, 20, 24, 24],
      );
      styleData(sheet, evaluationRow, 1, evaluationRow, 12, rtl);
      sheet.getCell(evaluationRow, 8).numFmt = "yyyy-mm-dd";
      sheet.getCell(evaluationRow, 9).numFmt = "yyyy-mm-dd";
      evaluationRow += 1;
    }
  }
  if (entries.length === 0) {
    sheet.getRow(evaluationRow).height = 24;
    styleData(sheet, evaluationRow, 1, evaluationRow, 12, rtl);
  }

  sheet.views = [{ state: "frozen", ySplit: headerBottom, rightToLeft: rtl }];
  sheet.autoFilter = { from: { row: headerTop, column: 1 }, to: { row: headerBottom, column: 12 } };
  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}
