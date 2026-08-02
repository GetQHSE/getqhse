import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ProjectsPage } from "./projects-page.js";

vi.mock("../../app/auth.js", () => ({
  useAuth: () => ({
    activeOrganization: { id: "org_1", name: "ACME QHSE", slug: "acme" },
    projects: [
      {
        id: "project_1",
        slug: "usine-casablanca",
        name: "Usine Casablanca",
        organizationId: "org_1",
        createdById: "user_1",
        logoUrl: null,
        entityType: "INDUSTRIAL_SITE",
        countryCode: "MA",
        standardCode: "ISO_9001",
        status: "EMPTY",
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
        description: "Suivi QHSE industriel",
        activities: [{ id: "activity_1", name: "Manufacturing", isPrimary: true }],
      },
    ],
  }),
}));

describe("ProjectsPage", () => {
  it("renders project cards with chat links", () => {
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Projets" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Usine Casablanca" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ouvrir le chat projet" })).toHaveAttribute(
      "href",
      "/projects/usine-casablanca/chat",
    );
  });
});
