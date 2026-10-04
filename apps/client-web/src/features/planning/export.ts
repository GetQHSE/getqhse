import type { PlanningModule, PlanningVersion } from "@qhse/contracts";
import { clientApi } from "../../app/client-api.js";
import { downloadBlob } from "../context/export/download.js";
import fr from "../../locales/fr/planning.js";
import en from "../../locales/en/planning.js";
import ar from "../../locales/ar/planning.js";
export function planningExportContent(v: PlanningVersion) {
  const l = { fr, en, ar }[v.sources.facts.language],
    d = v.document;
  const title =
    v.kind === "policy"
      ? l.policySteps[2]!
      : v.kind === "objectives"
        ? l.policySteps[3]!
        : l.processesTitle;
  const meta = `${v.sources.facts.organizationName} · ${v.sources.facts.projectName} · ${l.version} ${v.version} · ${l.validated} ${v.createdAt}`;
  const axes = new Map(d.axes.map((a) => [a.id, a.title]));
  const headers =
    v.kind === "objectives"
      ? [
          l.axis,
          l.title,
          l.indicator,
          l.target,
          l.method,
          l.unit,
          l.baseline,
          l.deadline,
          l.frequency,
          l.owner,
        ]
      : [l.title, l.family, l.pilotName, l.pilotRole, l.purpose, l.inputs, l.outputs];
  const rows =
    v.kind === "objectives"
      ? d.objectives
          .filter((x) => x.decision === "retained")
          .map((x) => [
            axes.get(x.axisId) ?? "",
            x.title,
            x.indicator,
            x.target,
            x.method,
            x.unit,
            x.baseline,
            x.deadline,
            x.frequency,
            x.owner,
          ])
      : d.processes
          .filter((x) => x.decision === "retained")
          .map((x) => [
            x.title,
            l[x.family],
            x.pilotName,
            x.pilotRole,
            x.purpose,
            x.inputs,
            x.outputs,
          ]);
  const names = new Map(d.processes.map((p) => [p.id, p.title]));
  const interactions = d.interactions
    .filter((x) => x.decision === "retained")
    .map((x) => [names.get(x.from) ?? "", x.flow, names.get(x.to) ?? ""]);
  return { l, title, meta, headers, rows, interactions };
}
export async function exportPlanning(
  projectId: string,
  module: PlanningModule,
  v: PlanningVersion,
  format: "docx" | "pdf" | "xlsx",
) {
  const { l, title, meta, headers, rows, interactions } = planningExportContent(v),
    d = v.document,
    rtl = v.sources.facts.language === "ar";
  const file = `qms-${v.kind}-v${v.version}`;
  if (format === "xlsx")
    return downloadBlob(
      new Blob([await clientApi.exportPlanningExcel(projectId, module, v.id)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      file + ".xlsx",
    );
  if (format === "docx") {
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel } =
      await import("docx");
    const p = (text: string, heading = false) =>
      new Paragraph({
        bidirectional: rtl,
        ...(heading ? { heading: HeadingLevel.HEADING_1 } : {}),
        children: [new TextRun({ text, font: "Arial", rightToLeft: rtl })],
      });
    const table = (head: string[], body: string[][]) =>
      new Table({
        visuallyRightToLeft: rtl,
        rows: [head, ...body].map(
          (r) => new TableRow({ children: r.map((s) => new TableCell({ children: [p(s)] })) }),
        ),
      });
    const children = [p(title, true), p(meta)];
    if (v.kind === "policy")
      children.push(
        ...d.statement.split("\n").map((s) => p(s)),
        p(`${d.directions.signatoryName} · ${d.directions.signatoryRole}`),
      );
    const tables = v.kind === "policy" ? [] : [table(headers, rows)];
    if (v.kind === "processes") tables.push(table([l.from, l.flow, l.to], interactions));
    const doc = new Document({
      sections: [
        {
          children: [...children, ...tables, p(l.scope, true), p(v.sources.scope?.statement ?? "")],
        },
      ],
    });
    return downloadBlob(await Packer.toBlob(doc), file + ".docx");
  }
  if (rtl) throw new Error("PLANNING_PDF_ARABIC_UNAVAILABLE");
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: v.kind === "policy" ? "portrait" : "landscape" });
  let y = 18;
  const add = (text: string, size = 10) => {
    pdf.setFontSize(size);
    for (const line of pdf.splitTextToSize(
      text || " ",
      pdf.internal.pageSize.getWidth() - 36,
    ) as string[]) {
      if (y > pdf.internal.pageSize.getHeight() - 18) {
        pdf.addPage();
        y = 18;
      }
      pdf.text(line, 18, y);
      y += size === 16 ? 8 : 5;
    }
    y += 4;
  };
  add(title, 16);
  add(meta, 9);
  if (v.kind === "policy") {
    add(d.statement);
    add(`${d.directions.signatoryName} · ${d.directions.signatoryRole}`);
  } else {
    const { default: autoTable } = await import("jspdf-autotable");
    if (v.kind === "processes") {
      pdf.setFillColor(237, 233, 254);
      pdf.roundedRect(18, y, 261, 12, 2, 2, "F");
      pdf.setFontSize(10);
      pdf.text(l.globalInput, 148.5, y + 8, { align: "center" });
      y += 20;
      // Family lanes paginate; every process remains visible in larger maps.
      for (const family of ["management", "realization", "support"] as const) {
        const items = d.processes.filter((x) => x.decision === "retained" && x.family === family);
        const chunks = Array.from({ length: Math.max(1, Math.ceil(items.length / 4)) }, (_, i) =>
          items.slice(i * 4, i * 4 + 4),
        );
        for (const chunk of chunks) {
          const texts = chunk.map((p) => pdf.splitTextToSize(p.title, 44) as string[]);
          const height = Math.max(22, ...texts.map((lines) => lines.length * 4 + 8));
          if (y + height > 175) {
            pdf.addPage();
            y = 18;
            add(title, 14);
          }
          pdf.setFillColor(248, 250, 252);
          pdf.roundedRect(18, y, 261, height, 2, 2, "F");
          pdf.setFontSize(9);
          pdf.setTextColor(24, 32, 51);
          pdf.text(l[family], 22, y + 10);
          chunk.forEach((p, i) => {
            const x = 70 + i * 52;
            pdf.setFillColor(255, 255, 255);
            pdf.setDrawColor(203, 213, 225);
            pdf.roundedRect(x, y + 2, 49, height - 4, 2, 2, "FD");
            pdf.text(texts[i] ?? [], x + 3, y + 7);
          });
          y += height + 7;
        }
      }
      if (y > 180) {
        pdf.addPage();
        y = 18;
      }
      pdf.setFillColor(220, 252, 231);
      pdf.roundedRect(18, y, 261, 12, 2, 2, "F");
      pdf.text(l.globalOutput, 148.5, y + 8, { align: "center" });
      pdf.addPage();
      y = 18;
      add(l.pilots, 14);
    }
    autoTable(pdf, {
      startY: y,
      head: [headers],
      body: rows,
      styles: { fontSize: 8, cellPadding: 3 },
      margin: { left: 18, right: 18 },
    });
    if (v.kind === "processes") {
      pdf.addPage();
      y = 18;
      add(l.processSteps[1]!, 14);
      autoTable(pdf, {
        startY: 30,
        head: [[l.from, l.flow, l.to]],
        body: interactions,
        styles: { fontSize: 9 },
        margin: { left: 18, right: 18 },
      });
    }
  }
  pdf.save(file + ".pdf");
}
