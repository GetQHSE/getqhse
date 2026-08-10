import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { clientApi } from "../../app/client-api.js";
import {
  conversationMessages,
  ProjectProfileChat,
  reconcileConversationMessages,
} from "./project-profile-chat.js";

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
let mockChatMessages: (typeof toolMessage)[] = [toolMessage];

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: mockChatMessages,
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

const conversation = {
  id: "conversation-1",
  status: "ACTIVE",
  language: "fr",
  currentQuestionKey: "operations.keyProcesses",
  messages: [],
  createdAt: "2026-08-09T10:00:00.000Z",
  updatedAt: "2026-08-09T10:00:00.000Z",
};

function renderChat(queryClient?: QueryClient) {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          queryClient ??
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
        }
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
  mockChatMessages = [toolMessage];
  vi.mocked(clientApi.projectProfile).mockResolvedValue(profile as never);
  vi.mocked(clientApi.projectProfileConversation).mockResolvedValue(conversation as never);
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

  it("collapses repeated rejected tool calls into one clarification card", async () => {
    const rejectionOutput = {
      acceptedKeys: [],
      rejectedAnswers: [
        { key: "organization.offerings", reason: "Invalid input: expected object" },
      ],
      nextQuestion: {
        key: "organization.offerings",
        prompt: "Quels produits ou services proposez-vous ?",
      },
      completenessPercent: 9,
      regulatoryReadiness: 0,
    };
    mockChatMessages = [
      {
        id: "assistant-rejections",
        role: "assistant",
        parts: [
          {
            type: "tool-recordProfileAnswers",
            toolCallId: "rejected-1",
            state: "output-available",
            input: { answers: [] },
            output: rejectionOutput,
          },
          {
            type: "tool-recordProfileAnswers",
            toolCallId: "rejected-2",
            state: "output-available",
            input: { answers: [] },
            output: rejectionOutput,
          },
        ],
      },
    ] as never;

    renderChat();

    expect(
      await screen.findAllByText(
        "Une information nécessite une précision avant d’être enregistrée.",
      ),
    ).toHaveLength(1);
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

  it("uses a chat-shaped skeleton only while the profile has never loaded", () => {
    mockChatMessages = [];
    vi.mocked(clientApi.projectProfile).mockReturnValue(new Promise(() => {}));
    vi.mocked(clientApi.projectProfileConversation).mockReturnValue(new Promise(() => {}));

    renderChat();

    expect(screen.getByRole("status", { name: "Chargement de la conversation" })).toBeVisible();
    expect(screen.queryByText("Chargement de la conversation…")).toBeInTheDocument();
  });

  it("keeps the profile and composer visible while conversation history loads", async () => {
    mockChatMessages = [];
    vi.mocked(clientApi.projectProfileConversation).mockReturnValue(new Promise(() => {}));

    renderChat();

    expect(await screen.findByText(/Atlas Industrie/)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Chargement de l’historique" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Votre réponse" })).toBeEnabled();
  });

  it("does not clear an optimistic message when initial history finishes loading", async () => {
    mockChatMessages = [];
    renderChat();

    await waitFor(() => expect(setMessages).toHaveBeenCalled());
    const updater = setMessages.mock.calls.at(-1)?.[0] as (
      messages: Array<{
        id: string;
        role: "user";
        parts: Array<{ type: "text"; text: string }>;
      }>,
    ) => unknown[];
    const optimistic = [
      {
        id: "optimistic-user-1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Réponse en cours" }],
      },
    ];

    expect(updater(optimistic)).toEqual(optimistic);
  });

  it("treats a missing conversation as a valid first-use state", async () => {
    mockChatMessages = [];
    vi.mocked(clientApi.projectProfileConversation).mockResolvedValue(null);

    renderChat();

    expect(await screen.findByText(/je vais vous aider à compléter le profil/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Votre réponse" })).toBeEnabled();
  });

  it("keeps cached conversation UI visible during a slow background refresh", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: Infinity } },
    });
    queryClient.setQueryData(["project-profile", "atlas-industrie"], profile);
    queryClient.setQueryData(["project-profile-conversation", "atlas-industrie"], conversation);
    vi.mocked(clientApi.projectProfile).mockReturnValue(new Promise(() => {}));
    vi.mocked(clientApi.projectProfileConversation).mockReturnValue(new Promise(() => {}));

    renderChat(queryClient);
    const input = screen.getByRole("textbox", { name: "Votre réponse" });
    await userEvent.type(input, "Une réponse conservée");

    expect(screen.getByText("1 information enregistrée")).toBeInTheDocument();
    expect(input).toHaveValue("Une réponse conservée");
    expect(
      await screen.findByRole("status", { name: "Synchronisation en cours" }, { timeout: 1_200 }),
    ).toBeInTheDocument();
    expect(input).toHaveValue("Une réponse conservée");
  });

  it("retains cached content and offers retry when background history refresh fails", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: Infinity } },
    });
    queryClient.setQueryData(["project-profile", "atlas-industrie"], profile);
    queryClient.setQueryData(["project-profile-conversation", "atlas-industrie"], conversation);
    vi.mocked(clientApi.projectProfileConversation).mockRejectedValue(new Error("offline"));

    renderChat(queryClient);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "L’historique n’a pas pu être synchronisé",
    );
    expect(screen.getByText("1 information enregistrée")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Votre réponse" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(clientApi.projectProfileConversation).toHaveBeenCalledTimes(2));
  });

  it("retains cached content when the profile background refresh fails", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: Infinity } },
    });
    queryClient.setQueryData(["project-profile", "atlas-industrie"], profile);
    queryClient.setQueryData(["project-profile-conversation", "atlas-industrie"], conversation);
    vi.mocked(clientApi.projectProfile).mockRejectedValue(new Error("offline"));

    renderChat(queryClient);

    expect(await screen.findByRole("button", { name: "Actualiser" })).toBeInTheDocument();
    expect(screen.getByText("1 information enregistrée")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Votre réponse" })).toBeEnabled();
  });

  it("normalizes persisted user IDs and preserves rich messages while reconciling", () => {
    const persisted = conversationMessages({
      ...conversation,
      messages: [
        {
          id: "database-user-1",
          clientMessageId: "client-user-1",
          role: "USER",
          content: "Bonjour",
          createdAt: "2026-08-09T10:01:00.000Z",
        },
        {
          id: "assistant-1",
          role: "ASSISTANT",
          content: "Merci.",
          createdAt: "2026-08-09T10:02:00.000Z",
        },
      ],
    } as never);
    const current = [
      {
        id: "client-user-1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Bonjour" }],
        metadata: { createdAt: "2026-08-09T10:01:00.000Z" },
      },
      toolMessage,
    ];

    const reconciled = reconcileConversationMessages(current, persisted as never);

    expect(reconciled).toBe(current);
    expect(reconciled).toHaveLength(2);
    expect(reconciled[1]?.parts).toContainEqual(
      expect.objectContaining({ type: "tool-recordProfileAnswers" }),
    );
  });
});
