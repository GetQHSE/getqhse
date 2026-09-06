import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clientApi } from "../../app/client-api.js";
import { DataPage, RegulatoryWatchPage } from "./regulatory-watch-page.js";

vi.mock("../../app/client-api.js", () => ({
  clientApi: {
    projectProfile: vi.fn(),
    regulatoryWatch: vi.fn(),
    startRegulatoryAnalysis: vi.fn(),
    answerRegulatoryClarifications: vi.fn(),
    decideRegulatoryCandidate: vi.fn(),
    decideRegulatoryCandidates: vi.fn(),
    publishRegulatoryBaseline: vi.fn(),
    startRegulatoryEvaluation: vi.fn(),
    updateRegulatoryEvaluation: vi.fn(),
    addRegulatoryAction: vi.fn(),
    updateRegulatoryAction: vi.fn(),
    addRegulatoryEvidence: vi.fn(),
    updateRegulatoryEvidence: vi.fn(),
    deleteRegulatoryEvidence: vi.fn(),
    exportRegulatoryWatch: vi.fn(),
  },
}));

const profile = {
  project: {
    id: "project-1",
    organizationId: "org-1",
    createdById: "user-1",
    name: "Atlas Industrie",
    slug: "atlas-industrie",
    logoUrl: null,
    entityType: "COMPANY",
    countryCode: "MA",
    standardCode: "ISO_9001",
    description: null,
    status: "READY_FOR_ANALYSIS",
    activities: [],
    createdAt: "2026-08-10T10:00:00.000Z",
    updatedAt: "2026-08-10T10:00:00.000Z",
  },
  profile: {
    id: "profile-1",
    schemaVersion: 1,
    revision: 4,
    status: "COMPLETE",
    completedAt: "2026-08-10T10:00:00.000Z",
    lastReviewedAt: null,
    nextReviewAt: null,
    createdAt: "2026-08-10T10:00:00.000Z",
    updatedAt: "2026-08-10T10:00:00.000Z",
  },
  fields: [],
  completion: {
    answeredRequired: 33,
    totalRequired: 33,
    completenessPercent: 100,
    answeredRegulatory: 12,
    totalRegulatory: 12,
    regulatoryReadiness: 100,
    missingRequiredKeys: [],
    missingRegulatoryKeys: [],
  },
  nextQuestion: null,
};

const notStartedWatch = {
  id: "watch-1",
  projectId: "project-1",
  status: "NOT_STARTED",
  revision: 1,
  currentAnalysis: null,
  currentBaseline: null,
  synchronization: {
    state: "IDLE",
    trigger: null,
    sourceBaselineId: null,
    progressPercent: 0,
    lastCheckedAt: null,
    lastSuccessfulSyncAt: null,
  },
  createdAt: "2026-08-10T10:00:00.000Z",
  updatedAt: "2026-08-10T10:00:00.000Z",
};

const analysis = {
  id: "run-1",
  profileSnapshotId: "snapshot-1",
  baseBaselineId: null,
  triggerType: "MANUAL",
  triggerDocumentVersionId: null,
  status: "RUNNING",
  asOf: "2026-08-10",
  languages: ["fr"],
  phase: "retrieval",
  progressPercent: 42,
  coverage: { completed: 0, total: 0 },
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    estimatedCostUsd: 0,
    budgetUsd: 1,
  },
  clarificationRevision: 0,
  clarifications: [],
  candidates: [],
  diff: { added: 0, unchanged: 0, modified: 0, removalProposed: 0, requiresReview: 0 },
  error: null,
  createdAt: "2026-08-10T10:00:00.000Z",
  completedAt: null,
};

