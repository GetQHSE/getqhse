import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { adminApi } = vi.hoisted(() => ({ adminApi: vi.fn() }));

vi.mock("../../auth.js", () => ({
  useAdminAuth: () => ({ user: { platformRole: "content_manager" } }),
}));
vi.mock("../../lib/admin-api.js", () => ({
  adminApi,
  formatDate: (value: string) => value.slice(0, 10),
}));

import { KnowledgeListPage } from "./knowledge-list-page.js";

describe("KnowledgeListPage", () => {
  beforeEach(() => {
    adminApi.mockResolvedValue({
      items: [
        {
          id: "knowledge-1",
          feature: "DISCOVERY",
          status: "DRAFT",
          source: "CUSTOMER_REVIEW",
          title: "Waste-law correction",
          scenarioSummary: "Industrial site producing controlled waste.",
          tags: ["waste"],
          rating: 2,
          expectedResult: null,
          embeddingStatus: "PENDING",
          payload: { includedLaws: [{ title: "Waste law" }], excludedLaws: [] },
          sourceOrganization: { id: "org-1", name: "Atlas" },
          sourceProject: { id: "project-1", name: "Factory" },
          updatedAt: "2026-09-11T10:00:00Z",
        },
      ],
      pagination: { page: 1, pageSize: 25, total: 1, pageCount: 1 },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows discovery provenance and applies filters", async () => {
    render(<KnowledgeListPage feature="DISCOVERY" />, { wrapper: MemoryRouter });
    expect(await screen.findByText("Waste-law correction")).toBeInTheDocument();
    expect(screen.getByText("Atlas · Factory")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add example/ })).toHaveAttribute(
      "href",
      "/knowledge/discovery/new",
    );

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "DRAFT" } });
    await waitFor(() => expect(adminApi.mock.calls.at(-1)?.[0]).toContain("status=DRAFT"));
  });
});
