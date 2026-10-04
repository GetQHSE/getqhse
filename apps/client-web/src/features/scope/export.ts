import type { ScopeStatement } from "@qhse/contracts";
import fr from "../../locales/fr/scope.js";
import en from "../../locales/en/scope.js";
import ar from "../../locales/ar/scope.js";
import { downloadBlob } from "../context/export/download.js";
export function scopeExportSections(version: ScopeStatement) {
  const { facts, declaration: d, verification: v } = version.sourceSnapshot;
  const labels = { fr, en, ar }[facts.language].export;
  const exclusions = [
    ...(v.applicability === "not_applicable"
      ? version.nonApplicable.map((n) => `ISO 9001 §${n.clause}: ${n.justification}`)
      : [labels.designApplicable, labels.noExclusion]),
    ...(d.activitiesInclusion === "exclude_some"
      ? [`${labels.activityExclusions}: ${d.excludedActivities}\n${d.activitiesReason}`]
      : []),
    ...(d.productsInclusion === "exclude_some"
      ? [`${labels.productExclusions}: ${d.excludedProducts}\n${d.productsReason}`]
      : []),
  ];
  const bodies = [
    version.statement,
    d.sites.map((s) => `${s.name}${s.type ? ` (${s.type})` : ""} — ${s.address}`).join("\n"),
    `${labels.activities}: ${d.activities}\n${labels.products}: ${d.products}`,
    exclusions.join("\n"),
    `${labels.sources}\n${facts.profile.map((p) => `${p.key}: ${p.value}`).join("\n")}\n${facts.issues.map((i) => i.title).join("\n")}\n${facts.requirements.map((r) => `${r.partyName}: ${r.text}`).join("\n")}\n${facts.risks.map((i) => i.title).join("\n")}\n${labels.justification}: ${v.justification}`,
  ];
  return {
    labels,
    sections: labels.sections.map((title, i) => ({ title, body: bodies[i] ?? "" })),
    meta: `${facts.organizationName} · ${facts.projectName} · ${facts.standard} · ${labels.version} ${version.version} · ${labels.validated} ${version.validatedAt} · ${labels.method} scope-v1`,
  };
}
export async function exportScope(version: ScopeStatement, format: "docx" | "pdf") {
  if (version.status !== "VALIDATED") throw new Error("SCOPE_VALIDATED_VERSION_REQUIRED");
  const { labels, sections, meta } = scopeExportSections(version);
  if (format === "docx") {
    const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");
    const rtl = version.sourceSnapshot.facts.language === "ar";
    const p = (
      text: string,
      heading?: typeof HeadingLevel.HEADING_1 | typeof HeadingLevel.HEADING_2,
    ) =>
      new Paragraph({
        ...(heading ? { heading } : {}),
        bidirectional: rtl,
        children: [new TextRun({ text, font: "Arial", rightToLeft: rtl })],
      });
    const doc = new Document({
      sections: [
        {
          children: [
            p(labels.title, HeadingLevel.HEADING_1),
            p(meta),
            ...sections.flatMap((s) => [
              p(s.title, HeadingLevel.HEADING_2),
              ...s.body.split("\n").map((line) => p(line)),
            ]),
          ],
        },
      ],
    });
    return downloadBlob(await Packer.toBlob(doc), `qms-scope-v${version.version}.docx`);
  }
  if (version.sourceSnapshot.facts.language === "ar")
    throw new Error("SCOPE_PDF_ARABIC_UNAVAILABLE");
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  let y = 20;
  const add = (text: string, size: number) => {
    pdf.setFontSize(size);
    for (const line of pdf.splitTextToSize(text || " ", 174) as string[]) {
      if (y > 275) {
        pdf.addPage();
        y = 20;
      }
      pdf.text(line, 18, y);
      y += size === 16 ? 8 : 5;
    }
    y += 5;
  };
  add(labels.title, 16);
  add(meta, 9);
  for (const section of sections) {
    add(section.title, 12);
    add(section.body, 10);
  }
  pdf.save(`qms-scope-v${version.version}.pdf`);
}
