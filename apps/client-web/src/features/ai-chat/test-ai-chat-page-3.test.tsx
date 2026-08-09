import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { TestAiChatPage3 } from "./test-ai-chat-page-3.js";

afterEach(cleanup);

describe("TestAiChatPage3", () => {
  it("keeps the conversation full-width with compact profile status", () => {
    render(<TestAiChatPage3 />);

    expect(screen.getByRole("region", { name: "Conversation de profil" })).toBeInTheDocument();
    expect(screen.getByText(/9 réponses sur 33/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Voir les détails/ })).toBeInTheDocument();
    expect(screen.getByText("Question 10 sur 33")).toBeInTheDocument();
    expect(screen.queryByText("Conversation enregistrée")).not.toBeInTheDocument();
    expect(screen.queryByText("Prototype 3")).not.toBeInTheDocument();
  });

  it("opens profile details on demand without permanently reducing chat width", async () => {
    const user = userEvent.setup();
    render(<TestAiChatPage3 />);

    await user.click(screen.getByRole("button", { name: /Voir les détails/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Progression globale")).toBeInTheDocument();
    expect(screen.getByText("4 confirmées")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ouvrir la page profil" })).toBeInTheDocument();
  });
});
