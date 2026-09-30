import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PipRegister, PipParty } from "@qhse/contracts";
import { clientApi } from "../../app/client-api.js";
import { PipPage } from "./pip-page.js";
vi.mock("../../app/client-api.js", () => ({
  clientApi: {
    pipRegister: vi.fn(),
    launchPip: vi.fn(),
    reviewPip: vi.fn(),
    allocatePip: vi.fn(),
    addPipParty: vi.fn(),
    addPipRequirement: vi.fn(),
    answerPip: vi.fn(),
    validatePip: vi.fn(),
  },
}));
const content: PipParty["content"] = {
  name: "Entreprises clientes",
  category: "Clients",
  scope: "external",
  description: "Clients de l’organisation",
  relevance: "relevant",
  confidence: 0.99,
  reasoning: "Profil validé",
  evidence: [{ sourceType: "profile", reference: null, excerpt: "Vente aux entreprises" }],
};
const party: PipParty = {
  id: "party-1",
  origin: "ai",
  content,
  aiProposal: content,
  reviewStatus: "PENDING",
  requirements: [],
  evaluation: null,
};
function register(parties: PipParty[] = [structuredClone(party)]): PipRegister {
  return {
    projectId: "project-1",
    projectName: "Projet qualité",
    organizationName: "Organisation",
    standard: "ISO_9001",
    language: "fr",
    evaluationMethod: "both",
    revision: 0,
    outdated: false,
    validatedAt: null,
    parties,
    runs: [],
    clarifications: [],
  };
}
function mount() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/projects/project-1/interested-parties"]}>
        <Routes>
          <Route path="/projects/:projectId/interested-parties" element={<PipPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(clientApi.pipRegister).mockResolvedValue(register());
});
describe("PIP connected flow", () => {
  it("does not launch AI on load or on navigation, and confidence never implies validation", async () => {
    mount();
    expect(await screen.findByText("Entreprises clientes")).toBeInTheDocument();
    expect(screen.getByText("Confiance IA 99 %")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Valider" })).toBeInTheDocument();
    expect(clientApi.launchPip).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /4\. Évaluation/ }));
    expect(screen.getByRole("button", { name: "Lancer l’évaluation" })).toBeDisabled();
    expect(clientApi.launchPip).not.toHaveBeenCalled();
  });
  it("saves party review to the real API and updates the register", async () => {
    vi.mocked(clientApi.reviewPip).mockResolvedValue(
      register([{ ...party, reviewStatus: "VALIDATED" }]),
    );
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Valider" }));
    await waitFor(() =>
      expect(clientApi.reviewPip).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({
          entityType: "party",
          entityId: "party-1",
          reviewStatus: "VALIDATED",
        }),
      ),
    );
    expect(await screen.findByRole("button", { name: "Réouvrir" })).toBeInTheDocument();
  });
  it("cannot finalise or export unreviewed proposals", async () => {
    mount();
    await screen.findByText("Entreprises clientes");
    await userEvent.click(screen.getByRole("button", { name: /5\. Registre final/ }));
    expect(screen.getByRole("button", { name: "Valider le registre final" })).toBeDisabled();
    for (const name of ["Excel", "Word", "PDF"])
      expect(screen.getByRole("button", { name })).toBeDisabled();
  });
  it("keeps exports disabled after upstream changes", async () => {
    const data = register([{ ...party, reviewStatus: "VALIDATED" }]);
    data.validatedAt = "2026-09-30T12:00:00Z";
    data.outdated = true;
    vi.mocked(clientApi.pipRegister).mockResolvedValue(data);
    mount();
    expect(await screen.findByText(/Les données en amont ont changé/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /5\. Registre final/ }));
    expect(screen.getByRole("button", { name: "Excel" })).toBeDisabled();
  });
  it("allows an explicit no-function decision for a retained requirement", async () => {
    const requirement: PipParty["requirements"][number] = {
      id: "req-1",
      origin: "ai",
      content: {
        kind: "qms_requirement",
        text: "Respect des délais",
        reasoning: "Engagement client",
        sourceType: "customer",
        regulatoryEntryId: null,
        sourceLabel: null,
        sourceUrl: null,
      },
      aiProposal: null,
      reviewStatus: "VALIDATED",
      services: [],
      allocationReviewed: false,
      noServiceConfirmed: false,
    };
    const data = register([{ ...party, reviewStatus: "VALIDATED", requirements: [requirement] }]);
    vi.mocked(clientApi.pipRegister).mockResolvedValue(data);
    vi.mocked(clientApi.allocatePip).mockResolvedValue(
      register([
        {
          ...data.parties[0]!,
          requirements: [{ ...requirement, allocationReviewed: true, noServiceConfirmed: true }],
        },
      ]),
    );
    mount();
    await screen.findByText("Respect des délais");
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: /Aucune fonction concernée/ }),
    );
    await userEvent.type(
      within(dialog).getByLabelText("Motif de la décision"),
      "Décision professionnelle motivée",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(clientApi.allocatePip).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({ requirementId: "req-1", services: [], noServiceConfirmed: true }),
      ),
    );
  });
  it("starts generation only from its button and displays a running state", async () => {
    const data = register([]);
    vi.mocked(clientApi.pipRegister)
      .mockResolvedValueOnce(data)
      .mockResolvedValue({
        ...data,
        runs: [
          {
            id: "run-1",
            stage: "INVENTORY",
            status: "DRAFT",
            createdAt: "2026-09-30T12:00:00Z",
            completedAt: null,
            errorMessage: null,
            methodologyVersion: "pip-v1",
            model: null,
          },
        ],
      });
    vi.mocked(clientApi.launchPip).mockResolvedValue({ runId: "run-1" });
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Générer le pré-inventaire" }));
    expect(await screen.findByText(/Analyse en cours/)).toBeInTheDocument();
    expect(clientApi.launchPip).toHaveBeenCalledTimes(1);
  });
});
