import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { RegulatoryWatchTestPage } from "./regulatory-watch-test-page.js";

afterEach(cleanup);

describe("RegulatoryWatchTestPage", () => {
  it("shows the two requested regulatory-watch sections and their summary", () => {
    render(<RegulatoryWatchTestPage />);

    expect(screen.getByRole("heading", { name: "Veille réglementaire" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Liste des textes réglementaires et normatives/ }),
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
    expect(screen.getByText("26 exigences validées sur 36")).toBeInTheDocument();
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
