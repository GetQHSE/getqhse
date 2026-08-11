import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { adminApi } = vi.hoisted(() => ({ adminApi: vi.fn() }));

vi.mock("../../auth.js", () => ({
  useAdminAuth: () => ({
    user: {
      id: "super-1",
      name: "Super Admin",
      email: "admin@example.test",
      platformRole: "super_admin",
      status: "active",
    },
  }),
}));
vi.mock("../../lib/admin-api.js", () => ({
  adminApi,
  formatDate: (value: string) => value.slice(0, 10),
}));

import { PlatformUsersPage } from "./platform-users-page.js";

describe("PlatformUsersPage", () => {
  beforeEach(() => {
    adminApi.mockResolvedValue([
      {
        id: "operator-1",
        name: "Leila Mansouri",
        email: "leila@example.test",
        platformRole: "content_manager",
        status: "active",
        locale: "fr-MA",
        timezone: "Africa/Casablanca",
        createdAt: "2026-08-11T10:00:00Z",
      },
    ]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists operators and opens direct account creation", async () => {
    render(<PlatformUsersPage />);

    expect(await screen.findByText("Leila Mansouri")).toBeInTheDocument();
    expect(screen.getByText("leila@example.test")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add operator" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add a platform operator" })).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("minlength", "12");
    await waitFor(() => expect(adminApi).toHaveBeenCalledWith("/v1/platform-users?"));
  });
});
