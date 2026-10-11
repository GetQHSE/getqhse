import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import type { ContextDocument, ContextDocumentIssue } from "./document.js";
import { buildContextPdfBlob } from "./pdf.js";
import { buildContextWordBlob } from "./word.js";

const issue: ContextDocumentIssue = {
  title: "Compétence technique concentrée",
  description: "La dépendance à une compétence unique fragilise la continuité du service.",
  originLabel: "Interne",
  originShort: "Interne",
  natureLabel: "Faiblesse",
  categoryLabel: "Ressources",
  statusLabel: "DECISION_PRIVATE",
  impactQuality: "Qualité",
  impactCustomer: "Client",
  impactOverall: "Continuité",
  impact: "3",
  mastery: "1",
  qualificationLabel: "Majeur",
  priorityLabel: "—",
  addedManually: false,
  corrected: false,
};
const doc: ContextDocument = {
  language: "fr",
  title: "Analyse des enjeux",
  organizationName: "Org",
  projectName: "Projet",
  isoStandard: "ISO_9001",
  generatedOn: "11/10/2026",
  methodLabel: "SWOT + PESTEL",
  methodSummary: "Analyse",
  analysisDate: "11/10/2026",
  internalIssues: [issue],
  factors: [],
  swot: [{ label: "Faiblesses", helper: "Interne", issues: [issue] }],
  pestel: [
    { label: "Économique", helper: "Externe", issues: [{ ...issue, natureLabel: "Menace" }] },
  ],
  synthesis: [issue],
  summary: {
    issues: 1,
    retained: 1,
    notRetained: 0,
    pending: 0,
    manual: 0,
    corrected: 0,
    factors: 0,
    sources: 0,
  },
};
function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () =>
      reject(new Error(reader.error?.message ?? "Unable to read generated export"));
    reader.readAsArrayBuffer(blob);
  });
}

describe("SWOT and PESTEL exports", () => {
  it("writes three-column Word tables without the user's review decision", async () => {
    // Read the actual document XML using the ZIP reader bundled with docx.
    const require = createRequire(import.meta.url);
    const docxRequire = createRequire(require.resolve("docx"));
    const zip = docxRequire("jszip") as {
      loadAsync(
        data: Uint8Array,
      ): Promise<{ file(name: string): { async(type: "string"): Promise<string> } | null }>;
    };
    const archive = await zip.loadAsync(await blobBytes(await buildContextWordBlob(doc)));
    const xml = await archive.file("word/document.xml")!.async("string");
    expect(xml).not.toContain("DECISION_PRIVATE");
    expect(xml).not.toContain("Évaluation / statut");
    const firstRow = xml.match(/<w:tr[ >][\s\S]*?<\/w:tr>/)?.[0] ?? "";
    expect(firstRow.match(/<w:tc>/g)).toHaveLength(3);
    expect(xml).toContain(issue.title);
  });
  it("writes a PDF without the user's review decision or assessment column", async () => {
    const pdf = Buffer.from(await blobBytes(await buildContextPdfBlob(doc))).toString("latin1");
    expect(pdf).toContain("%PDF");
    expect(pdf).toContain("Enjeu");
    expect(pdf).not.toContain("DECISION_PRIVATE");
    expect(pdf).not.toContain("valuation / statut");
  });
});
