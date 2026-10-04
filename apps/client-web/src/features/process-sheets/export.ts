import type { ProcessSheetVersion } from "@qhse/contracts";
import fr from "../../locales/fr/sheets.js";
import en from "../../locales/en/sheets.js";
import ar from "../../locales/ar/sheets.js";
import planningFr from "../../locales/fr/planning.js";
import planningEn from "../../locales/en/planning.js";
import planningAr from "../../locales/ar/planning.js";
import { downloadBlob } from "../context/export/download.js";
export interface SheetSection {
  title: string;
  paragraphs: string[];
  headers: string[] | null;
  rows: string[][];
}
export function processSheetExportSections(v: ProcessSheetVersion) {
  const material = v.sourceSnapshot,
    s = material.sources,
    c = v.content,
    l = { fr, en, ar }[s.facts.language],
    p = { fr: planningFr, en: planningEn, ar: planningAr }[s.facts.language];
  const process = s.map?.processes.find((x) => x.id === v.processId);
  if (!process) throw new Error("SHEET_PROCESS_SNAPSHOT_REQUIRED");
  const names = new Map(s.map?.processes.map((x) => [x.id, x.title]));
  const sections: SheetSection[] = [
    {
      title: l.sheet,
      paragraphs: [],
      headers: [p.title, l.code, p.version, l.date, l.authorName, l.approverName],
      rows: [
        [process.title, l.codePending, String(v.version), c.date, c.authorName, c.approverName],
      ],
    },
    {
      title: p.purpose,
      paragraphs: [
        c.purpose,
        `${p.family}: ${p[process.family]}`,
        `${p.pilotName}: ${process.pilotName} · ${process.pilotRole}`,
        `${p.inputs}: ${c.inputs}`,
        `${p.outputs}: ${c.outputs}`,
      ],
      headers: null,
      rows: [],
    },
    { title: l.description, paragraphs: [c.description], headers: null, rows: [] },
    {
      title: l.activities,
      paragraphs: [],
      headers: [l.activity, l.activityInput, l.activityOutput],
      rows: c.activities
        .filter((a) => a.decision === "retained")
        .map((a) => [a.activity, a.input, a.output]),
    },
    {
      title: l.interactions,
      paragraphs: [],
      headers: [p.from, l.activityInput, l.activityOutput, p.to],
      rows: (s.map?.interactions ?? [])
        .filter((i) => i.from === process.id || i.to === process.id)
        .map((i) => [
          names.get(i.from) ?? "",
          i.to === process.id ? i.flow : "",
          i.from === process.id ? i.flow : "",
          names.get(i.to) ?? "",
        ]),
    },
    {
      title: l.kpiLinks,
      paragraphs: [],
      headers: [l.strategic, l.operational, l.kpi],
      rows: c.kpiLinks.map((k) => [
        k.objectiveId
          ? (s.objectives.find((o) => o.id === k.objectiveId)?.title ?? "")
          : k.strategicLabel,
        k.operational,
        k.kpi,
      ]),
    },
    {
      title: l.risks,
      paragraphs: s.facts.risks.filter((r) => c.riskIds.includes(r.id)).map((r) => r.title),
      headers: null,
      rows: [],
    },
    {
      title: l.requirements,
      paragraphs: s.facts.requirements
        .filter((r) => c.requirementIds.includes(r.id))
        .map((r) => r.partyName + ": " + r.text),
      headers: null,
      rows: [],
    },
    { title: l.notes, paragraphs: [c.notes], headers: null, rows: [] },
    {
      title: l.sources,
      paragraphs: [
        `${l.processVersion}: ${s.map?.version}`,
        `${l.objectiveVersion}: ${s.objectivesVersion ?? p.pending}`,
        `${l.approval}: ${v.validatedAt}`,
      ],
      headers: null,
      rows: [],
    },
  ];
  return {
    title: `${l.sheet} — ${process.title}`,
    entity: `${s.facts.organizationName} · ${s.facts.projectName}`,
    code: l.codePending,
    l,
    p,
    sections,
  };
}
export async function exportProcessSheet(v: ProcessSheetVersion, format: "docx" | "pdf") {
  const { title, entity, code, sections } = processSheetExportSections(v),
    rtl = v.sourceSnapshot.sources.facts.language === "ar";
  const file = `process-sheet-v${v.version}-${v.id}`;
  if (format === "docx") {
    const {
      Document,
      Packer,
      Paragraph,
      TextRun,
      Table,
      TableRow,
      TableCell,
      WidthType,
      HeadingLevel,
    } = await import("docx");
    const p = (text: string, heading = false) =>
      new Paragraph({
        bidirectional: rtl,
        ...(heading ? { heading: HeadingLevel.HEADING_2 } : {}),
        children: [new TextRun({ text, font: "Arial", rightToLeft: rtl })],
      });
    const table = (head: string[], rows: string[][]) =>
      new Table({
        visuallyRightToLeft: rtl,
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [head, ...rows].map(
          (row, i) =>
            new TableRow({
              tableHeader: i === 0,
              children: row.map((text) => new TableCell({ children: [p(text)] })),
            }),
        ),
      });
    const doc = new Document({
      sections: [
        {
          children: [
            table([entity, title, code], []),
            ...sections.flatMap((s) => [
              p(s.title, true),
              ...s.paragraphs.map((text) => p(text)),
              ...(s.headers ? [table(s.headers, s.rows)] : []),
            ]),
          ],
        },
      ],
    });
    return downloadBlob(await Packer.toBlob(doc), file + ".docx");
  }
  if (rtl) throw new Error("SHEET_PDF_ARABIC_UNAVAILABLE");
  const { jsPDF } = await import("jspdf"),
    { default: autoTable } = await import("jspdf-autotable");
  const pdf = new jsPDF();
  const header = () => {
    pdf.setFontSize(8);
    pdf.setTextColor(24, 32, 51);
    pdf.setDrawColor(203, 213, 225);
    pdf.rect(14, 10, 182, 20);
    pdf.line(65, 10, 65, 30);
    pdf.line(151, 10, 151, 30);
    pdf.text(pdf.splitTextToSize(entity, 45) as string[], 17, 16);
    pdf.text(pdf.splitTextToSize(title, 80) as string[], 68, 16);
    pdf.setFontSize(7);
    pdf.text(pdf.splitTextToSize(code, 39) as string[], 154, 15);
  };
  header();
  let y = 40;
  const add = (text: string, size = 9) => {
    pdf.setFontSize(size);
    for (const line of pdf.splitTextToSize(text || " ", 178) as string[]) {
      if (y > 275) {
        pdf.addPage();
        header();
        y = 40;
      }
      pdf.text(line, 16, y);
      y += size === 11 ? 6 : 4.5;
    }
    y += 4;
  };
  for (const section of sections) {
    if (y > 258) {
      pdf.addPage();
      header();
      y = 40;
    }
    add(section.title, 11);
    for (const text of section.paragraphs) add(text);
    if (section.headers) {
      autoTable(pdf, {
        startY: y,
        head: [section.headers],
        body: section.rows,
        styles: { fontSize: 8, cellPadding: 2 },
        margin: { top: 38, left: 14, right: 14, bottom: 16 },
        didDrawPage: () => header(),
        didDrawCell: (data) => {
          if (data.section === "body" || data.section === "head")
            y = Math.max(y, data.cell.y + data.cell.height + 7);
        },
      });
      y = (pdf as typeof pdf & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }
  }
  pdf.save(file + ".pdf");
}
