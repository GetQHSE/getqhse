import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { TestAiChatPage } from "./test-ai-chat-page.js";

afterEach(cleanup);

describe("TestAiChatPage", () => {
  it("shows the guided question, profile progress, and realistic conversation states", () => {
    render(<TestAiChatPage />);

    expect(screen.getByRole("heading", { name: "Assistant QHSE" })).toBeInTheDocument();
    expect(screen.getByText("Question 10 sur 33")).toBeInTheDocument();
    expect(screen.getByText("Progression du profil")).toBeInTheDocument();
    expect(screen.getByText("Information enregistrée")).toBeInTheDocument();
  });

  it("lets a reviewer try suggestions, attachments, voice state, and message sending", async () => {
    const user = userEvent.setup();
    render(<TestAiChatPage />);

    await user.click(screen.getByRole("button", { name: "Production et contrôle qualité" }));
    expect(screen.getByLabelText("Votre réponse")).toHaveValue("Production et contrôle qualité");

    await user.click(screen.getByRole("button", { name: "Ajouter un fichier" }));
    expect(screen.getByText("Processus_Atlas.docx")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Enregistrer un message vocal" }));
    expect(screen.getByText("00:12")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Envoyer la réponse" }));
    expect(
      screen.getByText("Production et contrôle qualité", { selector: "p" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("00:12")).not.toBeInTheDocument();
  });
});
