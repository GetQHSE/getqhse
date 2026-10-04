import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { planningRegisterSchema } from "@qhse/contracts";
import { smqPlanning } from "@qhse/domain";
import { clientApi } from "../../app/client-api.js";
import { planningExportContent } from "./export.js";
import { PlanningPage } from "./planning-page.js";
vi.mock("../../app/client-api.js", () => ({
  clientApi: {
    planningRegister: vi.fn(),
    writePlanning: vi.fn(),
    launchPlanning: vi.fn(),
    exportPlanningExcel: vi.fn(),
  },
}));
const fixture = () =>
  planningRegisterSchema.parse({
    projectId: "p",
    module: "policy",
    revision: 0,
    document: smqPlanning.emptyDocument(),
    fingerprint: "fp",
    current: true,
    sources: {
      facts: {
        projectName: "Atlas",
        organizationName: "Group",
        language: "en",
        standard: "ISO_9001",
        projectActivities: [],
        profile: [],
        issues: [],
        parties: [],
        requirements: [],
        risks: [],
      },
      scope: { id: "s", version: 1, statement: "Repair", current: true },
    },
    versions: [],
    runs: [],
  });
function mount(module: "policy" | "processes" = "policy", step = 1) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <MemoryRouter initialEntries={[`/projects/p/${module}?step=${step}`]}>
        <Routes>
          <Route path="/projects/:projectId/:module" element={<PlanningPage module={module} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(clientApi.planningRegister).mockResolvedValue(fixture());
});
describe("Planning pages", () => {
  it("keeps incomplete deep-linked objectives locked without generating", async () => {
    mount("policy", 4);
    await screen.findByText("Complétez et validez les étapes précédentes pour ouvrir cette étape.");
    expect(clientApi.launchPlanning).not.toHaveBeenCalled();
  });
  it("saves management input without inferring or generating directions", async () => {
    mount();
    const input = await screen.findByLabelText("Nom du signataire");
    vi.mocked(clientApi.writePlanning).mockResolvedValue({ ...fixture(), revision: 1 });
    await userEvent.type(input, "Reviewer");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));
    await waitFor(() =>
      expect(clientApi.writePlanning).toHaveBeenCalledWith(
        "p",
        "policy",
        expect.objectContaining({
          kind: "save",
          document: expect.objectContaining({
            directions: expect.objectContaining({ signatoryName: "Reviewer" }),
          }),
        }),
      ),
    );
    expect(clientApi.launchPlanning).not.toHaveBeenCalled();
  });
  it("shows the latest four process stages and requires explicit generation", async () => {
    mount("processes");
    await screen.findByText(
      "Un processus transforme des entrées en sorties. Classez-le selon son rôle réel, puis tranchez chaque proposition.",
    );
    expect(
      screen.getByRole("button", { name: "1. Identification & classification" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "2. Interactions" })).toBeDisabled();
    expect(clientApi.launchPlanning).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Générer une proposition" }));
    await waitFor(() =>
      expect(clientApi.launchPlanning).toHaveBeenCalledWith("p", "processes", {
        revision: 0,
        stage: "processes",
      }),
    );
  });
  it("renders the reviewed family diagram and exports in project language", async () => {
    const f = fixture(),
      process = (id: string) => ({
        id,
        title: "Repair " + id,
        purpose: "Repair",
        inputs: "Orders",
        outputs: "Repairs",
        family: "realization" as const,
        decision: "retained" as const,
        pilotName: "Reviewer",
        pilotRole: "Director",
      });
    f.document.processes = [process("a"), process("b")];
    f.document.interactions = [
      { id: "i", from: "a", to: "b", flow: "Order details", decision: "retained" },
    ];
    vi.mocked(clientApi.planningRegister).mockResolvedValue(f);
    mount("processes", 4);
    await screen.findByRole("img", {
      name: "Exigences clients et exigences réglementaires → Satisfaction client",
    });
    expect(screen.getByRole("button", { name: "Valider la cartographie" })).toBeEnabled();
    const exported = planningExportContent({
      id: "v",
      kind: "processes",
      version: 1,
      document: f.document,
      sources: f.sources,
      fingerprint: "fp",
      authorId: "reviewer",
      createdAt: "2026-10-04T00:00:00Z",
    });
    expect(exported.title).toBe("Process mapping");
    expect(exported.rows[0]?.[1]).toBe("Realization");
    expect(exported.interactions[0]).toEqual(["Repair a", "Order details", "Repair b"]);
  });
  it("blocks generation for stale sources", async () => {
    vi.mocked(clientApi.planningRegister).mockResolvedValue({ ...fixture(), current: false });
    mount("processes");
    expect(await screen.findByRole("button", { name: "Générer une proposition" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reprendre la revue des sources" })).toBeEnabled();
  });
});
