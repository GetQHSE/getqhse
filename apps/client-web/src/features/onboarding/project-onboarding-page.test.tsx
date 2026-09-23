import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clientApi } from "../../app/client-api.js";
import { ProjectOnboardingPage } from "./project-onboarding-page.js";

vi.mock("../../app/client-api.js", () => ({ clientApi: { createProject: vi.fn() } }));
vi.mock("../../app/auth.js", () => ({
  useAuth: () => ({ activeOrganization: { id: "org-1", name: "Acme", slug: "acme" } }),
  useOptionalAuth: () => null,
}));

afterEach(cleanup);

describe("ProjectOnboardingPage", () => {
  it("supports suggested and custom activities without duplicates", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ProjectOnboardingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const custom = screen.getByRole("combobox", { name: "Activité personnalisée" });
    await userEvent.click(custom);
    await userEvent.click(await screen.findByRole("option", { name: "Fabrication" }));
    await userEvent.type(custom, "Conseil spécialisé{enter}");
    expect(screen.getByRole("button", { name: "Retirer Fabrication" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retirer Conseil spécialisé" })).toBeInTheDocument();
  });

  it("preselects no country and refuses to create a project without one", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ProjectOnboardingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("0 / 5 pays sélectionné")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: /nom/i }), "Atlas");
    const activity = screen.getByRole("combobox", { name: "Activité personnalisée" });
    await userEvent.click(activity);
    await userEvent.click(await screen.findByRole("option", { name: "Fabrication" }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(await screen.findByRole("button", { name: /Créer le projet/ }));

    expect(await screen.findByText("Sélectionnez au moins un pays")).toBeInTheDocument();
    expect(clientApi.createProject).not.toHaveBeenCalled();
  });

  it("sends the chosen project language, defaulting to the interface language", async () => {
    vi.mocked(clientApi.createProject).mockResolvedValue({ slug: "atlas" } as never);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ProjectOnboardingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const language = screen.getByRole("combobox", { name: /^Langue du projet/ });
    expect(language).toHaveValue("fr");
    await userEvent.selectOptions(language, "ar");
    await userEvent.type(screen.getByRole("textbox", { name: /nom/i }), "Atlas");
    await userEvent.click(screen.getByRole("combobox", { name: "Activité personnalisée" }));
    await userEvent.click(await screen.findByRole("option", { name: "Fabrication" }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("combobox", { name: "Pays d’activité" }));
    await userEvent.click(await screen.findByRole("option", { name: /Maroc/ }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(await screen.findByRole("button", { name: /Créer le projet/ }));

    await vi.waitFor(() =>
      expect(clientApi.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ language: "ar", countryCodes: ["MA"] }),
      ),
    );
  });
});
