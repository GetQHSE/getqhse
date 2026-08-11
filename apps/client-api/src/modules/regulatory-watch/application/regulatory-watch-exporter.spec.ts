import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { buildRegulatoryWatchWorkbook } from "./regulatory-watch-exporter.js";

describe("regulatory watch workbook export", () => {
  it("exports only the two MODULE1 regulatory sections with stable columns", async () => {
    const buffer = await buildRegulatoryWatchWorkbook([
      {
        documentLabel: "ISO 9001 — Système de management de la qualité",
        provisionIdentifier: "4.1",
        requirement: "Compréhension de l’organisme et de son contexte",
        result: "PARTIAL",
        evidence: ["Analyse de contexte.pdf", "Compte rendu de direction"],
        comment: "Revue annuelle à planifier",
        actions: [
          {
            title: "Actualiser l’analyse",
            assignee: "Responsable QHSE",
            resources: "Atelier de deux heures",
            dueDate: "2026-09-15",
            completedDate: null,
            effectivenessCriteria: "Validation en revue de direction",
            effectiveness: "PENDING",
            comment: null,
          },
          {
            title: "Faire valider la mise à jour",
            assignee: "Direction",
            resources: null,
            dueDate: "2026-09-30",
            completedDate: null,
            effectivenessCriteria: "Compte rendu signé",
            effectiveness: "EFFECTIVE",
            comment: "Prévu après la revue",
          },
        ],
      },
      {
        documentLabel: "ISO 9001 — Système de management de la qualité",
        provisionIdentifier: "4.2",
        requirement: "Besoins et attentes des parties intéressées",
        result: "NOT_ASSESSED",
        evidence: [],
        comment: null,
        actions: [],
      },
    ]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    expect(workbook.worksheets.map(({ name }) => name)).toEqual(["canevas module 1"]);
    const sheet = workbook.getWorksheet("canevas module 1")!;
    expect(sheet.getCell("A1").value).toBe("Liste des textes réglementaires et normatives");
    expect(sheet.getCell("A3").value).toBe("Textes réglementaires et normatives ");
    expect(sheet.getCell("D3").value).toBe("Articles applicables");
    expect(sheet.getCell("D4").value).toBe("4.1\n4.2");
    expect(sheet.getCell("A6").value).toBe("EVALUATION REGLEMENTAIRE ET NORMATIVE ");
    expect(sheet.getRow(8).values).toEqual([
      undefined,
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
    ]);
    expect(sheet.getCell("C10").value).toBe("Partiellement conforme");
    expect(sheet.getCell("D10").value).toBe("Analyse de contexte.pdf\nCompte rendu de direction");
    expect(sheet.getCell("E10").value).toBe("Actualiser l’analyse");
    expect(sheet.getCell("K11").value).toBe("Oui");
    expect(sheet.getCell("B12").value).toContain("4.2");
    expect(sheet.getCell("C12").value).toBe("À évaluer");
    expect(sheet.model.merges).toEqual(
      expect.arrayContaining(["A1:F1", "A3:C3", "D3:E3", "A6:F6", "A8:A9", "L8:L9"]),
    );
  });
});
