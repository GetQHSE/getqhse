import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { buildRegulatoryWatchWorkbook } from "./regulatory-watch-exporter.js";

describe("regulatory watch workbook export", () => {
  it("exports only the two MODULE1 regulatory sections with stable columns", async () => {
    const buffer = await buildRegulatoryWatchWorkbook([
      {
        documentLabel: "ISO 9001 — Système de management de la qualité",
        provisionIdentifier: "4.1",
        sourceText:
          "4.1 Compréhension de l’organisme et de son contexte\n4.1 Compréhension de l’organisme et de son contexte\nL’organisme doit déterminer les enjeux externes et internes pertinents.",
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
        sourceText:
          "4.2 Compréhension des besoins et des attentes des parties intéressées\nL’organisme doit déterminer les parties intéressées pertinentes.",
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
    const officialCell = sheet.getCell("D4").value;
    if (typeof officialCell !== "string") throw new Error("Expected a string official-text cell");
    expect(officialCell).toContain("4.1\nCompréhension de l’organisme et de son contexte");
    expect(officialCell.match(/Compréhension de l’organisme/g)).toHaveLength(1);
    expect(sheet.getCell("D5").value).toContain(
      "4.2\nCompréhension des besoins et des attentes des parties intéressées",
    );
    expect(sheet.getCell("A7").value).toBe("EVALUATION REGLEMENTAIRE ET NORMATIVE ");
    expect(sheet.getRow(9).values).toEqual([
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
    expect(sheet.getCell("C11").value).toBe("Partiellement conforme");
    expect(sheet.getCell("D11").value).toBe("Analyse de contexte.pdf\nCompte rendu de direction");
    expect(sheet.getCell("E11").value).toBe("Actualiser l’analyse");
    expect(sheet.getCell("K12").value).toBe("Oui");
    expect(sheet.getCell("B13").value).toContain("4.2");
    expect(sheet.getCell("C13").value).toBe("À évaluer");
    const requirementCell = sheet.getCell("B11").value;
    if (typeof requirementCell !== "string") throw new Error("Expected a string requirement cell");
    expect(requirementCell).not.toContain("L’organisme doit déterminer les enjeux externes");
    expect(sheet.model.merges).toEqual(
      expect.arrayContaining([
        "A1:F1",
        "A3:C3",
        "D3:E3",
        "A4:C5",
        "D4:E4",
        "D5:E5",
        "A7:F7",
        "A9:A10",
        "L9:L10",
      ]),
    );
  });

  it("writes the register in the project language, right to left for Arabic", async () => {
    const entry = {
      documentLabel: "Labour Code",
      provisionIdentifier: "Article 24",
      sourceText: "Article 24\nThe employer shall ensure the safety of workers.",
      requirement: "Ensure the safety of workers",
      result: "CONFORMING" as const,
      evidence: [],
      comment: null,
      actions: [],
    };
    const english = new ExcelJS.Workbook();
    await english.xlsx.load((await buildRegulatoryWatchWorkbook([entry], "en")) as never);
    const englishSheet = english.worksheets[0]!;
    expect(englishSheet.getCell("A1").value).toBe("List of regulatory and normative texts");
    expect(englishSheet.getCell("C10").value).toBe("Compliant");

    const arabic = new ExcelJS.Workbook();
    await arabic.xlsx.load((await buildRegulatoryWatchWorkbook([entry], "ar")) as never);
    const arabicSheet = arabic.worksheets[0]!;
    expect(arabicSheet.getCell("A1").value).toBe("قائمة النصوص التنظيمية والمعيارية");
    expect(arabicSheet.views[0]?.rightToLeft).toBe(true);
  });
});
