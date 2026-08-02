import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ProjectOnboardingPage } from "./project-onboarding-page.js";

vi.mock("../../app/client-api.js", () => ({
  clientApi: {
    createProject: vi.fn(),
  },
}));

describe("ProjectOnboardingPage", () => {
  it("exposes accessible multi-select activities and validates a selection", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ProjectOnboardingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const audit = screen.getByRole("checkbox", { name: "Audit interne" });
    const documents = screen.getByRole("checkbox", { name: "Gestion documentaire" });
    await userEvent.click(audit);
    await userEvent.click(documents);

    expect(audit).toBeChecked();
    expect(documents).toBeChecked();
  });
});
