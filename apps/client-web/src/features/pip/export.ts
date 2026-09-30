import type { PipRegister } from "@qhse/contracts";
import { smqPip } from "@qhse/domain";
import { downloadBlob } from "../context/export/download.js";
import { clientApi } from "../../app/client-api.js";

export async function exportPip(register: PipRegister, format: "xlsx" | "docx" | "pdf") {
  if (
    !register.validatedAt ||
    !smqPip.computePipWorkflow(register.parties, register.evaluationMethod, register.outdated)
      .complete
  )
    throw new Error("PIP_REGISTER_INCOMPLETE");
  const labels = smqPip.PIP_EXPORT_LABELS[register.language];
  const rows = smqPip.pipRegisterRows(
    register.parties,
    register.evaluationMethod,
    register.language,
  );
  const meta = `${register.organizationName} · ${register.projectName} · ${register.standard} · ${register.validatedAt} · pip-v1`;
  if (format === "xlsx") {
    const buffer = await clientApi.exportPipRegister(register.projectId);
    return downloadBlob(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      "registre-pip.xlsx",
    );
  }
  if (format === "docx") {
    const { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell } =
      await import("docx");
    const rtl = register.language === "ar";
    const p = (value: string, heading?: typeof HeadingLevel.HEADING_1) =>
      new Paragraph({
        ...(heading ? { heading } : {}),
        bidirectional: rtl,
        children: [new TextRun({ text: value, font: "Arial", rightToLeft: rtl })],
      });
    const table = (row: string[]) =>
      new Table({
        visuallyRightToLeft: rtl,
        rows: row.map(
          (value, index) =>
            new TableRow({
              children: [
                new TableCell({ children: [p(labels.headers[index] ?? "")] }),
                new TableCell({ children: value.split("\n").map((line) => p(line)) }),
              ],
            }),
        ),
      });
    const doc = new Document({
      sections: [
        {
          children: [
            p(labels.title, HeadingLevel.HEADING_1),
            p(meta),
            ...rows.flatMap((row) => [p(row[0] ?? "", HeadingLevel.HEADING_1), table(row)]),
          ],
        },
      ],
    });
    return downloadBlob(await Packer.toBlob(doc), "registre-pip.docx");
  }
  if (register.language === "ar") throw new Error("PIP_PDF_ARABIC_UNAVAILABLE");
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF();
  doc.setFontSize(15);
  doc.text(labels.title, 14, 18);
  doc.setFontSize(9);
  doc.text(doc.splitTextToSize(meta, 180) as string[], 14, 26);
  rows.forEach((row, index) => {
    if (index > 0) doc.addPage();
    autoTable(doc, {
      startY: index === 0 ? 42 : 15,
      body: row.map((value, i) => [labels.headers[i] ?? "", value]),
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 48, fontStyle: "bold" } },
    });
  });
  downloadBlob(doc.output("blob"), "registre-pip.pdf");
}
