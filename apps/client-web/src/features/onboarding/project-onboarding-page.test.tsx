import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ProjectOnboardingPage } from "./project-onboarding-page.js";

vi.mock("../../app/client-api.js", () => ({ clientApi: { createProject: vi.fn() } }));

describe("ProjectOnboardingPage", () => {
  it("supports suggested and custom activities without duplicates", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ProjectOnboardingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Manufacturing" }));
    const custom = screen.getByRole("textbox", { name: "Activité personnalisée" });
    await userEvent.type(custom, "Conseil spécialisé{enter}");
    expect(screen.getByRole("button", { name: "Retirer Manufacturing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retirer Conseil spécialisé" })).toBeInTheDocument();
  });
});
