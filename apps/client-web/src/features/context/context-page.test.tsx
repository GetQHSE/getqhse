import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clientApi } from "../../app/client-api.js";
import { ContextPage } from "./context-page.js";

vi.mock("../../app/client-api.js", () => ({
  clientApi: {
    contextSettings: vi.fn(),
    setContextMethod: vi.fn(),
    contextInternalInputs: vi.fn(),
    upsertContextInternalInput: vi.fn(),
    contextExternalRuns: vi.fn(),
    triggerContextExternalResearch: vi.fn(),
    contextAnalysisRuns: vi.fn(),
    triggerContextSynthesis: vi.fn(),
    contextIssues: vi.fn(),
    createManualContextIssue: vi.fn(),
    applyContextIssueOverride: vi.fn(),
    exportContextRegister: vi.fn(),
  },
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/projects/project-1/context"]}>
        <Routes>
          <Route path="/projects/:projectId/context" element={<ContextPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ContextPage — method not yet chosen", () => {
  it("offers SWOT and PESTEL, and never shows the stepper before a choice is made", async () => {
    vi.mocked(clientApi.contextSettings).mockResolvedValue({
      projectId: "project-1",
      analysisMethod: "SWOT",
      explicit: false,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/choisissez la méthode d'analyse/i)).toBeInTheDocument(),
    );
    expect(screen.getByText("SWOT")).toBeInTheDocument();
    expect(screen.getByText("PESTEL")).toBeInTheDocument();
    expect(screen.queryByText("Contexte interne")).not.toBeInTheDocument();
  });

  it("persists the chosen method and only then reveals the stepper", async () => {
    vi.mocked(clientApi.contextSettings).mockResolvedValueOnce({
      projectId: "project-1",
      analysisMethod: "SWOT",
      explicit: false,
    });
    vi.mocked(clientApi.setContextMethod).mockResolvedValue({
      projectId: "project-1",
      analysisMethod: "PESTEL",
      explicit: true,
    });
    vi.mocked(clientApi.contextSettings).mockResolvedValueOnce({
      projectId: "project-1",
      analysisMethod: "PESTEL",
      explicit: false,
    });
    vi.mocked(clientApi.contextSettings).mockResolvedValue({
      projectId: "project-1",
      analysisMethod: "PESTEL",
      explicit: true,
    });
    vi.mocked(clientApi.contextInternalInputs).mockResolvedValue([]);

    renderPage();
    await waitFor(() => expect(screen.getByText("PESTEL")).toBeInTheDocument());
    await userEvent.click(screen.getByText("PESTEL"));

    expect(clientApi.setContextMethod).toHaveBeenCalledWith("project-1", { method: "PESTEL" });
  });
});

describe("ContextPage — method already chosen", () => {
  it("opens on step 1 and shows the declared internal-context questionnaire, never AI-generated", async () => {
    vi.mocked(clientApi.contextSettings).mockResolvedValue({
      projectId: "project-1",
      analysisMethod: "SWOT",
      explicit: true,
    });
    vi.mocked(clientApi.contextInternalInputs).mockResolvedValue([]);

    renderPage();

    await waitFor(() => expect(screen.getByText("Culture et valeurs")).toBeInTheDocument());
    expect(screen.getByText(/Déclaré par vous : GetQhse ne génère rien ici/i)).toBeInTheDocument();
  });

  it("moves to step 4 and shows the register once issues exist", async () => {
    vi.mocked(clientApi.contextSettings).mockResolvedValue({
      projectId: "project-1",
      analysisMethod: "SWOT",
      explicit: true,
    });
    vi.mocked(clientApi.contextInternalInputs).mockResolvedValue([]);
    vi.mocked(clientApi.contextIssues).mockResolvedValue([
      {
        id: "issue-1",
        runId: "run-1",
        canonicalKey: "rotation-personnel",
        comparisonStatus: null,
        aiOrigin: "INTERNAL",
        aiCategoryKey: "ressources",
        aiCategoryLabel: "Ressources",
        aiTitle: "Rotation élevée du personnel",
        aiDescription: "Le taux de rotation dépasse la moyenne du secteur.",
        aiReasoning: null,
        aiNature: "faiblesse",
        aiImpactQuality: null,
        aiImpactCustomerSatisfaction: null,
        aiImpactOverall: null,
        aiScores: {},
        aiConfidence: null,
        aiRecommendedPriority: false,
        aiModel: "gpt-5-mini",
        aiGeneratedAt: "2026-09-01T00:00:00.000Z",
        origin: "INTERNAL",
        categoryKey: "ressources",
        categoryLabel: "Ressources",
        title: "Rotation élevée du personnel",
        description: "Le taux de rotation dépasse la moyenne du secteur.",
        nature: "faiblesse",
        impactQuality: null,
        impactCustomerSatisfaction: null,
        impactOverall: null,
        scores: {},
        selectedPriority: false,
        reviewStatus: "PENDING",
        humanOverride: false,
        humanReviewedAt: null,
        updatedAt: "2026-09-01T00:00:00.000Z",
        sourceKind: "AI",
        createdAt: "2026-09-01T00:00:00.000Z",
        evidence: [],
        corrections: [],
      },
    ]);

    renderPage();
    await waitFor(() => expect(screen.getByText("4. Validation")).toBeInTheDocument());
    await userEvent.click(screen.getByText("4. Validation"));

    await waitFor(() =>
      expect(screen.getByText("Rotation élevée du personnel")).toBeInTheDocument(),
    );
    expect(screen.getByText("À examiner")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retenir/i })).toBeInTheDocument();
  });
});
