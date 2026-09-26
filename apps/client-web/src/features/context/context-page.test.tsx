import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clientApi } from "../../app/client-api.js";
import { ContextPage } from "./context-page.js";
import { INTERNAL_CONTEXT_SECTIONS } from "./internal-context-questions.js";

vi.mock("../../app/client-api.js", () => ({
  clientApi: {
    project: vi.fn(),
    regulatoryWatch: vi.fn(),
    contextSettings: vi.fn(),
    setContextMethods: vi.fn(),
    contextInternalInputs: vi.fn(),
    saveContextInternalInputs: vi.fn(),
    contextScope: vi.fn(),
    contextExternalRuns: vi.fn(),
    contextExternalFactors: vi.fn(),
    triggerContextExternalResearch: vi.fn(),
    contextAnalysisRuns: vi.fn(),
    triggerContextSynthesis: vi.fn(),
    contextIssues: vi.fn(),
    contextInternalIssues: vi.fn(),
    triggerContextInternalIssues: vi.fn(),
    validateContextSynthesis: vi.fn(),
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

type Method = "SWOT" | "PESTEL";

function stubEmptyModule(methods: Method[] = ["SWOT", "PESTEL"]) {
  vi.mocked(clientApi.project).mockResolvedValue({ id: "project-1", language: "fr" } as never);
  vi.mocked(clientApi.contextSettings).mockResolvedValue({
    projectId: "project-1",
    analysisMethods: methods,
  });
  vi.mocked(clientApi.contextScope).mockResolvedValue({
    projectName: "Usine Nord",
    organizationName: "Groupe Nord",
    isoStandard: "ISO_9001",
    activity: "Emboutissage",
    countries: ["Maroc"],
  });
  vi.mocked(clientApi.contextInternalInputs).mockResolvedValue([]);
  vi.mocked(clientApi.contextInternalIssues).mockResolvedValue([]);
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
    questionLabel: question.questionKey,
    answerText: index === 0 ? "Plutôt bon, quelques tensions" : `Réponse ${index + 1}`,
    status: "completed",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  })),
);

function issue(overrides: Record<string, unknown> = {}) {
  return {
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
    scores: {},
    selectedPriority: false,
    reviewStatus: "PENDING" as const,
    humanOverride: false,
    humanReviewedAt: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    sourceKind: "AI" as const,
    createdAt: "2026-09-01T00:00:00.000Z",
    evidence: [
      {
        id: "ev-1",
        sourceType: "declared_fact",
        originKind: "SYSTEM" as const,
        sourceUrl: null,
        excerpt: "Rotation du personnel : élevée",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    corrections: [],
    ...overrides,
  };
}

const internalIssue = issue();
const validatedForce = issue({
  id: "issue-2",
  title: "Expertise métier élevée",
  nature: "force",
  reviewStatus: "VALIDATED",
});

function externalFactor(
  id: string,
  categoryKey: string,
  categoryLabel: string,
  orientation: string,
  sourceOrigin = "web_research",
) {
  return {
    id,
    runId: "external-run-1",
    categoryKey,
    categoryLabel,
    title: `Facteur ${id}`,
    description: `Description ${id}`,
    relevanceToCompany: "Lien direct avec l’activité.",
    influenceOnObjectives: null,
    influenceOnQuality: null,
    influenceOnCustomerSatisfaction: null,
    geographicScope: null,
    orientation,
    evidenceStrength: "solide",
    confidence: 0.8,
    sourceOrigin,
    regulatoryEntryId: null,
    canonicalKey: id,
    comparisonStatus: null,
    model: null,
    generatedAt: "2026-09-02T00:00:00.000Z",
    sources: [],
  };
}

const factors = [
  externalFactor("f1", "economique", "Économique", "favorable"),
  externalFactor("f2", "technologique", "Technologique", "defavorable"),
  externalFactor("f3", "legal", "Légal", "incertain", "regulatory"),
];

function externalRun(analysisMethods: Method[]) {
  return {
    id: "external-run-1",
    status: "COMPLETED" as const,
    createdAt: "2026-09-02T00:00:00.000Z",
    startedAt: "2026-09-02T00:00:00.000Z",
    completedAt: "2026-09-02T00:05:00.000Z",
    errorMessage: null,
    model: null,
    factorsCount: factors.length,
    sourcesCount: 0,
    searchQueries: [],
    regulatoryRunId: null,
    analysisMethods,
  };
}

function synthesisRun(validatedAt: string | null = null) {
  return {
    id: "syn-1",
    kind: "SYNTHESIS" as const,
    status: "COMPLETED" as const,
    createdAt: "2026-09-03T00:00:00.000Z",
    startedAt: "2026-09-03T00:00:00.000Z",
    completedAt: "2026-09-03T00:05:00.000Z",
    errorMessage: null,
    issuesCount: 1,
    internalCount: 1,
    externalCount: 0,
    model: null,
    methodologyVersion: "issues-v3",
    analysisMethods: ["SWOT", "PESTEL"] as Method[],
    validatedAt,
  };
}

/** Tabs 1 and 2 done: answers, a validated internal issue, a current external analysis. */
function stubReadyForSynthesis(methods: Method[] = ["SWOT", "PESTEL"]) {
  stubEmptyModule(methods);
  vi.mocked(clientApi.contextInternalInputs).mockResolvedValue(completedInputs);
  vi.mocked(clientApi.contextInternalIssues).mockResolvedValue([validatedForce]);
  vi.mocked(clientApi.contextExternalRuns).mockResolvedValue([externalRun(["SWOT", "PESTEL"])]);
  vi.mocked(clientApi.contextExternalFactors).mockResolvedValue(factors);
}

const ratedIssue = issue({ id: "syn-issue-1", runId: "syn-1", scores: { impact: 3, mastery: 1 } });

describe("ContextPage — tab 1, contexte interne", () => {
  it("asks every question first, with the counter", async () => {
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

  it("once answered, shows the declared facts and deduces the internal issues on demand", async () => {
    stubEmptyModule();
    vi.mocked(clientApi.contextInternalInputs).mockResolvedValue(completedInputs);
    vi.mocked(clientApi.triggerContextInternalIssues).mockResolvedValue({
      runId: "int-1",
      status: "DRAFT",
    } as never);
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText("L’Assistant QHSE transforme vos réponses en enjeux exploitables"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Informations déclarées utilisées pour l’analyse")).toBeInTheDocument();
    expect(screen.getByText(/Climat social : Plutôt bon, quelques tensions/)).toBeInTheDocument();
    expect(screen.getByText("Votre contexte interne est prêt à être analysé")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Générer les enjeux internes" }));
    await waitFor(() =>
      expect(clientApi.triggerContextInternalIssues).toHaveBeenCalledWith("project-1"),
    );
  });

  it("shows each deduced issue with its fact, validated one by one through the audited review", async () => {
    stubEmptyModule();
    vi.mocked(clientApi.contextInternalInputs).mockResolvedValue(completedInputs);
    vi.mocked(clientApi.contextInternalIssues).mockResolvedValue([internalIssue]);
    vi.mocked(clientApi.applyContextIssueOverride).mockResolvedValue({
      ...internalIssue,
      reviewStatus: "VALIDATED",
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Résultats du contexte interne")).toBeInTheDocument(),
    );
    expect(screen.getByText("Fait utilisé · Rotation du personnel : élevée")).toBeInTheDocument();
    expect(screen.getByText("0/1 enjeux validés")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Valider" }));

    await waitFor(() =>
      expect(clientApi.applyContextIssueOverride).toHaveBeenCalledWith("project-1", "issue-1", {
        reviewStatus: "VALIDATED",
        correctionReason: "Enjeu interne validé par la revue humaine.",
      }),
    );
    await waitFor(() => expect(screen.getByText("1/1 enjeux validés")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "✓ Validé" })).toBeInTheDocument();
  });
});

describe("ContextPage — tab 2, analyse externe", () => {
  it("selects SWOT and PESTEL by default and never lets both go", async () => {
    stubEmptyModule();
    vi.mocked(clientApi.contextInternalInputs).mockResolvedValue(completedInputs);
    vi.mocked(clientApi.contextInternalIssues).mockResolvedValue([validatedForce]);
    vi.mocked(clientApi.setContextMethods).mockResolvedValue({
      projectId: "project-1",
      analysisMethods: ["PESTEL"],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("Méthode d’analyse")).toBeInTheDocument());
    expect(screen.getByText("Deux analyses indépendantes seront générées")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Générer les analyses →" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: /^SWOT/ }));
    await waitFor(() =>
      expect(clientApi.setContextMethods).toHaveBeenCalledWith("project-1", {
        methods: ["PESTEL"],
      }),
    );
    await waitFor(() => expect(screen.getByText("Une analyse sera générée")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /^PESTEL/ }));
    expect(clientApi.setContextMethods).toHaveBeenCalledTimes(1);
  });

  it("shows the SWOT matrix and the PESTEL grid as two separate analyses", async () => {
    stubReadyForSynthesis();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /2\. Analyse externe/ }));

    await waitFor(() => expect(screen.getByText("Matrice SWOT")).toBeInTheDocument());
    const swot = within(screen.getByText("Matrice SWOT").closest("section")!);
    expect(swot.getByText("Expertise métier élevée")).toBeInTheDocument();
    expect(swot.getByText("Facteur f1")).toBeInTheDocument();
    expect(swot.getByText("Facteur f2")).toBeInTheDocument();

    const pestel = within(
      screen.getByRole("heading", { name: "Analyse PESTEL" }).closest("section")!,
    );
    expect(pestel.getByRole("heading", { name: "Légal" })).toBeInTheDocument();
    expect(pestel.getByText("Facteur f3")).toBeInTheDocument();
    expect(screen.getByText("Analyse externe prête")).toBeInTheDocument();
  });

  it("clears the results once the selection differs from the analysis made", async () => {
    stubReadyForSynthesis(["SWOT"]);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /2\. Analyse externe/ }));

    await waitFor(() => expect(screen.getByText("Analyse externe à générer")).toBeInTheDocument());
    expect(screen.queryByText("Matrice SWOT")).not.toBeInTheDocument();
  });
});

describe("ContextPage — tab 3, synthèse des enjeux", () => {
  it("has three tabs, as in the template", async () => {
    stubReadyForSynthesis();
    renderPage();

    await waitFor(() => expect(screen.getByText("3. Synthèse des enjeux")).toBeInTheDocument());
    const steps = within(screen.getByRole("navigation", { name: "Étapes de l’analyse" }));
    expect(steps.getAllByRole("button")).toHaveLength(3);
  });

  it("blocks the synthesis until an internal issue is validated in tab 1", async () => {
    stubReadyForSynthesis();
    vi.mocked(clientApi.contextInternalIssues).mockResolvedValue([internalIssue]);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /3\. Synthèse des enjeux/ }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Validez au moins un enjeu interne à l’étape 1 : la synthèse part des enjeux retenus.",
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Lancer la synthèse des enjeux" })).toBeDisabled();
  });

  it("shows the evaluation table, qualified by impact × capacité de maîtrise", async () => {
    stubReadyForSynthesis();
    vi.mocked(clientApi.contextAnalysisRuns).mockResolvedValue([synthesisRun()]);
    vi.mocked(clientApi.contextIssues).mockResolvedValue([ratedIssue]);
    renderPage();

    await waitFor(() => expect(screen.getByText("Tableau d’évaluation")).toBeInTheDocument());
    const row = within(screen.getByRole("row", { name: /Rotation élevée du personnel/ }));
    expect(row.getByText("Interne")).toBeInTheDocument();
    expect(row.getByText("Majeur")).toBeInTheDocument();
  });

  it("re-qualifies a row at once when a rating changes, through the audited override", async () => {
    stubReadyForSynthesis();
    vi.mocked(clientApi.contextAnalysisRuns).mockResolvedValue([synthesisRun()]);
    vi.mocked(clientApi.contextIssues).mockResolvedValue([ratedIssue]);
    vi.mocked(clientApi.applyContextIssueOverride).mockResolvedValue({
      ...ratedIssue,
      scores: { impact: 1, mastery: 1 },
    });
    renderPage();

    const impact = await screen.findByRole("combobox", {
      name: "Impact qualité & satisfaction client — Rotation élevée du personnel",
    });
    await userEvent.selectOptions(impact, "1");

    const row = within(screen.getByRole("row", { name: /Rotation élevée du personnel/ }));
    await waitFor(() => expect(row.getByText("À surveiller")).toBeInTheDocument());
    expect(clientApi.applyContextIssueOverride).toHaveBeenCalledWith("project-1", "syn-issue-1", {
      scores: { impact: 1, mastery: 1 },
      correctionReason: "Cotation modifiée dans le tableau d’évaluation.",
    });
  });

  it("« Valider la synthèse » validates the latest synthesis, which unlocks the export", async () => {
    stubReadyForSynthesis();
    vi.mocked(clientApi.contextAnalysisRuns)
      .mockResolvedValueOnce([synthesisRun()])
      .mockResolvedValue([synthesisRun("2026-09-03T01:00:00.000Z")]);
    vi.mocked(clientApi.contextIssues).mockResolvedValue([ratedIssue]);
    vi.mocked(clientApi.validateContextSynthesis).mockResolvedValue(
      synthesisRun("2026-09-03T01:00:00.000Z"),
    );
    renderPage();

    expect(await screen.findByText("Validation requise pour exporter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exporter/ })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Valider la synthèse →" }));

    await waitFor(() =>
      expect(clientApi.validateContextSynthesis).toHaveBeenCalledWith("project-1"),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "✓ Synthèse validée" })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: /Exporter/ })).toBeEnabled();
  });
});

describe("ContextPage — gated on a published veille", () => {
  it("shows the veille gate, never the method choice or stepper, before any register is published", async () => {
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue(unpublishedWatch);

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/publiez d.abord votre veille réglementaire/i)).toBeInTheDocument(),
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

    await waitFor(() => expect(screen.getByText(/en cours d.analyse/i)).toBeInTheDocument());
  });

  it("opens the stepper once a register has been published", async () => {
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue(publishedWatch);
    stubEmptyModule();

    renderPage();

    await waitFor(() => expect(screen.getByText("1. Contexte interne")).toBeInTheDocument());
    expect(
      screen.queryByText(/publiez d.abord votre veille réglementaire/i),
    ).not.toBeInTheDocument();
  });
});
