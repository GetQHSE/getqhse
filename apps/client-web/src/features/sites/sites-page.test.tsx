import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SitesPage } from "./sites-page.js";

describe("SitesPage", () => {
  it("loads sites through the typed API client", async () => {
    const client = {
      listSites: async () => ({
        data: [
          {
            id: "site-1",
            organizationId: "org-1",
            name: "Casablanca Plant",
            code: "CAS-01",
            address: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        meta: { nextCursor: null, hasMore: false },
      }),
      createSite: async () => {
        throw new Error("not used");
      },
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SitesPage client={client} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Casablanca Plant")).toBeInTheDocument();
  });
});