const activeWatch = {
  ...notStartedWatch,
  status: "ACTIVE",
  revision: 3,
  currentAnalysis: { ...analysis, status: "COMPLETED", progressPercent: 100 },
  currentBaseline: {
    id: "baseline-1",
    sequence: 1,
    profileSnapshotId: "snapshot-1",
    publishedAt: "2026-08-10T12:00:00.000Z",
    entries: [
      {
        id: "entry-1",
        previousEntryId: null,
        changeType: "ADDED",
        orderIndex: 0,
        applicabilityRationale: "Applicable aux activités de production déclarées.",
        requirement: {
          text: "L’organisme doit déterminer et fournir les ressources nécessaires à la surveillance et à la mesure.",
          source: "AI",
          supportingExcerpts: [
            "déterminer et fournir les ressources nécessaires à la surveillance et à la mesure",
          ],
          reviewedAt: "2026-08-10T12:00:00.000Z",
        },
        source: {
          sourceId: "provision-1",
          documentId: "document-1",
          revisionId: "revision-1",
          documentTitle: "Systèmes de management de la qualité",
          referenceNumber: "ISO 9001:2015",
          revisionLabel: "r1",
          sourceEdition: "2015",
          jurisdiction: "global",
          countryCode: null,
          language: "fr",
          documentFamily: "standard",
          provisionType: "clause",
          provisionIdentifier: "7.1.5",
          headingPath: ["Support", "Ressources de surveillance et de mesure"],
          pageStart: 18,
          pageEnd: 18,
          excerpt:
            "L’organisme doit déterminer et fournir les ressources nécessaires à la surveillance et à la mesure.",
          citationLabel: "ISO 9001:2015, 7.1.5, p. 18",
        },
        evaluation: {
          id: "evaluation-1",
          revision: 1,
          result: "PARTIAL",
          comment: null,
          evaluatedAt: "2026-08-10T12:00:00.000Z",
          requiresReevaluation: false,
          aiAssessment: {
            status: "COMPLETED",
            suggestedResult: "PARTIAL",
            rationale: "Le registre est présent mais son exhaustivité doit être vérifiée.",
            confidence: 0.86,
            matchedProfileKeys: ["operations.orderToDeliveryFlow"],
            missingInformation: [],
            remediationPlan: "Compléter l’identification de tous les équipements de mesure.",
            action: {
              title: "Compléter le registre de métrologie",
              resources: null,
              startDate: null,
              dueDate: null,
              responsible: null,
              effectivenessCriteria: "Tous les équipements utilisés sont identifiés.",
            },
            evaluatedAt: "2026-08-10T12:00:00.000Z",
            errorMessage: null,
            updatedAt: "2026-08-10T12:00:00.000Z",
          },
          evidence: [],
          actions: [
            {
              id: "action-1",
              title: "Compléter le registre de métrologie",
              assigneeId: null,
              assigneeName: "Responsable qualité",
              resources: null,
              dueDate: "2026-09-30",
              completedDate: null,
              status: "OPEN",
              effectivenessCriteria: "Tous les équipements sont identifiés",
              effectiveness: "PENDING",
              comment: null,
            },
          ],
        },
      },
    ],
  },
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <MemoryRouter initialEntries={["/projects/atlas-industrie/regulatory-watch"]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/projects/:projectId/regulatory-watch" element={<RegulatoryWatchPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(clientApi.projectProfile).mockResolvedValue(profile as never);
  vi.mocked(clientApi.regulatoryWatch).mockResolvedValue(notStartedWatch as never);
  vi.mocked(clientApi.startRegulatoryAnalysis).mockResolvedValue({
    runId: "run-1",
    status: "QUEUED",
    jobId: "job-1",
    queue: "regulatory-analysis",
    correlationId: "correlation-1",
  });
  vi.mocked(clientApi.startRegulatoryEvaluation).mockResolvedValue({
    jobId: "evaluation-job-1",
    queue: "regulatory-evaluation",
    correlationId: "correlation-2",
  });
  vi.mocked(clientApi.updateRegulatoryEvaluation).mockResolvedValue(activeWatch as never);
  vi.mocked(clientApi.addRegulatoryAction).mockResolvedValue(activeWatch as never);
  vi.mocked(clientApi.updateRegulatoryAction).mockResolvedValue(activeWatch as never);
  vi.mocked(clientApi.addRegulatoryEvidence).mockResolvedValue(activeWatch as never);
  vi.mocked(clientApi.updateRegulatoryEvidence).mockResolvedValue(activeWatch as never);
  vi.mocked(clientApi.deleteRegulatoryEvidence).mockResolvedValue(activeWatch as never);
});

