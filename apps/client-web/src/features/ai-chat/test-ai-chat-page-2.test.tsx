import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { TestAiChatPage2 } from "./test-ai-chat-page-2.js";

afterEach(cleanup);

describe("TestAiChatPage2", () => {
  it("presents a split conversation and structured answer workspace", () => {
    render(<TestAiChatPage2 />);

    expect(screen.getByText("Entretien guidé")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Conversation" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Espace de réponse" })).toBeInTheDocument();
    expect(screen.getByText("10 sur 33")).toBeInTheDocument();
  });

  it("allows process selection and visual confirmation", async () => {
    const user = userEvent.setup();
    render(<TestAiChatPage2 />);

    const purchasing = screen.getByRole("button", { name: /Achats/ });
    expect(purchasing).toHaveAttribute("aria-pressed", "false");
    await user.click(purchasing);
    expect(purchasing).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Valider 3 processus" }));
    expect(screen.getByText("Réponse enregistrée")).toBeInTheDocument();
    expect(screen.getByText("3 processus sélectionnés")).toBeInTheDocument();
  });
});
