import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectChatPage } from "./project-chat-page.js";

const mounted = vi.fn();
const unmounted = vi.fn();

vi.mock("./project-profile-chat.js", () => ({
  ProjectProfileChat: ({ projectIdOrSlug }: { projectIdOrSlug: string }) => {
    useEffect(() => {
      mounted(projectIdOrSlug);
      return () => unmounted(projectIdOrSlug);
    }, [projectIdOrSlug]);
    return <div>Conversation {projectIdOrSlug}</div>;
  },
}));

function ProjectSwitcher() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/projects/beta/chat")}>
        Projet beta
      </button>
      <Routes>
        <Route path="/projects/:projectId/chat" element={<ProjectChatPage />} />
      </Routes>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProjectChatPage", () => {
  it("remounts the conversation when the selected project changes", async () => {
    render(
      <MemoryRouter initialEntries={["/projects/alpha/chat"]}>
        <ProjectSwitcher />
      </MemoryRouter>,
    );

    expect(screen.getByText("Conversation alpha")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Projet beta" }));

    expect(screen.getByText("Conversation beta")).toBeInTheDocument();
    expect(mounted).toHaveBeenCalledWith("alpha");
    expect(unmounted).toHaveBeenCalledWith("alpha");
    expect(mounted).toHaveBeenCalledWith("beta");
  });
});