describe("RegulatoryWatchPage", () => {
  it("redirects an incomplete profile back to the guided chat", async () => {
    vi.mocked(clientApi.projectProfile).mockResolvedValue({
      ...profile,
      profile: { ...profile.profile, status: "IN_PROGRESS", completedAt: null },
      completion: {
        ...profile.completion,
        regulatoryReadiness: 58,
        answeredRegulatory: 7,
        missingRegulatoryKeys: ["operations.processes"],
      },
    } as never);
    renderPage();

    expect(
      await screen.findByRole("heading", { name: /Complétez d’abord le profil/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continuer avec l’assistant/ })).toHaveAttribute(
      "href",
      "/projects/atlas-industrie/chat",
    );
  });

  it("starts the regulatory analysis from the ready state", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Démarrer la veille réglementaire" }),
    );
    await waitFor(() =>
      expect(clientApi.startRegulatoryAnalysis).toHaveBeenCalledWith("atlas-industrie", {
        languages: ["fr", "ar"],
      }),
    );
  });

  it("shows source-needed leads separately when the stored corpus has no matching requirements", async () => {
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue({
      ...notStartedWatch,
      status: "REVIEW_REQUIRED",
      currentAnalysis: {
        ...analysis,
        status: "READY_FOR_REVIEW",
        candidates: [],
        sourceRequired: [
          {
            reference: "Référence à vérifier",
            title: "Texte potentiel",
            reason: "Vérifier le champ.",
          },
        ],
      },
    } as never);
    renderPage();
    expect(
      await screen.findByRole("complementary", { name: "Sources à obtenir" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/leur contenu n’est pas dans/)).toBeInTheDocument();
    expect(screen.getByText(/Référence à vérifier — Texte potentiel/)).toBeInTheDocument();
  });

  it("shows live analysis progress while no baseline exists", async () => {
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue({
      ...notStartedWatch,
      status: "ANALYZING",
      currentAnalysis: analysis,
    } as never);
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Nous préparons votre référentiel" }),
    ).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("Cette page se met à jour automatiquement.")).toBeInTheDocument();
  });

  it("shows the current drafting and verification stage instead of an opaque 50 percent", async () => {
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue({
      ...notStartedWatch,
      status: "ANALYZING",
      currentAnalysis: {
        ...analysis,
        phase: "classification_verifying",
        progressPercent: 67,
      },
    } as never);
    renderPage();

    expect(await screen.findByText("Vérification indépendante de l’exigence")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
  });

  it("renders published API data in both workbook sections", async () => {
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue(activeWatch as never);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findAllByText("ISO 9001:2015")).not.toHaveLength(0);
    expect(screen.getByText("1 exigences publiées")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Évaluation réglementaire et normative/ }));
    expect(screen.getAllByText(/7\.1\.5/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Partiel").length).toBeGreaterThan(0);
  });

  it("shows and validates an AI conformity recommendation", async () => {
    const pendingWatch = {
      ...activeWatch,
      currentBaseline: {
        ...activeWatch.currentBaseline,
        entries: activeWatch.currentBaseline.entries.map((entry) => ({
          ...entry,
          evaluation: {
            ...entry.evaluation,
            result: "NOT_ASSESSED",
            evaluatedAt: null,
            aiAssessment: {
              ...entry.evaluation.aiAssessment,
              suggestedResult: "NON_CONFORMING",
              confidence: 0.61,
              missingInformation: ["La preuve d’étalonnage n’est pas disponible."],
              remediationPlan: "Créer et tenir à jour un registre de métrologie vérifiable.",
            },
          },
        })),
      },
    };
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue(pendingWatch as never);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("tab", { name: /Évaluation réglementaire et normative/ }),
    );
    await user.click(screen.getAllByText(/L’organisme doit déterminer et fournir/)[0]!);
    expect(await screen.findByText("Analyse IA à valider")).toBeInTheDocument();
    expect(screen.getByText("La preuve d’étalonnage n’est pas disponible.")).toBeInTheDocument();
    expect(screen.getByText(/Créer et tenir à jour un registre/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Valider l’évaluation" }));
    await waitFor(() =>
      expect(clientApi.updateRegulatoryEvaluation).toHaveBeenCalledWith(
        "atlas-industrie",
        "evaluation-1",
        expect.objectContaining({ revision: 1, result: "NON_CONFORMING" }),
      ),
    );
  });

  it("re-enables the AI evaluation after a pass dies mid-run", async () => {
    const strandedWatch = {
      ...activeWatch,
      currentBaseline: {
        ...activeWatch.currentBaseline,
        entries: activeWatch.currentBaseline.entries.map((entry) => ({
          ...entry,
          evaluation: {
            ...entry.evaluation,
            result: "NOT_ASSESSED",
            evaluatedAt: null,
            aiAssessment: {
              ...entry.evaluation.aiAssessment,
              status: "PENDING",
              suggestedResult: null,
              // Far older than staleAiEvaluationMs: no worker can still be on it.
              updatedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
            },
          },
        })),
      },
    };
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue(strandedWatch as never);
    const user = userEvent.setup();
    renderPage();

    const retry = await screen.findByRole("button", { name: /Relancer l’évaluation IA/ });
    expect(retry).toBeEnabled();
    await user.click(retry);
    await waitFor(() => expect(clientApi.startRegulatoryEvaluation).toHaveBeenCalled());
  });

  it("keeps the AI evaluation locked while a pass is still making progress", async () => {
    const runningWatch = {
      ...activeWatch,
      currentBaseline: {
        ...activeWatch.currentBaseline,
        entries: activeWatch.currentBaseline.entries.map((entry) => ({
          ...entry,
          evaluation: {
            ...entry.evaluation,
            result: "NOT_ASSESSED",
            evaluatedAt: null,
            aiAssessment: {
              ...entry.evaluation.aiAssessment,
              status: "RUNNING",
              suggestedResult: null,
              updatedAt: new Date().toISOString(),
            },
          },
        })),
      },
    };
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue(runningWatch as never);
    renderPage();

    expect(await screen.findByRole("button", { name: /Évaluation IA en cours/ })).toBeDisabled();
  });

  it("shows the AI assessment as the requirement's own result and action", async () => {
    const assessedWatch = {
      ...activeWatch,
      currentBaseline: {
        ...activeWatch.currentBaseline,
        entries: activeWatch.currentBaseline.entries.map((entry) => ({
          ...entry,
          evaluation: {
            ...entry.evaluation,
            result: "NON_CONFORMING",
            evaluatedAt: null,
            actions: [
              {
                ...entry.evaluation.actions[0],
                assigneeName: "Responsable QHSE",
                dueDate: "2026-09-30",
              },
            ],
          },
        })),
      },
    };
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue(assessedWatch as never);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("tab", { name: /Évaluation réglementaire et normative/ }),
    );
    expect(screen.getAllByText("Non conforme").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Compléter le registre de métrologie").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Responsable QHSE").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Suggestion IA/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Proposition IA/)).not.toBeInTheDocument();
  });

  it("reports a finished AI pass as complete and separates confirmed results", async () => {
    const assessedWatch = {
      ...activeWatch,
      currentBaseline: {
        ...activeWatch.currentBaseline,
        entries: activeWatch.currentBaseline.entries.map((entry) => ({
          ...entry,
          evaluation: { ...entry.evaluation, result: "PARTIAL", evaluatedAt: null },
        })),
      },
    };
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue(assessedWatch as never);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("tab", { name: /Évaluation réglementaire et normative/ }),
    );
    expect(screen.getByText("Évaluation terminée")).toBeInTheDocument();
    expect(screen.getByText("1 exigences évaluées sur 1")).toBeInTheDocument();
    expect(screen.getByText(/1 analysées · 0 confirmées par un responsable/)).toBeInTheDocument();
  });

  it("shows the official source text next to the AI recommendation", async () => {
    const pendingWatch = {
      ...activeWatch,
      currentBaseline: {
        ...activeWatch.currentBaseline,
        entries: activeWatch.currentBaseline.entries.map((entry) => ({
          ...entry,
          evaluation: { ...entry.evaluation, result: "NOT_ASSESSED", evaluatedAt: null },
        })),
      },
    };
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue(pendingWatch as never);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("tab", { name: /Évaluation réglementaire et normative/ }),
    );
    await user.click(screen.getAllByText(/L’organisme doit déterminer et fournir/)[0]!);
    expect(await screen.findByText("Traçabilité — texte officiel")).toBeInTheDocument();
    expect(screen.getByText("ISO 9001:2015, 7.1.5, p. 18")).toBeInTheDocument();
    expect(screen.getByText("Preuves associées")).toBeInTheDocument();
  });

  it("shows a non-blocking synchronization indicator without hiding published data", () => {
    const synchronizingWatch = {
      ...activeWatch,
      currentAnalysis: {
        ...analysis,
        baseBaselineId: "baseline-1",
        phase: "classification_drafting",
        progressPercent: 63,
      },
    };
    render(
      <MemoryRouter>
        <DataPage
          exporting={false}
          onExport={vi.fn()}
          onRefresh={vi.fn()}
          profile={profile as never}
          refreshing={false}
          synchronizing
          watch={synchronizingWatch as never}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Synchronisation");
    expect(screen.getByText(/Rédaction d’une exigence applicable/)).toBeInTheDocument();
    expect(screen.getByText("63%")).toBeInTheDocument();
    expect(screen.getAllByText("ISO 9001:2015").length).toBeGreaterThan(0);
  });

  it("labels legacy requirements for regeneration and disables XLSX export", () => {
    const legacyWatch = {
      ...activeWatch,
      currentBaseline: {
        ...activeWatch.currentBaseline,
        entries: activeWatch.currentBaseline.entries.map((entry) => ({
          ...entry,
          requirement: null,
        })),
      },
    };
    render(
      <MemoryRouter>
        <DataPage
          exporting={false}
          onExport={vi.fn()}
          onRefresh={vi.fn()}
          profile={profile as never}
          refreshing={false}
          synchronizing={false}
          watch={legacyWatch as never}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Exigences à régénérer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exporter en Excel/ })).toBeDisabled();
  });

  it("keeps the published baseline visible while grouped changes await review", async () => {
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue({
      ...activeWatch,
      status: "REVIEW_REQUIRED",
      currentAnalysis: {
        ...analysis,
        baseBaselineId: "baseline-1",
        status: "READY_FOR_REVIEW",
        phase: "review",
        progressPercent: 100,
        diff: { added: 1, unchanged: 1, modified: 0, removalProposed: 0, requiresReview: 1 },
        candidates: [
          {
            id: "candidate-added",
            changeType: "ADDED",
            changeSummary: "Nouvelle disposition potentiellement applicable.",
            previousEntryId: null,
            previousSource: null,
            requiresReview: true,
            suggestion: "APPLICABLE",
            decision: null,
            decisionSource: null,
            rationale: "Applicable à la nouvelle activité déclarée.",
            matchedProfileKeys: ["operations.keyProcesses"],
            confidence: 0.91,
            decisionNote: null,
            reviewedAt: null,
            requirement: {
              text: "L’organisme doit déterminer et fournir les ressources nécessaires à la surveillance et à la mesure.",
              status: "READY",
              supportingExcerpts: [
                "déterminer et fournir les ressources nécessaires à la surveillance et à la mesure",
              ],
              issues: [],
              source: "AI",
              editedAt: null,
            },
            source: activeWatch.currentBaseline.entries[0]!.source,
          },
          {
            id: "candidate-unchanged",
            changeType: "UNCHANGED",
            changeSummary: null,
            previousEntryId: "entry-1",
            previousSource: activeWatch.currentBaseline.entries[0]!.source,
            requiresReview: false,
            suggestion: "APPLICABLE",
            decision: "APPLICABLE",
            decisionSource: "SYSTEM",
            rationale: "Disposition conservée.",
            matchedProfileKeys: [],
            confidence: 1,
            decisionNote: null,
            reviewedAt: null,
            requirement: {
              text: "L’organisme doit déterminer et fournir les ressources nécessaires à la surveillance et à la mesure.",
              status: "READY",
              supportingExcerpts: [
                "déterminer et fournir les ressources nécessaires à la surveillance et à la mesure",
              ],
              issues: [],
              source: "CARRIED_FORWARD",
              editedAt: null,
            },
            source: activeWatch.currentBaseline.entries[0]!.source,
          },
        ],
      },
      synchronization: {
        state: "CHANGES_READY",
        trigger: "DOCUMENT_REVISION",
        sourceBaselineId: "baseline-1",
        progressPercent: 100,
        lastCheckedAt: "2026-08-10T13:00:00.000Z",
        lastSuccessfulSyncAt: "2026-08-10T12:00:00.000Z",
      },
    } as never);
    vi.mocked(clientApi.decideRegulatoryCandidate).mockResolvedValue(activeWatch as never);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Validez uniquement les changements")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Ajouts/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Inchangés/ })).toBeInTheDocument();
    expect(screen.getAllByText("ISO 9001:2015").length).toBeGreaterThan(0);
    // The requirement extracted by the AI, and its explanation, are shown read-only.
    expect(
      screen.getAllByText(
        "L’organisme doit déterminer et fournir les ressources nécessaires à la surveillance et à la mesure.",
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Applicable à la nouvelle activité déclarée.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Exigence 7\.1\.5/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Applicable" }));
    expect(clientApi.decideRegulatoryCandidate).toHaveBeenCalledWith(
      "atlas-industrie",
      "candidate-added",
      { watchRevision: 3, decision: "APPLICABLE" },
    );
  });

  it("records every pending decision at once from the AI's own extraction outcome", async () => {
    const reviewedCandidate = (
      id: string,
      requirement: { text: string | null; status: string; issues: string[] },
    ) => ({
      id,
      changeType: "ADDED",
      changeSummary: "Nouvelle disposition potentiellement applicable.",
      previousEntryId: null,
      previousSource: null,
      requiresReview: true,
      suggestion: "APPLICABLE",
      decision: null,
      decisionSource: null,
      rationale: "Applicable à la nouvelle activité déclarée.",
      matchedProfileKeys: [],
      confidence: 0.9,
      decisionNote: null,
      reviewedAt: null,
      requirement: { ...requirement, supportingExcerpts: [], source: "AI", editedAt: null },
      source: activeWatch.currentBaseline.entries[0]!.source,
    });
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue({
      ...notStartedWatch,
      status: "REVIEW_REQUIRED",
      currentAnalysis: {
        ...analysis,
        status: "READY_FOR_REVIEW",
        phase: "review",
        progressPercent: 100,
        diff: { added: 3, unchanged: 0, modified: 0, removalProposed: 0, requiresReview: 3 },
        candidates: [
          reviewedCandidate("candidate-ready", {
            text: "L’organisme doit fournir les ressources nécessaires à la surveillance.",
            status: "READY",
            issues: [],
          }),
          reviewedCandidate("candidate-blocked", {
            text: null,
            status: "SOURCE_REVIEW_REQUIRED",
            issues: ["Le texte source semble corrompu par l’OCR."],
          }),
          {
            ...reviewedCandidate("candidate-decided", {
              text: "L’organisme doit consigner les résultats de surveillance.",
              status: "READY",
              issues: [],
            }),
            decision: "NOT_APPLICABLE",
            decisionSource: "HUMAN",
            reviewedAt: "2026-08-10T13:05:00.000Z",
          },
        ],
      },
    } as never);
    vi.mocked(clientApi.decideRegulatoryCandidates).mockResolvedValue(activeWatch as never);
    const user = userEvent.setup();
    renderPage();

    // Only the two undecided candidates are counted: a decision already taken by hand is kept.
    expect(await screen.findByRole("button", { name: /Tout valider \(2\)/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /Tout valider \(2\)/ }));

    expect(clientApi.decideRegulatoryCandidates).toHaveBeenCalledWith("atlas-industrie", {
      watchRevision: 1,
      decisions: [
        { candidateId: "candidate-ready", decision: "APPLICABLE" },
        { candidateId: "candidate-blocked", decision: "NOT_APPLICABLE" },
      ],
    });
  });

  it("allows deciding either way on a candidate whose source needs review", async () => {
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue({
      ...notStartedWatch,
      status: "REVIEW_REQUIRED",
      currentAnalysis: {
        ...analysis,
        status: "READY_FOR_REVIEW",
        phase: "review",
        progressPercent: 100,
        diff: { added: 1, unchanged: 0, modified: 0, removalProposed: 0, requiresReview: 1 },
        candidates: [
          {
            id: "candidate-blocked",
            changeType: "ADDED",
            changeSummary: "Source extraite avec une structure corrompue.",
            previousEntryId: null,
            previousSource: null,
            requiresReview: true,
            suggestion: "TO_CONFIRM",
            decision: null,
            decisionSource: null,
            rationale: "La source ne permet pas une analyse fiable.",
            matchedProfileKeys: [],
            confidence: 0,
            decisionNote: null,
            reviewedAt: null,
            requirement: {
              text: null,
              status: "SOURCE_REVIEW_REQUIRED",
              supportingExcerpts: [],
              issues: ["Le texte source semble corrompu par l’OCR."],
              source: null,
              editedAt: null,
            },
            source: activeWatch.currentBaseline.entries[0]!.source,
          },
        ],
      },
    } as never);
    vi.mocked(clientApi.decideRegulatoryCandidate).mockResolvedValue(activeWatch as never);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/1 source à vérifier/)).toBeInTheDocument();
    expect(
      screen.getByText("Aucune exigence n’a pu être extraite de cette source."),
    ).toBeInTheDocument();
    // Reviewers can decide either way at any time, regardless of source/requirement status.
    expect(screen.getByRole("button", { name: "Applicable" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Non applicable" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Publier le référentiel/ })).toBeDisabled();
    // With no AI-extracted wording, approving falls back to the source law text so the
    // decision always carries something to audit.
    await user.click(screen.getByRole("button", { name: "Applicable" }));
    expect(clientApi.decideRegulatoryCandidate).toHaveBeenCalledWith(
      "atlas-industrie",
      "candidate-blocked",
      {
        watchRevision: 1,
        decision: "APPLICABLE",
        requirementText:
          "L’organisme doit déterminer et fournir les ressources nécessaires à la surveillance et à la mesure.",
      },
    );
  });

  it("allows approving a candidate even when the AI flagged the source for review", async () => {
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue({
      ...notStartedWatch,
      status: "REVIEW_REQUIRED",
      currentAnalysis: {
        ...analysis,
        status: "READY_FOR_REVIEW",
        phase: "review",
        progressPercent: 100,
        diff: { added: 1, unchanged: 0, modified: 0, removalProposed: 0, requiresReview: 1 },
        candidates: [
          {
            id: "candidate-flagged",
            changeType: "ADDED",
            changeSummary: "Nouvelle disposition potentiellement applicable.",
            previousEntryId: null,
            previousSource: null,
            requiresReview: true,
            suggestion: "APPLICABLE",
            decision: null,
            decisionSource: null,
            rationale: "Le texte prévoit une sanction, mais l’infraction visée n’est pas précisée.",
            matchedProfileKeys: [],
            confidence: 0.4,
            decisionNote: null,
            reviewedAt: null,
            requirement: {
              text: "Si le contrevenant est une personne morale, il sera puni d’une amende de 50.000 à 1.000.000 dirhams.",
              status: "SOURCE_REVIEW_REQUIRED",
              supportingExcerpts: ["personne morale"],
              issues: ["Le texte source est partiellement tronqué."],
              source: "AI",
              editedAt: null,
            },
            source: activeWatch.currentBaseline.entries[0]!.source,
          },
        ],
      },
    } as never);
    renderPage();

    expect(await screen.findByText(/1 source à vérifier/)).toBeInTheDocument();
    // Reviewers can decide either way at any time, regardless of source/requirement status.
    expect(screen.getByRole("button", { name: "Applicable" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Non applicable" })).toBeEnabled();
  });

  it("keeps completed candidates reviewable and still requires a decision before publishing a partial run", async () => {
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue({
      ...notStartedWatch,
      status: "REVIEW_REQUIRED",
      currentAnalysis: {
        ...analysis,
        status: "PARTIAL",
        phase: "budget-limit",
        progressPercent: 71,
        coverage: { completed: 1, total: 2 },
        usage: {
          inputTokens: 1_200,
          outputTokens: 600,
          reasoningTokens: 200,
          estimatedCostUsd: 0.42,
          budgetUsd: 1,
        },
        diff: { added: 1, unchanged: 0, modified: 0, removalProposed: 0, requiresReview: 1 },
        candidates: [
          {
            id: "candidate-partial",
            changeType: "ADDED",
            changeSummary: "Résultat terminé avant la limite de budget.",
            previousEntryId: null,
            previousSource: null,
            requiresReview: true,
            suggestion: "APPLICABLE",
            decision: null,
            decisionSource: null,
            rationale: "Applicable à l’activité déclarée.",
            matchedProfileKeys: ["operations.keyProcesses"],
            confidence: 0.9,
            decisionNote: null,
            reviewedAt: null,
            requirement: {
              text: "L’organisme doit maîtriser les ressources nécessaires aux activités réglementées.",
              status: "READY",
              supportingExcerpts: ["ressources nécessaires aux activités réglementées"],
              issues: [],
              source: "AI",
              editedAt: null,
            },
            source: activeWatch.currentBaseline.entries[0]!.source,
          },
        ],
      },
      synchronization: {
        state: "PARTIAL",
        trigger: "MANUAL",
        sourceBaselineId: null,
        progressPercent: 71,
        lastCheckedAt: "2026-08-10T13:00:00.000Z",
        lastSuccessfulSyncAt: null,
      },
    } as never);
    renderPage();

    expect(await screen.findByRole("button", { name: "Applicable" })).toBeEnabled();
    // The one completed candidate hasn't been decided yet, so publishing is still blocked —
    // not because the run is partial.
    expect(screen.getByRole("button", { name: /Publier le référentiel/ })).toBeDisabled();
  });

  it("allows publishing a partial run once every completed candidate has been reviewed", async () => {
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue({
      ...notStartedWatch,
      status: "REVIEW_REQUIRED",
      currentAnalysis: {
        ...analysis,
        status: "PARTIAL",
        phase: "budget-limit",
        progressPercent: 71,
        coverage: { completed: 1, total: 2 },
        usage: {
          inputTokens: 1_200,
          outputTokens: 600,
          reasoningTokens: 200,
          estimatedCostUsd: 0.42,
          budgetUsd: 1,
        },
        diff: { added: 1, unchanged: 0, modified: 0, removalProposed: 0, requiresReview: 0 },
        candidates: [
          {
            id: "candidate-partial",
            changeType: "ADDED",
            changeSummary: "Résultat terminé avant la limite de budget.",
            previousEntryId: null,
            previousSource: null,
            requiresReview: true,
            suggestion: "APPLICABLE",
            decision: "APPLICABLE",
            decisionSource: "HUMAN",
            rationale: "Applicable à l’activité déclarée.",
            matchedProfileKeys: ["operations.keyProcesses"],
            confidence: 0.9,
            decisionNote: null,
            reviewedAt: "2026-08-10T13:05:00.000Z",
            requirement: {
              text: "L’organisme doit maîtriser les ressources nécessaires aux activités réglementées.",
              status: "READY",
              supportingExcerpts: ["ressources nécessaires aux activités réglementées"],
              issues: [],
              source: "AI",
              editedAt: null,
            },
            source: activeWatch.currentBaseline.entries[0]!.source,
          },
        ],
      },
      synchronization: {
        state: "PARTIAL",
        trigger: "MANUAL",
        sourceBaselineId: null,
        progressPercent: 71,
        lastCheckedAt: "2026-08-10T13:00:00.000Z",
        lastSuccessfulSyncAt: null,
      },
    } as never);
    renderPage();

    expect(await screen.findByRole("button", { name: /Publier le référentiel/ })).toBeEnabled();
  });
  it("shows every exported column in the register and lets the reviewer hide one", async () => {
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue(activeWatch as never);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("tab", { name: /Évaluation réglementaire et normative/ }),
    );
    // The same columns the XLSX "EVALUATION REGLEMENTAIRE ET NORMATIVE" block carries.
    for (const heading of [
      "Texte / exigence applicable",
      "Conformité",
      "Preuve",
      "Action",
      "Responsable",
      "Ressources",
      "Date prévue",
      "Date réelle",
      "Critères d’efficacité",
      "Action efficace",
      "Commentaire",
    ]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("cell", { name: "Responsable qualité" })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("cell", { name: "30 sept. 2026" })[0]).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Colonnes/ }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Ressources" }));

    await waitFor(() =>
      expect(screen.queryByRole("columnheader", { name: "Ressources" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("columnheader", { name: "Responsable" })).toBeInTheDocument();
  });

  it("saves the whole action plan against the action the conformity pass created", async () => {
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue(activeWatch as never);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("tab", { name: /Évaluation réglementaire et normative/ }),
    );
    await user.click(screen.getAllByText(/L’organisme doit déterminer et fournir/)[0]!);

    const responsible = await screen.findByLabelText("Responsable");
    await user.clear(responsible);
    await user.type(responsible, "Responsable métrologie");
    await user.type(screen.getByLabelText("Ressources"), "Prestataire d’étalonnage");
    await user.selectOptions(screen.getByLabelText("Action efficace"), "EFFECTIVE");
    await user.click(screen.getByRole("button", { name: "Valider l’évaluation" }));

    await waitFor(() =>
      expect(clientApi.updateRegulatoryAction).toHaveBeenCalledWith(
        "atlas-industrie",
        "action-1",
        expect.objectContaining({
          title: "Compléter le registre de métrologie",
          responsibleName: "Responsable métrologie",
          resources: "Prestataire d’étalonnage",
          dueDate: "2026-09-30",
          effectiveness: "EFFECTIVE",
        }),
      ),
    );
    expect(clientApi.addRegulatoryAction).not.toHaveBeenCalled();
    expect(clientApi.updateRegulatoryEvaluation).toHaveBeenCalled();
  });

  it("creates an action when the exigence had none yet", async () => {
    const actionlessWatch = {
      ...activeWatch,
      currentBaseline: {
        ...activeWatch.currentBaseline,
        entries: activeWatch.currentBaseline.entries.map((entry) => ({
          ...entry,
          evaluation: { ...entry.evaluation, actions: [] },
        })),
      },
    };
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue(actionlessWatch as never);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("tab", { name: /Évaluation réglementaire et normative/ }),
    );
    await user.click(screen.getAllByText(/L’organisme doit déterminer et fournir/)[0]!);
    await user.type(await screen.findByLabelText("Action"), "Créer le registre");
    await user.click(screen.getByRole("button", { name: "Valider l’évaluation" }));

    await waitFor(() =>
      expect(clientApi.addRegulatoryAction).toHaveBeenCalledWith(
        "atlas-industrie",
        "evaluation-1",
        expect.objectContaining({ title: "Créer le registre", status: "OPEN" }),
      ),
    );
    expect(clientApi.updateRegulatoryAction).not.toHaveBeenCalled();
  });

  it("blocks a plan that names a responsable but no action, instead of sending a 400", async () => {
    const actionlessWatch = {
      ...activeWatch,
      currentBaseline: {
        ...activeWatch.currentBaseline,
        entries: activeWatch.currentBaseline.entries.map((entry) => ({
          ...entry,
          evaluation: { ...entry.evaluation, actions: [] },
        })),
      },
    };
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue(actionlessWatch as never);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("tab", { name: /Évaluation réglementaire et normative/ }),
    );
    await user.click(screen.getAllByText(/L’organisme doit déterminer et fournir/)[0]!);
    await user.type(await screen.findByLabelText("Responsable"), "Responsable métrologie");
    await user.click(screen.getByRole("button", { name: "Valider l’évaluation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Renseignez l’intitulé de l’action/);
    expect(clientApi.addRegulatoryAction).not.toHaveBeenCalled();
    expect(clientApi.updateRegulatoryEvaluation).not.toHaveBeenCalled();
  });

  it("adds and removes preuves through the register sheet", async () => {
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue({
      ...activeWatch,
      currentBaseline: {
        ...activeWatch.currentBaseline,
        entries: activeWatch.currentBaseline.entries.map((entry) => ({
          ...entry,
          evaluation: {
            ...entry.evaluation,
            evidence: [
              {
                id: "evidence-1",
                kind: "NOTE",
                fileId: null,
                label: "Registre métrologie",
                url: null,
                note: "Registre incomplet",
                createdAt: "2026-08-10T12:00:00.000Z",
              },
            ],
          },
        })),
      },
    } as never);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("tab", { name: /Évaluation réglementaire et normative/ }),
    );
    await user.click(screen.getAllByText(/L’organisme doit déterminer et fournir/)[0]!);
    await user.click(await screen.findByRole("button", { name: /Ajouter/ }));

    const noteFields = screen.getAllByLabelText("Note");
    await user.type(noteFields[noteFields.length - 1]!, "Photo du poste de mesure");
    await user.click(screen.getAllByRole("button", { name: "Retirer la preuve" })[0]!);
    await user.click(screen.getByRole("button", { name: "Valider l’évaluation" }));

    await waitFor(() =>
      expect(clientApi.deleteRegulatoryEvidence).toHaveBeenCalledWith(
        "atlas-industrie",
        "evidence-1",
      ),
    );
    expect(clientApi.addRegulatoryEvidence).toHaveBeenCalledWith(
      "atlas-industrie",
      "evaluation-1",
      expect.objectContaining({ kind: "NOTE", note: "Photo du poste de mesure" }),
    );
  });
});
