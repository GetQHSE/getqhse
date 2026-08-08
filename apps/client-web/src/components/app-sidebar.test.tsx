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
    expect(screen.getByText("Veille réglementaire")).toBeInTheDocument();
    expect(screen.getByText("Paramètres")).toBeInTheDocument();
    expect(screen.queryByText("Équipe")).not.toBeInTheDocument();
  });
});
