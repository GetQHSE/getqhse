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
        name: "Usine Casablanca",
        organizationId: "org_1",
        description: "Suivi QHSE industriel",
        activities: ["Audit interne", "Gestion documentaire"],
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
      "/projects/project_1/chat",
    );
  });
});
