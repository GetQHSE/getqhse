import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PromptDetailView } from "@qhse/contracts";

const { adminApi } = vi.hoisted(() => ({ adminApi: vi.fn() }));
vi.mock("../../lib/admin-api.js", () => ({ adminApi, formatDate: () => "Oct 11, 2026" }));
import { AiPromptsTab } from "./ai-prompts-tab.js";

const definition = {
  key: "context.internal-issues",
  page: "Context analysis",
  section: "Internal context",
  version: 2,
  template: "Original instructions {{languageRule}}",
  variables: ["languageRule"],
  protectedVariables: ["languageRule"],
  legacy: false,
  responseMode: "json" as const,
  activeRevisionId: "revision-1",
  generation: 3,
  activeCompatible: true,
};
const detail: PromptDetailView = {
  definition,
  protectedRules: "Never invent facts.",
  publications: [],
  revisions: [
    {
      id: "revision-1",
      promptKey: definition.key,
      baseVersion: 2,
      template: "Published instructions {{languageRule}}",
      templateHash: "hash",
      status: "VALIDATED",
      changeNote: "Concise instructions",
      createdById: "editor",
      createdAt: "2026-10-11",
      validatedById: "editor",
      validatedAt: "2026-10-11",
      validationNote: "Reviewed examples",
      tests: [
        {
          id: "test-1",
          language: "fr",
          output: '{"issues": []}',
          provider: "openai",
          model: "model",
          createdAt: "2026-10-11",
        },
      ],
    },
  ],
};

function response(path: string, view = structuredClone(detail)) {
  return path === "/v1/ai-prompts/source"
    ? { source: "DATABASE", generation: 0 }
    : path === "/v1/ai-prompts"
      ? [view.definition]
      : view;
}

beforeEach(() => {
  adminApi.mockImplementation((path: string) => Promise.resolve(response(path)));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AI prompt admin", () => {
  it("shows published instructions and permits support users to inspect but not mutate", async () => {
    render(<AiPromptsTab role="support" />);
    expect(await screen.findByLabelText("Business instructions")).toHaveValue(
      "Published instructions {{languageRule}}",
    );
    expect(screen.getByLabelText("Business instructions")).toHaveAttribute("readonly");
    expect(screen.getByRole("switch", { name: "Use database prompts" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Use database prompts" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(adminApi.mock.calls.some((call) => call[0] === "/v1/ai-prompts/source" && call[1])).toBe(
      false,
    );
    expect(screen.queryByRole("button", { name: "Save new draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publish/ })).not.toBeInTheDocument();
    expect(screen.getByText('{"issues": []}')).toBeInTheDocument();
  });

  it("creates a draft without publishing and blocks previews of unsaved edits", async () => {
    render(<AiPromptsTab role="content_manager" />);
    const instructions = await screen.findByLabelText("Business instructions");
    expect(screen.getByRole("switch", { name: "Use database prompts" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    fireEvent.change(instructions, { target: { value: "New instructions {{languageRule}}" } });
    fireEvent.change(screen.getByLabelText("Synthetic example input"), {
      target: { value: "Synthetic company" },
    });
    expect(screen.getByRole("button", { name: "Run preview" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("What changed?"), {
      target: { value: "Clarified guidance" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save new draft" }));
    await waitFor(() =>
      expect(adminApi).toHaveBeenCalledWith("/v1/ai-prompts/context.internal-issues/revisions", {
        method: "POST",
        body: JSON.stringify({
          template: "New instructions {{languageRule}}",
          changeNote: "Clarified guidance",
        }),
      }),
    );
    expect(adminApi.mock.calls.some((call) => String(call[0]).endsWith("/publish"))).toBe(false);
    expect(screen.queryByRole("button", { name: /Publish for all/ })).not.toBeInTheDocument();
  });

  it("publishes the selected validated revision with its observed generation", async () => {
    const candidate = structuredClone(detail);
    candidate.revisions[0]!.id = "revision-2";
    adminApi.mockImplementation((path: string) => Promise.resolve(response(path, candidate)));
    render(<AiPromptsTab role="platform_admin" />);
    await screen.findByLabelText("Business instructions");
    fireEvent.change(screen.getByLabelText("Revision to review or copy"), {
      target: { value: "revision-2" },
    });
    fireEvent.change(screen.getByLabelText("Validation or publication note"), {
      target: { value: "Approved by PO" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish for all organizations" }));
    await waitFor(() =>
      expect(adminApi).toHaveBeenCalledWith("/v1/ai-prompts/context.internal-issues/publish", {
        method: "POST",
        body: JSON.stringify({
          revisionId: "revision-2",
          expectedGeneration: 3,
          action: "PUBLISH",
          note: "Approved by PO",
        }),
      }),
    );
  });

  it("requires a saved preview before manual validation and exposes publication failures", async () => {
    const draft = structuredClone(detail);
    draft.definition.activeRevisionId = null;
    draft.revisions[0]!.status = "DRAFT";
    draft.revisions[0]!.tests = [];
    adminApi.mockImplementation((path: string) => Promise.resolve(response(path, draft)));
    render(<AiPromptsTab role="platform_admin" />);
    await screen.findByLabelText("Business instructions");
    fireEvent.change(screen.getByLabelText("Revision to review or copy"), {
      target: { value: "revision-1" },
    });
    fireEvent.change(screen.getByLabelText("Validation or publication note"), {
      target: { value: "Reviewed examples" },
    });
    expect(screen.getByRole("button", { name: "Validate revision" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publish for all organizations" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("What changed?"), { target: { value: "New version" } });
    adminApi.mockRejectedValueOnce(new Error("Another administrator published a change"));
    fireEvent.click(screen.getByRole("button", { name: "Save new draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Another administrator published a change",
    );
  });

  it("switches sources without discarding edits and restores database prompts", async () => {
    render(<AiPromptsTab role="platform_admin" />);
    const instructions = await screen.findByLabelText("Business instructions");
    fireEvent.change(instructions, { target: { value: "Unsaved instructions" } });
    adminApi.mockResolvedValueOnce({ source: "CODE", generation: 1 });
    fireEvent.click(screen.getByRole("switch", { name: "Use database prompts" }));
    await waitFor(() => expect(screen.getByRole("switch")).not.toBeChecked());
    expect(adminApi).toHaveBeenLastCalledWith("/v1/ai-prompts/source", {
      method: "POST",
      body: JSON.stringify({ source: "CODE", expectedGeneration: 0 }),
    });
    expect(instructions).toHaveValue("Unsaved instructions");
    expect(screen.getByText("Code default active")).toBeInTheDocument();
    adminApi.mockResolvedValueOnce({ source: "DATABASE", generation: 2 });
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(screen.getByRole("switch")).toBeChecked());
    expect(adminApi).toHaveBeenLastCalledWith("/v1/ai-prompts/source", {
      method: "POST",
      body: JSON.stringify({ source: "DATABASE", expectedGeneration: 1 }),
    });
  });

  it("keeps the previous source selected if saving fails", async () => {
    render(<AiPromptsTab role="platform_admin" />);
    await screen.findByLabelText("Business instructions");
    adminApi.mockRejectedValueOnce(new Error("Unable to save prompt source"));
    fireEvent.click(screen.getByRole("switch"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save prompt source");
    expect(screen.getByRole("switch")).toBeChecked();
  });
});
