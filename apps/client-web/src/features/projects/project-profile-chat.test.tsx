import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { clientApi } from "../../app/client-api.js";
import { ProjectProfileChat } from "./project-profile-chat.js";

const sendMessage = vi.fn();
const setMessages = vi.fn();
const toolMessage = {
  id: "assistant-1",
  role: "assistant" as const,
  parts: [
    { type: "text" as const, text: "Merci, cette information est enregistrée." },
    {
      type: "tool-recordProfileAnswers" as const,
      toolCallId: "tool-1",
      state: "output-available" as const,
      input: {
        answers: [{ key: "organization.employeeCount", valueJson: "42", confidence: 1 }],
      },
      output: {
        acceptedKeys: ["organization.employeeCount"],
        rejectedAnswers: [],
        nextQuestion: {
          key: "operations.keyProcesses",
          prompt: "Quels sont vos processus clés ?",
        },
        completenessPercent: 27,
        regulatoryReadiness: 20,
      },
    },
  ],
};

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [toolMessage],
    setMessages,
    sendMessage,
    status: "ready",
    error: undefined,
    stop: vi.fn(),
  }),
}));

vi.mock("../../app/client-api.js", () => ({
  clientApi: {
    projectProfile: vi.fn(),
    projectProfileConversation: vi.fn(),
    createFileUpload: vi.fn(),
    completeFileUpload: vi.fn(),
    transcribeVoiceNote: vi.fn(),
  },
}));

const profile = {
  project: {
    id: "project-1",
    organizationId: "org-1",
    createdById: "user-1",
    name: "Atlas Industrie",
    slug: "atlas-industrie",
    logoUrl: null,
    entityType: "COMPANY",
    countryCode: "MA",
    standardCode: "ISO_9001",
    description: null,
    status: "PROFILE_IN_PROGRESS",
    activities: [],
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z",
  },
  profile: {
    id: "profile-1",
    schemaVersion: 1,
    revision: 4,
    status: "IN_PROGRESS",
    completedAt: null,
    lastReviewedAt: null,
    nextReviewAt: null,
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z",
  },
  fields: [
    {
      id: "field-1",
      key: "organization.employeeCount",
      value: 42,
      status: "ANSWERED",
      source: "USER_CHAT",
      confidence: 1,
      notApplicableReason: null,
      confirmedAt: null,
      updatedAt: "2026-08-09T10:00:00.000Z",
    },
  ],
  completion: {
    answeredRequired: 9,
    totalRequired: 32,
    completenessPercent: 28,
    answeredRegulatory: 2,
    totalRegulatory: 12,
    regulatoryReadiness: 17,
    missingRequiredKeys: [],
    missingRegulatoryKeys: [],
  },
  nextQuestion: {
    key: "operations.keyProcesses",
    section: "IDENTITY_ACTIVITY",
    prompt: "Quels sont vos processus clés ?",
    required: true,
    regulatoryCritical: true,
    allowNotApplicable: false,
  },
};

function renderChat() {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ProjectProfileChat projectIdOrSlug="atlas-industrie" />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(clientApi.projectProfile).mockResolvedValue(profile as never);
  vi.mocked(clientApi.projectProfileConversation).mockResolvedValue({
    id: "conversation-1",
    status: "ACTIVE",
    language: "fr",
    currentQuestionKey: "operations.keyProcesses",
    messages: [],
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z",
  });
});

describe("ProjectProfileChat", () => {
  it("renders profile tool results as trusted UI components", async () => {
    renderChat();

    expect(await screen.findByText("1 information enregistrée")).toBeInTheDocument();
    expect(screen.getByText("Effectif")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Quels sont vos processus clés ?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("28%")).toBeInTheDocument();
  });

  it("sends a streamed turn with the active conversation context", async () => {
    renderChat();
    const input = await screen.findByRole("textbox", { name: "Votre réponse" });
    await userEvent.type(input, "Production, contrôle qualité et expédition");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer la réponse" }));

    expect(sendMessage).toHaveBeenCalledWith(
      {
        text: "Production, contrôle qualité et expédition",
        metadata: {
          createdAt: expect.any(String),
        },
      },
      {
        body: {
          conversationId: "conversation-1",
          attachmentIds: [],
        },
      },
    );
  });
});
