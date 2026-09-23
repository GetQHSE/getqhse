import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clientApi } from "../../app/client-api.js";
import { RegulatoryWatchPage } from "./regulatory-watch-page.js";

vi.mock("../../app/feature-flags.js", () => ({ AUTO_APPLICABLE: true }));
vi.mock("../../app/client-api.js", () => ({
  clientApi: {
    projectProfile: vi.fn(),
    regulatoryWatch: vi.fn(),
    publishRegulatoryBaselineAutomatically: vi.fn(),
  },
}));

const readyWatch = {
  id: "watch-1",
  projectId: "project-1",
  status: "REVIEW_REQUIRED",
  revision: 1,
  currentBaseline: null,
  currentAnalysis: {
    id: "run-1",
    status: "READY_FOR_REVIEW",
    review: null,
    sourceRequired: [],
    candidates: [
      {
        id: "candidate-1",
        changeType: "ADDED",
        requiresReview: true,
        decision: null,
        source: { type: "DISCOVERED_LAW", documentTitle: "Code du travail" },
        requirement: { text: null, status: "NOT_REQUIRED", issues: [] },
      },
    ],
  },
  synchronization: { state: "IDLE" },
};

describe("automatic regulatory publication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientApi.projectProfile).mockResolvedValue({
      project: { slug: "atlas-industrie" },
      profile: { status: "COMPLETE" },
    } as never);
    vi.mocked(clientApi.regulatoryWatch).mockResolvedValue(readyWatch as never);
    vi.mocked(clientApi.publishRegulatoryBaselineAutomatically).mockResolvedValue({
      ...readyWatch,
      status: "ACTIVE",
      revision: 2,
      currentAnalysis: { ...readyWatch.currentAnalysis, status: "COMPLETED" },
      currentBaseline: { id: "baseline-1", sequence: 1, publishedAt: "2026-09-22", entries: [] },
    } as never);
  });

  it("publishes a ready analysis and goes straight to the applicable register", async () => {
    render(
      <MemoryRouter initialEntries={["/projects/atlas-industrie/regulatory-watch"]}>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <Routes>
            <Route path="/projects/:projectId/regulatory-watch" element={<RegulatoryWatchPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(clientApi.publishRegulatoryBaselineAutomatically).toHaveBeenCalledWith(
        "atlas-industrie",
        { analysisRunId: "run-1", watchRevision: 1 },
      ),
    );
    expect(await screen.findByText("Référentiel basé sur le profil validé")).toBeInTheDocument();
    expect(screen.queryByText("Validez uniquement les changements")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tout valider/ })).not.toBeInTheDocument();
  });
});
