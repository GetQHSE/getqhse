import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "@qhse/ui/components/sidebar";

import { AppSidebar } from "./app-sidebar.js";

const commonProps = {
  activeTeamId: "org-1",
  onLogout: vi.fn(),
  onSelectTeam: vi.fn(),
  teams: [{ id: "org-1", name: "Acme", slug: "acme" }],
  user: { name: "Naim", email: "naim@example.com" },
};

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      matches: false,
      media: query,
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(cleanup);

function renderSidebar(path: string, activeProject?: { name: string; slug: string }) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarProvider>
        <AppSidebar {...commonProps} activeProject={activeProject} />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("AppSidebar", () => {
  it("groups module steps and deep-links to the selected stage", async () => {
    renderSidebar("/projects/quality-system/risks?step=4", {
      name: "Quality System",
      slug: "quality-system",
    });
    const controls = screen.getByRole("link", { name: "Maîtrises existantes" });
    expect(controls).toHaveAttribute("href", "/projects/quality-system/risks?step=4");
    expect(controls).toHaveAttribute("data-active");
    const scope = screen.getByRole("button", { name: "Domaine d’application" });
    expect(scope).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(scope);
    expect(screen.getByRole("link", { name: "Vérification professionnelle" })).toHaveAttribute(
      "href",
      "/projects/quality-system/scope?step=2",
    );
  });
  it("groups process sheets under document management and links to their library", () => {
    renderSidebar("/projects/quality-system/process-sheets?step=2", {
      name: "Quality System",
      slug: "quality-system",
    });
    expect(screen.getByText("Gestion documentaire")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fiches processus" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("link", { name: "Bibliothèque des fiches" })).toHaveAttribute(
      "href",
      "/projects/quality-system/process-sheets?step=2",
    );
    expect(screen.getByRole("link", { name: "Bibliothèque des fiches" })).toHaveAttribute(
      "aria-current",
      "step",
    );
  });
  it("shows organization navigation outside a project", () => {
    renderSidebar("/projects");

    expect(screen.getByText("Projets")).toBeInTheDocument();
    expect(screen.getByText("Équipe")).toBeInTheDocument();
    expect(screen.queryByText("Chat")).not.toBeInTheDocument();
    expect(screen.queryByText("Veille réglementaire")).not.toBeInTheDocument();
  });

  it("shows project navigation and footer settings inside a project", () => {
    renderSidebar("/projects/quality-system/chat", {
      name: "Quality System",
      slug: "quality-system",
    });

    expect(screen.getByText("Quality System")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Profil")).toBeInTheDocument();
    expect(screen.getByText("Veille réglementaire et normative")).toBeInTheDocument();
    expect(screen.getByText("Paramètres")).toBeInTheDocument();
    expect(screen.queryByText("Équipe")).not.toBeInTheDocument();
  });
});
