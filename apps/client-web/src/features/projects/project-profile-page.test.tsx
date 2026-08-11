import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clientApi } from "../../app/client-api.js";
import { ProjectProfilePage } from "./project-profile-page.js";

vi.mock("../../app/client-api.js", () => ({
  clientApi: {
    projectProfile: vi.fn(),
    updateProjectProfile: vi.fn(),
    completeProjectProfile: vi.fn(),
    exportProjectProfile: vi.fn(),
    importProjectProfile: vi.fn(),
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
    status: "PROFILE_IN_PROGRESS",
    activities: [],
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z",
  },
  profile: {
    id: "profile-1",
    schemaVersion: 1,
    revision: 4,
    status: "IN_PROGRESS",
    completedAt: null,
    lastReviewedAt: null,
    nextReviewAt: null,
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z",
  },
  fields: [],
  completion: {
    answeredRequired: 9,
    totalRequired: 32,
    completenessPercent: 28,
    answeredRegulatory: 2,
    totalRegulatory: 12,
    regulatoryReadiness: 17,
    missingRequiredKeys: ["organization.mission"],
    missingRegulatoryKeys: [],
  },
  nextQuestion: {
    key: "organization.mission",
    section: "IDENTITY_ACTIVITY",
    prompt: "Quelle est la mission principale de votre organisation ?",
    required: true,
    regulatoryCritical: false,
    allowNotApplicable: false,
  },
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    ...render(
      <MemoryRouter initialEntries={["/projects/atlas-industrie/profile"]}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/projects/:projectId/profile" element={<ProjectProfilePage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    ),
  };
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(clientApi.projectProfile).mockResolvedValue(profile as never);
  vi.mocked(clientApi.updateProjectProfile).mockResolvedValue({
    ...profile,
    profile: { ...profile.profile, revision: 5 },
  } as never);
  vi.mocked(clientApi.importProjectProfile).mockResolvedValue({
    ...profile,
    profile: { ...profile.profile, revision: 5, status: "COMPLETE" },
    completion: {
      ...profile.completion,
      answeredRequired: 32,
      completenessPercent: 100,
      answeredRegulatory: 12,
      regulatoryReadiness: 100,
      missingRequiredKeys: [],
      missingRegulatoryKeys: [],
    },
  } as never);
});

describe("ProjectProfilePage", () => {
  it("shows live profile progress and blocks finalization while required data is missing", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Profil de Atlas Industrie" }),
    ).toBeInTheDocument();
    expect(screen.getByText("9 réponses sur 32")).toBeInTheDocument();
    expect(screen.getByText("28%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finaliser le profil" })).toBeDisabled();
  });

  it("saves a manual answer with canonical validation and the current revision", async () => {
    renderPage();
    const user = userEvent.setup();
    const question = await screen.findByRole("heading", {
      name: "Quelle est la mission principale de votre entreprise ?",
    });
    const row = question.closest("article");
    expect(row).not.toBeNull();

    await user.click(within(row!).getByRole("button", { name: "Renseigner" }));
    await user.type(
      screen.getByRole("textbox", { name: "Mission principale" }),
      "Fabriquer des équipements industriels fiables pour le marché marocain.",
    );
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(clientApi.updateProjectProfile).toHaveBeenCalledWith("atlas-industrie", {
        revision: 4,
        answers: [
          {
            key: "organization.mission",
            status: "ANSWERED",
            value: "Fabriquer des équipements industriels fiables pour le marché marocain.",
          },
        ],
        changeReason: "Mise à jour depuis la page profil",
      }),
    );
  });

  it("finalizes a fully ready profile using the current revision", async () => {
    vi.mocked(clientApi.projectProfile).mockResolvedValue({
      ...profile,
      completion: {
        ...profile.completion,
        answeredRequired: 32,
        completenessPercent: 100,
        answeredRegulatory: 12,
        regulatoryReadiness: 100,
        missingRequiredKeys: [],
      },
      nextQuestion: null,
    } as never);
    vi.mocked(clientApi.completeProjectProfile).mockResolvedValue({} as never);
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Finaliser le profil" }));
    expect(screen.getByRole("heading", { name: "Finaliser cette version ?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    await waitFor(() =>
      expect(clientApi.completeProjectProfile).toHaveBeenCalledWith("atlas-industrie", 4),
    );
  });

  it("imports JSON and invalidates every profile consumer after success", async () => {
    const { queryClient } = renderPage();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Profil de Atlas Industrie" });
    const document = {
      format: "qhse-project-profile",
      formatVersion: 1,
      profileSchemaVersion: 1,
      exportedAt: "2026-08-11T08:00:00.000Z",
      sourceProject: {
        name: "Atlas Industrie",
        countryCode: "MA",
        standardCode: "ISO_9001",
      },
      fields: [{ key: "project.name", status: "ANSWERED", value: "Atlas Industrie" }],
    };

    await user.upload(
      screen.getByLabelText("Importer un profil JSON"),
      new File([JSON.stringify(document)], "profil.json", { type: "application/json" }),
    );

    await waitFor(() =>
      expect(clientApi.importProjectProfile).toHaveBeenCalledWith("atlas-industrie", {
        revision: 4,
        document,
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["project-profile", "atlas-industrie"],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["project-profile-conversation", "atlas-industrie"],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["regulatory-watch", "atlas-industrie"],
    });
    expect(await screen.findByRole("status")).toHaveTextContent("importé et finalisé");
  });
});
