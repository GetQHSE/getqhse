import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoRegister, RoItem } from "@qhse/contracts";
import { clientApi } from "../../app/client-api.js";
import { RoPage } from "./ro-page.js";
vi.mock("../../app/client-api.js", () => ({
  clientApi: {
    roRegister: vi.fn(),
    launchRo: vi.fn(),
    writeRo: vi.fn(),
    validateRo: vi.fn(),
    exportRoRegister: vi.fn(),
  },
}));
const item: RoItem = {
  id: "item",
  origin: "ai",
  source: null,
  aiProposal: null,
  reviewStatus: "VALIDATED",
  effective: {
    content: {
      type: "risk",
      title: "Erreurs de réparation",
      description: "Risque de défauts",
      causes: "Variation",
      consequences: "Réclamations",
      reasoning: "Enjeu retenu",
      confidence: 0.99,
    },
    rating: {
      probability: 2,
      impact: 3,
      feasibility: null,
      benefit: null,
      priority: "P3",
      reasoning: "Analyse",
    },
    ratingReviewed: true,
    controlsState: "existing",
    controls: ["Contrôle qualité"],
    controlsReviewed: true,
  },
  actions: [],
};
const register = (): RoRegister => ({
  projectId: "project-1",
  projectName: "Projet",
  organizationName: "Organisation",
  standard: "ISO_9001",
  language: "fr",
  revision: 0,
  outdated: false,
  validatedAt: null,
  sources: [],
  items: [structuredClone(item)],
  runs: [],
});
function mount() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/projects/project-1/risks"]}>
        <Routes>
          <Route path="/projects/:projectId/risks" element={<RoPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(clientApi.roRegister).mockResolvedValue(register());
});
describe("Connected six-step R&O flow", () => {
  it("does not generate on reading or navigating and keeps six steps", async () => {
    mount();
    await screen.findByRole("button", { name: /6. Registre final/ });
    expect(screen.queryByRole("button", { name: /Pilotage & efficacité/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /1. Sources/ }));
    expect(clientApi.launchRo).not.toHaveBeenCalled();
  });
  it("does not request actions for an item with existing controls", async () => {
    mount();
    await screen.findByRole("button", { name: /5. Plan d’actions/ });
    await userEvent.click(screen.getByRole("button", { name: /5. Plan d’actions/ }));
    expect(screen.getByRole("button", { name: "Proposer les actions" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Ajouter une action" })).not.toBeInTheDocument();
  });
  it("requires explicit final validation before exports", async () => {
    mount();
    await screen.findByRole("button", { name: "Valider l’ensemble du registre" });
    expect(screen.getByRole("button", { name: "Excel" })).toBeDisabled();
    vi.mocked(clientApi.validateRo).mockResolvedValue({
      ...register(),
      validatedAt: "2026-09-30T12:00:00Z",
    });
    await userEvent.click(screen.getByRole("button", { name: "Valider l’ensemble du registre" }));
    await waitFor(() => expect(clientApi.validateRo).toHaveBeenCalledWith("project-1"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Excel" })).toBeEnabled());
  });
  it("blocks exports for changed sources", async () => {
    vi.mocked(clientApi.roRegister).mockResolvedValue({
      ...register(),
      outdated: true,
      validatedAt: "2026-09-30T12:00:00Z",
    });
    mount();
    await screen.findByText(/Les sources ont changé/);
    await userEvent.click(screen.getByRole("button", { name: /6. Registre final/ }));
    expect(screen.getByRole("button", { name: "Excel" })).toBeDisabled();
  });
});
