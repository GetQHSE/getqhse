import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clientApi } from "../../app/client-api.js";
import { ContextPage } from "./context-page.js";
import { INTERNAL_CONTEXT_SECTIONS } from "./internal-context-questions.js";

vi.mock("../../app/client-api.js", () => ({
  clientApi: {
    regulatoryWatch: vi.fn(),
    contextSettings: vi.fn(),
    setContextMethod: vi.fn(),
    contextInternalInputs: vi.fn(),
    saveContextInternalInputs: vi.fn(),
    contextScope: vi.fn(),
    contextExternalRuns: vi.fn(),
    contextExternalFactors: vi.fn(),
    triggerContextExternalResearch: vi.fn(),
    contextAnalysisRuns: vi.fn(),
    triggerContextSynthesis: vi.fn(),
    contextIssues: vi.fn(),
    createManualContextIssue: vi.fn(),
    applyContextIssueOverride: vi.fn(),
    exportContextRegister: vi.fn(),
  },
}));

const publishedWatch = {
  id: "watch-1",
  projectId: "project-1",
  status: "ACTIVE" as const,
  revision: 3,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-09-10T00:00:00.000Z",
  currentAnalysis: null,
  currentBaseline: {
    id: "baseline-1",
    sequence: 1,
    profileSnapshotId: "snapshot-1",
    publishedAt: "2026-09-10T00:00:00.000Z",
    entries: [],
  },
  synchronization: {
    state: "IDLE" as const,
    trigger: null,
    sourceBaselineId: null,
    progressPercent: 0,
    lastCheckedAt: null,
    lastSuccessfulSyncAt: null,
  },
};

const unpublishedWatch = {
  ...publishedWatch,
  status: "NOT_STARTED" as const,
  currentBaseline: null,
};

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

beforeEach(() => {
  // Every module reads the veille first: default to a published register so
  // existing tests exercise the stepper, not the gate. The gate itself gets
  // its own describe block below, overriding this per test.
  vi.mocked(clientApi.regulatoryWatch).mockResolvedValue(publishedWatch);
  // jsdom has no layout: the form scrolls to the first missing answer.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function stubEmptyModule(explicit = true) {
  vi.mocked(clientApi.contextSettings).mockResolvedValue({
    projectId: "project-1",
    analysisMethod: "SWOT",
    explicit,
  });
  vi.mocked(clientApi.contextScope).mockResolvedValue({
    projectName: "Usine Nord",
    organizationName: "Groupe Nord",
    isoStandard: "ISO_9001",
    activity: "Emboutissage",
    countries: ["Maroc"],
  });
  vi.mocked(clientApi.contextInternalInputs).mockResolvedValue([]);
  vi.mocked(clientApi.contextExternalRuns).mockResolvedValue([]);
  vi.mocked(clientApi.contextExternalFactors).mockResolvedValue([]);
  vi.mocked(clientApi.contextAnalysisRuns).mockResolvedValue([]);
  vi.mocked(clientApi.contextIssues).mockResolvedValue([]);
}

const completedInputs = INTERNAL_CONTEXT_SECTIONS.flatMap((section) =>
  section.questions.map((question, index) => ({
    id: `input-${question.questionKey}`,
    projectId: "project-1",
    sectionKey: question.sectionKey,
    questionKey: question.questionKey,
    questionLabel: question.label,
    answerText: `Réponse ${index + 1}`,
    status: "completed",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  })),
);

const pendingIssue = {
  id: "issue-1",
  runId: "run-1",
  canonicalKey: "rotation-personnel",
  comparisonStatus: null,
  aiOrigin: "INTERNAL" as const,
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
  origin: "INTERNAL" as const,
  categoryKey: "ressources",
  categoryLabel: "Ressources",
  title: "Rotation élevée du personnel",
  description: "Le taux de rotation dépasse la moyenne du secteur.",
  nature: "faiblesse",
  impactQuality: null,
  impactCustomerSatisfaction: null,
  impactOverall: null,
  scores: { influenceObjectives: 3, influenceQuality: 4, influenceCustomer: 2, overall: 3 },
  selectedPriority: false,
  reviewStatus: "PENDING" as const,
  humanOverride: false,
  humanReviewedAt: null,
  updatedAt: "2026-09-01T00:00:00.000Z",
  sourceKind: "AI" as const,
  createdAt: "2026-09-01T00:00:00.000Z",
  evidence: [],
  corrections: [],
};

describe("ContextPage — step 1, the foundation's internal-context form", () => {
  it("shows every question at once with the foundation's counter", async () => {
    stubEmptyModule();
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText("Complétez le contexte interne de votre organisation"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("0 / 11 informations renseignées")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(11);
  });

  it("keeps an incomplete form as a draft when « Continuer » is pressed", async () => {
    stubEmptyModule();
    vi.mocked(clientApi.saveContextInternalInputs).mockResolvedValue([]);
    renderPage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Continuer" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Continuer" }));

    await waitFor(() =>
      expect(clientApi.saveContextInternalInputs).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({ status: "draft" }),
      ),
    );
    expect(
      screen.getByText("Complétez les informations manquantes avant de continuer."),
    ).toBeInTheDocument();
  });
});

