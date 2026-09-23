import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "./auth.js";
import { AuthenticatedRoute, OrganizationRoute } from "./route-guards.js";

vi.mock("./auth.js", () => ({ useAuth: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("authenticated route loading", () => {
  it("keeps authenticated content mounted during session revalidation", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-1", email: "user@example.com" },
      organizations: [],
      activeOrganization: null,
      onboarding: null,
      projects: [],
      isPending: true,
      selectOrganization: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AuthenticatedRoute>
          <div>Dashboard conservé</div>
        </AuthenticatedRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText("Dashboard conservé")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps organization content mounted during background revalidation", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-1", email: "user@example.com" },
      organizations: [{ id: "org-1", name: "Atlas", slug: "atlas" }],
      activeOrganization: { id: "org-1", name: "Atlas", slug: "atlas" },
      onboarding: {
        nextStep: "OPEN_PROJECTS",
        organizationCount: 1,
        projectCount: 1,
      },
      projects: [],
      isPending: true,
      selectOrganization: vi.fn(),
      logout: vi.fn(),
    } as never);

    render(
      <MemoryRouter initialEntries={["/projects/atlas/chat"]}>
        <OrganizationRoute>
          <div>Conversation conservée</div>
        </OrganizationRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText("Conversation conservée")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows members a waiting state instead of project onboarding", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "member-1", email: "member@example.com" },
      organizations: [
        { id: "org-1", name: "Atlas", slug: "atlas", role: "member", status: "active" },
      ],
      activeOrganization: {
        id: "org-1",
        name: "Atlas",
        slug: "atlas",
        role: "member",
        status: "active",
      },
      onboarding: {
        authenticated: true,
        organizationsCount: 1,
        activeOrganization: {
          id: "org-1",
          name: "Atlas",
          slug: "atlas",
          icon: null,
        },
        activeOrganizationProjectCount: 0,
        nextStep: "WAIT_FOR_PROJECT",
      },
      projects: [],
      isPending: false,
      selectOrganization: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <OrganizationRoute>
          <div>Unauthorized project form</div>
        </OrganizationRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText("Votre espace est en cours de préparation")).toBeInTheDocument();
    expect(screen.queryByText("Unauthorized project form")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Voir les membres de l’organisation" }),
    ).toHaveAttribute("href", "/team");
  });
});
