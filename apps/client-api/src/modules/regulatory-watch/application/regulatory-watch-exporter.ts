import ExcelJS from "exceljs";

export type RegulatoryExportEntry = {
  documentLabel: string;
  provisionIdentifier: string;
  requirement: string;
  result: "CONFORMING" | "PARTIAL" | "NON_CONFORMING" | "NOT_ASSESSED";
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

const resultLabels: Record<RegulatoryExportEntry["result"], string> = {
  CONFORMING: "Conforme",
  PARTIAL: "Partiellement conforme",
  NON_CONFORMING: "Non conforme",
  NOT_ASSESSED: "À évaluer",
};

const effectivenessLabels: Record<
  RegulatoryExportEntry["actions"][number]["effectiveness"],
  string | null
> = {
  PENDING: null,
  EFFECTIVE: "Oui",
  INEFFECTIVE: "Non",
};

function styleTitle(row: ExcelJS.Row): void {
  row.height = 22;
  for (let column = 1; column <= 7; column += 1) {
    const cell = row.getCell(column);
    cell.border = border;
    cell.alignment = { vertical: "middle", horizontal: column === 7 ? "left" : "center" };
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
): void {
  for (let row = fromRow; row <= toRow; row += 1) {
    for (let column = fromColumn; column <= toColumn; column += 1) {
      const cell = sheet.getCell(row, column);
      cell.border = border;
      cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      cell.font = { name: "Arial", size: 9 };
    }
  }
}

function isoDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export async function buildRegulatoryWatchWorkbook(
  entries: readonly RegulatoryExportEntry[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "GetQHSE";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("canevas module 1", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  const widths = [32, 20, 40, 22, 22, 20, 20, 16, 16, 24, 20, 24];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  sheet.mergeCells("A1:F1");
  sheet.getCell("A1").value = "Liste des textes réglementaires et normatives";
  sheet.getCell("G1").value = "EN";
  styleTitle(sheet.getRow(1));

  sheet.mergeCells("A3:C3");
  sheet.mergeCells("D3:E3");
  sheet.getCell("A3").value = "Textes réglementaires et normatives ";
  sheet.getCell("D3").value = "Articles applicables";
  styleHeader(sheet, 3, 1, 3, 5, 12);

  const grouped = new Map<string, string[]>();
  for (const entry of entries) {
    const identifiers = grouped.get(entry.documentLabel) ?? [];
    if (!identifiers.includes(entry.provisionIdentifier))
      identifiers.push(entry.provisionIdentifier);
    grouped.set(entry.documentLabel, identifiers);
  }
  const registerRows = Math.max(grouped.size, 1);
  let rowIndex = 4;
  if (grouped.size === 0) {
    sheet.mergeCells(`A${rowIndex}:C${rowIndex}`);
    sheet.mergeCells(`D${rowIndex}:E${rowIndex}`);
    styleData(sheet, rowIndex, 1, rowIndex, 5);
  } else {
    for (const [documentLabel, identifiers] of grouped) {
      sheet.mergeCells(`A${rowIndex}:C${rowIndex}`);
      sheet.mergeCells(`D${rowIndex}:E${rowIndex}`);
      sheet.getCell(`A${rowIndex}`).value = documentLabel;
      sheet.getCell(`D${rowIndex}`).value = identifiers.join("\n");
      sheet.getRow(rowIndex).height = Math.max(24, identifiers.length * 14);
      styleData(sheet, rowIndex, 1, rowIndex, 5);
      rowIndex += 1;
    }
  }

  const evaluationTitleRow = 4 + registerRows + 1;
  sheet.mergeCells(`A${evaluationTitleRow}:F${evaluationTitleRow}`);
  sheet.getCell(`A${evaluationTitleRow}`).value = "EVALUATION REGLEMENTAIRE ET NORMATIVE ";
  sheet.getCell(`G${evaluationTitleRow}`).value = "EN";
  styleTitle(sheet.getRow(evaluationTitleRow));

  const headerTop = evaluationTitleRow + 2;
  const headerBottom = headerTop + 1;
  const headers = [
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
  ];
  headers.forEach((header, index) => {
    const column = index + 1;
    sheet.mergeCells(headerTop, column, headerBottom, column);
    sheet.getCell(headerTop, column).value = header;
  });
  sheet.getRow(headerTop).height = 34;
  sheet.getRow(headerBottom).height = 34;
  styleHeader(sheet, headerTop, 1, headerBottom, 12, 9);

  let evaluationRow = headerBottom + 1;
  for (const entry of entries) {
    const actions = entry.actions.length ? entry.actions : [null];
    for (const action of actions) {
      const row = sheet.getRow(evaluationRow);
      row.values = [
        entry.documentLabel,
        `${entry.provisionIdentifier}\n${entry.requirement}`.trim(),
        resultLabels[entry.result],
        entry.evidence.length ? entry.evidence.join("\n") : null,
        action?.title ?? null,
        action?.assignee ?? null,
        action?.resources ?? null,
        isoDate(action?.dueDate ?? null),
        isoDate(action?.completedDate ?? null),
        action?.effectivenessCriteria ?? null,
        action ? effectivenessLabels[action.effectiveness] : null,
        [entry.comment, action?.comment].filter(Boolean).join("\n") || null,
      ];
      row.height = 48;
      styleData(sheet, evaluationRow, 1, evaluationRow, 12);
      sheet.getCell(evaluationRow, 8).numFmt = "yyyy-mm-dd";
      sheet.getCell(evaluationRow, 9).numFmt = "yyyy-mm-dd";
      evaluationRow += 1;
    }
  }
  if (entries.length === 0) {
    sheet.getRow(evaluationRow).height = 24;
    styleData(sheet, evaluationRow, 1, evaluationRow, 12);
  }

  sheet.views = [{ state: "frozen", ySplit: headerBottom }];
  sheet.autoFilter = { from: { row: headerTop, column: 1 }, to: { row: headerBottom, column: 12 } };
  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}