describe("ContextPage — step 2", () => {
  it("opens on the external analysis once step 1 is completed, with the scope rows", async () => {
    stubEmptyModule();
    vi.mocked(clientApi.contextInternalInputs).mockResolvedValue(completedInputs);
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Analyse du contexte externe")).toBeInTheDocument(),
    );
    expect(screen.getByText("Groupe Nord")).toBeInTheDocument();
    expect(screen.getByText("Validé (étape 1)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lancer l’analyse externe" })).toBeEnabled();
  });

  it("blocks the launch until a method has been explicitly chosen", async () => {
    stubEmptyModule(false);
    vi.mocked(clientApi.contextInternalInputs).mockResolvedValue(completedInputs);
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText("Choisissez d’abord la méthode d’analyse SWOT ou PESTEL."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("SWOT (par défaut)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lancer l’analyse externe" })).toBeDisabled();
  });
});

describe("ContextPage — step 4", () => {
  it("validates an issue through the audited override with the foundation's reason", async () => {
    stubEmptyModule();
    vi.mocked(clientApi.contextInternalInputs).mockResolvedValue(completedInputs);
    vi.mocked(clientApi.contextIssues).mockResolvedValue([pendingIssue]);
    vi.mocked(clientApi.applyContextIssueOverride).mockResolvedValue({
      ...pendingIssue,
      reviewStatus: "VALIDATED",
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("Validation des enjeux")).toBeInTheDocument());
    expect(screen.getByText("Rotation élevée du personnel")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Valider cet enjeu" }));

    await waitFor(() =>
      expect(clientApi.applyContextIssueOverride).toHaveBeenCalledWith("project-1", "issue-1", {
        reviewStatus: "VALIDATED",
        correctionReason: "Enjeu validé par la revue humaine.",
      }),
    );
  });
});

describe("ContextPage — gated on a published veille", () => {
  it("shows the veille gate, never the method choice or stepper, before any register is published", async () => {
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue(unpublishedWatch);

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/publiez d'abord votre veille réglementaire/i)).toBeInTheDocument(),
    );
    expect(clientApi.contextSettings).not.toHaveBeenCalled();
    expect(screen.queryByText(/étapes de l’analyse/i)).not.toBeInTheDocument();
  });

  it("links to the regulatory-watch page to unblock the gate", async () => {
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue(unpublishedWatch);

    renderPage();

    await waitFor(() => expect(screen.getByRole("link")).toBeInTheDocument());
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/projects/project-1/regulatory-watch",
    );
  });

  it("names the veille's current status in the gate message", async () => {
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue({
      ...unpublishedWatch,
      status: "ANALYZING",
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/en cours d'analyse/i)).toBeInTheDocument());
  });

  it("opens the stepper once a register has been published", async () => {
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue(publishedWatch);
    vi.mocked(clientApi.contextSettings).mockResolvedValue({
      projectId: "project-1",
      analysisMethod: "SWOT",
      explicit: false,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText("1. Contexte interne")).toBeInTheDocument());
    expect(
      screen.queryByText(/publiez d'abord votre veille réglementaire/i),
    ).not.toBeInTheDocument();
  });
});
