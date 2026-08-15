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
    publishRegulatoryBaseline: vi.fn(),
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
    const requirement = screen.getByRole("textbox", { name: /Exigence 7\.1\.5/ });
    await user.clear(requirement);
    await user.type(
      requirement,
      "L’organisme doit fournir et maîtriser les ressources nécessaires aux activités de mesure.",
    );
    await user.click(screen.getByRole("button", { name: "Applicable" }));
    expect(clientApi.decideRegulatoryCandidate).toHaveBeenCalledWith(
      "atlas-industrie",
      "candidate-added",
      {
        watchRevision: 3,
        decision: "APPLICABLE",
        requirementText:
          "L’organisme doit fournir et maîtriser les ressources nécessaires aux activités de mesure.",
      },
    );
  });

  it("disables approval and publication when the normative source is blocked", async () => {
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
    renderPage();

    expect(await screen.findByText(/Publication bloquée par 1 source/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Applicable" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Non applicable" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Publier le référentiel/ })).toBeDisabled();
  });
});
