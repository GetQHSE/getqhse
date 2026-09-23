import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { adminApi } = vi.hoisted(() => ({ adminApi: vi.fn() }));

vi.mock("../../lib/admin-api.js", () => ({
  adminApi,
  formatDate: (value: string) => value.slice(0, 10),
}));

import { OrganizationsPage } from "./organizations-page.js";

describe("OrganizationsPage", () => {
  beforeEach(() => {
    adminApi.mockResolvedValue({
      items: [
        {
          id: "org-1",
          name: "Atlas Safety",
          slug: "atlas-safety",
          logo: null,
          status: "active",
          locale: "fr-MA",
          timezone: "Africa/Casablanca",
          createdAt: "2026-08-11T10:00:00Z",
          _count: { members: 3, projects: 2, aiInvocations: 18 },
        },
      ],
      pagination: { total: 1, page: 1, pageSize: 25, pageCount: 1 },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders organizations with a project drill-down entry point", async () => {
    render(<OrganizationsPage />, { wrapper: MemoryRouter });

    const organization = await screen.findByRole("link", { name: /Atlas Safety/ });
    expect(organization).toHaveAttribute("href", "/organizations/org-1");
    expect(screen.getAllByText("18")).toHaveLength(2);
  });

  it("sends search and filter values to the API", async () => {
    render(<OrganizationsPage />, { wrapper: MemoryRouter });
    await screen.findByText("Atlas Safety");

    fireEvent.change(screen.getByPlaceholderText("Search organization or slug"), {
      target: { value: "atlas" },
    });
    fireEvent.change(screen.getByLabelText("Organization status"), {
      target: { value: "active" },
    });

    await waitFor(() =>
      expect(adminApi).toHaveBeenCalledWith(expect.stringContaining("search=atlas")),
    );
    expect(adminApi.mock.calls.at(-1)?.[0]).toContain("status=active");
  });
});
