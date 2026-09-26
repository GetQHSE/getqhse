import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TemplateMockPage, type MockBundle } from "./template-mock-page.js";

const bundle: MockBundle = {
  defaults: { filter: "all" },
  html: [
    `<div class="pip-wrap"><h1>Étape 1 · toutes</h1>
      <button data-mock="variant:filter=retained">Retenues</button>
      <button data-mock="step:2">2. Besoins</button></div>`,
    `<div class="pip-wrap"><h1>Étape 1 · retenues</h1></div>`,
    `<div class="pip-wrap"><h1>Étape 2</h1>
      <button data-mock="modal:rating-r1">Ajuster</button>
      <button data-mock="toast:Export simulé">Excel</button></div>`,
  ],
  snapshots: [
    { step: 1, params: { filter: "all" }, html: 0 },
    { step: 1, params: { filter: "retained" }, html: 1 },
    { step: 2, params: {}, html: 2 },
  ],
  modals: {
    "rating-r1": `<div class="cot-modal"><h3>Ajuster la cotation</h3>
      <button data-mock="close-toast:Cotation mise à jour">Valider</button></div>`,
  },
};

function renderMock() {
  return render(
    <MemoryRouter>
      <TemplateMockPage bundle={bundle} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // jsdom has no layout: a step change scrolls the mock back to its top.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("TemplateMockPage", () => {
  it("opens on the default variant of step 1 and switches variants locally", async () => {
    renderMock();
    expect(screen.getByRole("heading", { name: "Étape 1 · toutes" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retenues" }));
    expect(screen.getByRole("heading", { name: "Étape 1 · retenues" })).toBeInTheDocument();
  });

  it("plays step tabs, modals and toasts without leaving the page", async () => {
    renderMock();
    await userEvent.click(screen.getByRole("button", { name: "2. Besoins" }));
    expect(screen.getByRole("heading", { name: "Étape 2" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Ajuster" }));
    expect(screen.getByRole("heading", { name: "Ajuster la cotation" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Valider" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Ajuster la cotation" })).toBeNull(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Cotation mise à jour");
  });
});
