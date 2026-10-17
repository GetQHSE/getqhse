import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DetailSheet,
  DocumentList,
  EvaluationList,
  RegulatoryWatchTestPage,
  type RegulatoryDocument,
  type RegulatoryEvaluation,
} from "./regulatory-watch-test-page.js";

afterEach(cleanup);

describe("regulatory links", () => {
  it("makes sources directly accessible on desktop and mobile without opening document details", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    const document: RegulatoryDocument = {
      id: "law-1",
      kind: "REGULATION",
      reference: "Loi 09-08",
      title: "Protection des données",
      jurisdiction: "Maroc",
      provisions: "Article 1",
      requirements: 1,
      source: "Texte officiel",
      sourceUrl: "https://example.ma/law",
      status: "APPLICABLE",
      reason: "Applicable à l’organisme",
    };
    const { container } = render(<DocumentList onOpen={onOpen} items={[document]} />);
    const links = screen.getAllByRole("link", { name: "Consulter la source" });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", document.sourceUrl);
      await user.click(link);
    }
    expect(onOpen).not.toHaveBeenCalled();
    expect(container.querySelector("button a")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Loi 09-08" }));
    expect(onOpen).toHaveBeenCalledWith(document);
  });

  it("links evidence, notes, and action text in both evaluation layouts and the detail sheet", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    const evaluation: RegulatoryEvaluation = {
      id: "evaluation-1",
      source: "Loi 09-08",
      sourceUrl: "https://example.ma/law",
      provision: "Article 1",
      requirement: "Appliquer https://example.ma/requirement.",
      status: "PARTIAL",
      evidence: "Dossier",
      action: "Voir https://example.ma/action",
      owner: "Qualité",
      dueDate: "—",
      effectiveness: "À vérifier",
      evidenceItems: [
        {
          id: "link-1",
          kind: "LINK",
          fileId: null,
          label: "Dossier partagé",
          url: "www.example.ma/evidence",
          note: "Annexe https://example.ma/annex.",
        },
        {
          id: "note-1",
          kind: "NOTE",
          fileId: null,
          label: "Procédure",
          url: null,
          note: "https://example.ma/procedure",
        },
      ],
    };
    const { container, unmount } = render(<EvaluationList onOpen={onOpen} items={[evaluation]} />);
    expect(screen.getAllByRole("link", { name: "Dossier partagé" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "https://example.ma/procedure" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "https://example.ma/annex" })).toHaveLength(2);
    for (const link of screen.getAllByRole("link", { name: "Dossier partagé" })) {
      await user.click(link);
    }
    expect(onOpen).not.toHaveBeenCalled();
    expect(container.querySelector("button a")).toBeNull();
    screen.getByRole("button", { name: /Loi 09-08 · Article 1 · Appliquer/ }).focus();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(evaluation);
    unmount();
    render(<DetailSheet document={null} evaluation={evaluation} onOpenChange={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Dossier partagé" })).toHaveAttribute(
      "href",
      "https://www.example.ma/evidence",
    );
    expect(screen.getByRole("link", { name: "https://example.ma/action" })).toHaveAttribute(
      "href",
      "https://example.ma/action",
    );
    expect(screen.getByRole("link", { name: "Consulter la source" })).toHaveAttribute(
      "href",
      evaluation.sourceUrl,
    );
  });
});

describe("RegulatoryWatchTestPage", () => {
  it("shows the two requested regulatory-watch sections and their summary", () => {
    render(<RegulatoryWatchTestPage />);

    expect(screen.getByRole("heading", { name: "Veille réglementaire" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Liste des textes réglementaires et normatifs/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Évaluation réglementaire et normative/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("ISO 9001:2015").length).toBeGreaterThan(0);
    expect(screen.getAllByText("72 %").length).toBeGreaterThan(0);
  });

  it("supports filtering documents, opening details, and viewing evaluations", async () => {
    const user = userEvent.setup();
    render(<RegulatoryWatchTestPage />);

    await user.type(screen.getByLabelText("Rechercher un texte"), "ISO 9001");
    expect(screen.getAllByText("Systèmes de management de la qualité").length).toBeGreaterThan(0);
    expect(screen.queryByText("Code du travail")).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Voir ISO 9001:2015" })[0]!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Pourquoi ce texte est proposé")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("tab", { name: /Évaluation réglementaire et normative/ }));
    expect(screen.getByText("26 exigences évaluées sur 36")).toBeInTheDocument();
    expect(screen.getAllByText(/Clause 7\.1\.5/).length).toBeGreaterThan(0);
  });

  it("provides visible feedback for prototype analysis and export actions", async () => {
    const user = userEvent.setup();
    render(<RegulatoryWatchTestPage />);

    await user.click(screen.getByRole("button", { name: "Actualiser l’analyse" }));
    expect(screen.getByRole("button", { name: "Analyse actualisée" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Exporter en Excel" }));
    expect(screen.getByRole("button", { name: "Export préparé" })).toBeInTheDocument();
  });
});
