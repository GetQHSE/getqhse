import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { smqScope } from "@qhse/domain";
import type { ScopeRegister } from "@qhse/contracts";
import { clientApi } from "../../app/client-api.js";
import { ScopePage } from "./scope-page.js";
import { scopeExportSections } from "./export.js";
vi.mock("../../app/client-api.js", () => ({
  clientApi: {
    scopeRegister: vi.fn(),
    writeScope: vi.fn(),
    launchScope: vi.fn(),
    exportScopeVersion: vi.fn(),
  },
}));
const fixture = (): ScopeRegister => ({
  projectId: "p",
  revision: 0,
  facts: {
    projectName: "Atlas",
    organizationName: "Group",
    standard: "ISO_9001",
    language: "en",
    projectActivities: ["Repair"],
    profile: [],
    issues: [],
    parties: [],
    requirements: [],
    risks: [],
  },
  declaration: smqScope.emptyDeclaration(),
  fingerprint: "fp",
  verification: null,
  verificationCurrent: false,
  statements: [],
  runs: [],
});
function mount(step = 1) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[`/projects/p/scope?step=${step}`]}>
        <Routes>
          <Route path="/projects/:projectId/scope" element={<ScopePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(clientApi.scopeRegister).mockResolvedValue(fixture());
});
describe("Three-stage scope flow", () => {
  it("opens the requested sidebar step without generating", async () => {
    mount(3);
    await screen.findByText("Aucune version validée.");
    expect(clientApi.launchScope).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Générer une proposition" })).toBeDisabled();
  });
  it("requires complete declarations for professional verification", async () => {
    mount(2);
    await screen.findByText("Au moins un site avec nom et adresse complète est requis.");
    expect(
      screen.getByRole("button", { name: "Valider la vérification professionnelle" }),
    ).toBeDisabled();
  });
  it("saves local declarations without triggering AI", async () => {
    mount();
    const notes = await screen.findByLabelText("Notes du professionnel");
    vi.mocked(clientApi.writeScope).mockResolvedValue({
      ...fixture(),
      declaration: { ...fixture().declaration, notes: "Boundary note" },
      revision: 1,
    });
    await userEvent.type(notes, "Boundary note");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }));
    await waitFor(() =>
      expect(clientApi.writeScope).toHaveBeenCalledWith(
        "p",
        expect.objectContaining({
          kind: "declaration",
          declaration: expect.objectContaining({ notes: "Boundary note" }),
        }),
      ),
    );
    expect(clientApi.launchScope).not.toHaveBeenCalled();
  });
  it("exports the saved professional text and its frozen source snapshot in project language", () => {
    const f = fixture();
    const version = {
      id: "s",
      status: "VALIDATED" as const,
      version: 1,
      statement: "Professionally revised exact text",
      nonApplicable: [],
      fingerprint: "old-fp",
      verificationId: "v",
      model: "test",
      generatedAt: null,
      validatedAt: "2026-10-01",
      validatedById: "u",
      professionallyModified: true,
      updatedAt: "2026-10-01",
      sourceSnapshot: {
        facts: f.facts,
        declaration: {
          ...f.declaration,
          activities: "Repair",
          sites: [{ name: "Old Workshop", address: "Old address", type: "" }],
        },
        verification: {
          applicability: "applicable" as const,
          justification: "Professional responsibility review",
          acknowledgedFindings: [],
        },
      },
    };
    const exported = scopeExportSections(version);
    expect(exported.sections[0]?.body).toBe(version.statement);
    expect(exported.sections[1]?.body).toContain("Old address");
    expect(exported.labels.title).toBe("QMS scope");
  });
});
