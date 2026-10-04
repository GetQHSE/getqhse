import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { processSheetRegisterSchema, processSheetVersionSchema } from "@qhse/contracts";
import { smqProcessSheets } from "@qhse/domain";
import { clientApi } from "../../app/client-api.js";
import { ProcessSheetsPage } from "./process-sheets-page.js";
import { processSheetExportSections } from "./export.js";
vi.mock("../../app/client-api.js", () => ({
  clientApi: {
    processSheets: vi.fn(),
    prepareProcessSheet: vi.fn(),
    writeProcessSheet: vi.fn(),
    launchProcessSheet: vi.fn(),
    exportProcessSheet: vi.fn(),
  },
}));
const process = (id: string) => ({
  id,
  title: "Repair " + id,
  purpose: "Repair orders",
  inputs: "Orders",
  outputs: "Repairs",
  decision: "retained",
  family: "realization",
  pilotName: "Reviewer",
  pilotRole: "Director",
});
const fixture = () =>
  processSheetRegisterSchema.parse({
    projectId: "p",
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
      map: {
        id: "m",
        version: 1,
        current: true,
        processes: [process("a"), process("b"), process("c")],
        interactions: [
          { id: "i", from: "a", to: "b", flow: "Repair order", decision: "retained" },
          { id: "x", from: "b", to: "c", flow: "Other flow", decision: "retained" },
        ],
      },
      policy: null,
      objectivesVersionId: null,
      objectivesVersion: null,
      objectives: [],
    },
    sheets: [],
    versions: [],
    runs: [],
  });
const withSheet = () => {
  const f = fixture();
  f.sheets.push({
    id: "sheet",
    processId: "a",
    revision: 0,
    content: smqProcessSheets.emptyContent(f.sources.map!.processes[0]!, "2026-10-04"),
    sourceSnapshot: { processId: "a", sources: f.sources },
    fingerprint: "fp",
    current: true,
    available: true,
    updatedAt: "2026-10-04T00:00:00Z",
  });
  return f;
};
function mount(search = "") {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <MemoryRouter initialEntries={["/projects/p/process-sheets" + search]}>
        <Routes>
          <Route path="/projects/:projectId/process-sheets" element={<ProcessSheetsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(clientApi.processSheets).mockResolvedValue(fixture());
});
describe("Process sheets editor and library", () => {
  it("lists validated processes without preparing or generating automatically", async () => {
    mount();
    await screen.findByRole("heading", { name: "Repair a" });
    expect(clientApi.prepareProcessSheet).not.toHaveBeenCalled();
    expect(clientApi.launchProcessSheet).not.toHaveBeenCalled();
  });
  it("does not prepare a deep-linked sheet until the professional clicks", async () => {
    mount("?process=a");
    const button = await screen.findByRole("button", { name: "Préparer la fiche" });
    expect(clientApi.prepareProcessSheet).not.toHaveBeenCalled();
    vi.mocked(clientApi.prepareProcessSheet).mockResolvedValue(withSheet());
    await userEvent.click(button);
    await waitFor(() => expect(clientApi.prepareProcessSheet).toHaveBeenCalledWith("p", "a"));
  });
  it("blocks validation and AI for an incomplete sheet and saves manual description", async () => {
    const f = withSheet();
    vi.mocked(clientApi.processSheets).mockResolvedValue(f);
    vi.mocked(clientApi.writeProcessSheet).mockResolvedValue(f);
    mount("?process=a");
    expect(
      await screen.findByRole("button", { name: "Valider la fiche processus" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Proposer le détail des activités" })).toBeDisabled();
    const input = screen.getByLabelText("Décrivez le processus et son fonctionnement réel");
    await userEvent.type(input, "Receive the order, repair and inspect goods.");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));
    await waitFor(() =>
      expect(clientApi.writeProcessSheet).toHaveBeenCalledWith(
        "p",
        "sheet",
        expect.objectContaining({
          kind: "save",
          content: expect.objectContaining({
            description: "Receive the order, repair and inspect goods.",
          }),
        }),
      ),
    );
    expect(clientApi.launchProcessSheet).not.toHaveBeenCalled();
  });
  it("shows only relevant interactions and retains project-language exports", async () => {
    const f = withSheet();
    vi.mocked(clientApi.processSheets).mockResolvedValue(f);
    mount("?process=a");
    await screen.findByRole("heading", { name: "Interactions du processus" });
    expect(screen.getByText("Repair order")).toBeInTheDocument();
    expect(screen.queryByText("Other flow")).not.toBeInTheDocument();
    const v = processSheetVersionSchema.parse({
      id: "v",
      sheetId: "sheet",
      processId: "a",
      version: 1,
      content: f.sheets[0]!.content,
      sourceSnapshot: { processId: "a", sources: f.sources },
      fingerprint: "fp",
      validatedById: "reviewer",
      validatedAt: "2026-10-04T00:00:00Z",
    });
    const exportData = processSheetExportSections(v);
    expect(exportData.title).toBe("Process sheet — Repair a");
    expect(exportData.sections.find((s) => s.title === "Process interactions")?.rows).toEqual([
      ["Repair a", "", "Repair order", "Repair b"],
    ]);
  });
  it("opens the library step directly and does not generate", async () => {
    mount("?step=2");
    await screen.findByText(
      "Aucune fiche validée. Les versions apparaîtront ici après validation professionnelle.",
    );
    expect(clientApi.launchProcessSheet).not.toHaveBeenCalled();
  });
});
