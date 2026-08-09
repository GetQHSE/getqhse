import { useChat } from "@ai-sdk/react";
import type {
  ProjectProfile,
  ProjectProfileConversation,
  ProjectProfileMessage,
} from "@qhse/contracts";
import { profileQuestions, type ProfileFieldKey } from "@qhse/profile";
import {
  Attachment,
  AttachmentAction,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@qhse/ui/components/attachment";
import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Progress } from "@qhse/ui/components/progress";
import { ScrollArea } from "@qhse/ui/components/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@qhse/ui/components/sheet";
import { Textarea } from "@qhse/ui/components/textarea";
import { cn } from "@qhse/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  FileTextIcon,
  LayoutListIcon,
  LoaderCircleIcon,
  MicIcon,
  PaperclipIcon,
  SendIcon,
  SparklesIcon,
  SquareIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";

import { clientApi } from "../../app/client-api.js";
import { apiUrl } from "../../app/api-url.js";

type MessageAttachment = NonNullable<ProjectProfileMessage["attachments"]>[number];
type ProfileMessageMetadata = {
  createdAt?: string;
  attachments?: MessageAttachment[];
};
type ProfileUiMessage = UIMessage<ProfileMessageMetadata>;

type RecordProfileOutput = {
  acceptedKeys: ProfileFieldKey[];
  rejectedAnswers: Array<{ key: ProfileFieldKey; reason: string }>;
  nextQuestion: { key: ProfileFieldKey; prompt: string } | null;
  completenessPercent: number;
  regulatoryReadiness: number;
};

type RecordProfileToolPart = {
  type: "tool-recordProfileAnswers";
  toolCallId: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: { answers?: Array<{ key: ProfileFieldKey; valueJson: string; confidence?: number }> };
  output?: RecordProfileOutput;
  errorText?: string;
};

type PendingAttachment = {
  localId: string;
  id?: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  purpose: "CHAT_ATTACHMENT" | "VOICE_NOTE";
  status: "uploading" | "ready" | "error";
};

const sectionLabels = {
  IDENTITY_ACTIVITY: "Identité & activité",
  SCOPE_GEOGRAPHY: "Périmètre & géographie",
  OPERATIONS_RESOURCES: "Opérations & ressources",
  EXTERNAL_CONTEXT: "Contexte externe",
  INTERESTED_PARTIES: "Parties intéressées",
  STRATEGY_OBJECTIVES: "Stratégie & objectifs",
} as const;

const fieldLabels: Partial<Record<ProfileFieldKey, string>> = {
  "project.name": "Nom du projet",
  "project.logoUrl": "Logo",
  "organization.mission": "Mission",
  "organization.offerings": "Produits et services",
  "organization.offeringRanges": "Gammes proposées",
  "market.primaryCustomerSegments": "Segments clients",
  "organization.employeeCount": "Effectif",
  "operations.keyProcesses": "Processus clés",
  "scope.certificationScope": "Périmètre de certification",
  "operations.externalProviders": "Prestataires externes",
  "organization.afterSalesServices": "Service après-vente",
  "scope.operatingReach": "Portée des activités",
  "scope.operatingCountries": "Pays d’activité",
  "organization.primarySector": "Secteur principal",
  "regulatory.implementedFrameworks": "Référentiels appliqués",
  "operations.orderToDeliveryFlow": "Flux commande-livraison",
  "resources.keyResources": "Ressources clés",
  "resources.criticalCompetencies": "Compétences critiques",
  "operations.majorDifficulties": "Difficultés majeures",
  "context.externalFactors": "Facteurs externes",
  "regulatory.knownRequirements": "Exigences connues",
  "context.sectorChallenges": "Défis du secteur",
  "stakeholders.customerNeeds": "Besoins clients",
  "stakeholders.otherParties": "Autres parties intéressées",
  "stakeholders.expectations": "Attentes des parties",
  "strategy.annualObjectives": "Objectifs annuels",
  "strategy.values": "Valeurs",
  "strategy.differentiators": "Facteurs différenciants",
  "strategy.iso9001Motivation": "Motivation ISO 9001",
  "context.marketChallenges": "Défis du marché",
  "context.growthOpportunities": "Opportunités de croissance",
  "regulatory.criticalRisks": "Risques réglementaires",
  "operations.recurrentIssues": "Problèmes récurrents",
};

const quickReplies: Partial<Record<ProfileFieldKey, string[]>> = {
  "scope.operatingReach": [
    "Activités locales",
    "Activités nationales",
    "Activités internationales",
  ],
  "organization.employeeCount": [
    "Moins de 10 salariés",
    "Entre 10 et 49 salariés",
    "Entre 50 et 249 salariés",
  ],
  "operations.externalProviders": [
    "Oui, nous sous-traitons certaines activités",
    "Non, aucune activité sous-traitée",
  ],
  "organization.afterSalesServices": [
    "Oui, nous avons un service après-vente",
    "Non, cela ne s’applique pas",
  ],
  "regulatory.implementedFrameworks": [
    "Oui, nous appliquons déjà des référentiels",
    "Non, pas encore",
  ],
};

function labelForField(key: ProfileFieldKey): string {
  return fieldLabels[key] ?? key.split(".").at(-1) ?? key;
}

function formatFieldValue(value: unknown): string {
  if (value == null) return "Non renseigné";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (Array.isArray(value)) {
    const labels = value
      .slice(0, 3)
      .map((item) =>
        typeof item === "string"
          ? item
          : typeof item === "object" && item && "name" in item
            ? String(item.name)
            : null,
      )
      .filter(Boolean);
    return labels.length
      ? labels.join(", ")
      : `${value.length} élément${value.length > 1 ? "s" : ""}`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["label", "name", "reference"] as const) {
      if (typeof record[key] === "string") return record[key];
    }
  }
  return "Information structurée";
}

function isAnswered(status: string): boolean {
  return ["ANSWERED", "CONFIRMED", "NOT_APPLICABLE"].includes(status);
}

function conversationMessages(conversation: ProjectProfileConversation | null): ProfileUiMessage[] {
  if (!conversation) return [];
  return conversation.messages
    .filter((message) => message.role === "USER" || message.role === "ASSISTANT")
    .map((message) => ({
      id: message.id,
      role: message.role === "USER" ? "user" : "assistant",
      parts: [{ type: "text", text: message.content }],
      metadata: {
        createdAt: message.createdAt,
        ...(message.attachments ? { attachments: message.attachments } : {}),
      },
    }));
}

function timeLabel(value?: string): string {
  if (!value) return "maintenant";
  return new Intl.DateTimeFormat("fr", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );
}

function bytesLabel(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} Ko`;
  return `${(bytes / 1_000_000).toFixed(1)} Mo`;
}

function digestToBase64(digest: ArrayBuffer): string {
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function digestToHex(digest: ArrayBuffer): string {
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function AiAvatar() {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-2xl bg-violet-600 text-white shadow-sm shadow-violet-200">
      <SparklesIcon className="size-4" />
    </span>
  );
}

function ToolResultCard({ part }: { part: RecordProfileToolPart }) {
  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="mt-3 flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm text-violet-800">
        <LoaderCircleIcon className="size-4 animate-spin" /> Vérification des informations…
      </div>
    );
  }
  if (part.state === "output-error" || !part.output) {
    return (
      <div className="mt-3 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
        <span>{part.errorText ?? "Les informations n’ont pas pu être enregistrées."}</span>
      </div>
    );
  }
  const accepted = part.output.acceptedKeys;
  if (!accepted.length && !part.output.rejectedAnswers.length) return null;
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/60">
      {accepted.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-emerald-800">
              {accepted.length} information{accepted.length > 1 ? "s" : ""} enregistrée
              {accepted.length > 1 ? "s" : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {accepted.map((key) => (
                <span
                  key={key}
                  className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700"
                >
                  {labelForField(key)}
                </span>
              ))}
            </div>
          </div>
          <span className="text-xs font-semibold text-emerald-800">
            {part.output.completenessPercent}%
          </span>
        </div>
      )}
      {part.output.rejectedAnswers.length > 0 && (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Une information nécessite une précision avant d’être enregistrée.
        </div>
      )}
    </div>
  );
}

function ChatMessage({ message }: { message: ProfileUiMessage }) {
  const isUser = message.role === "user";
  return (
    <article
      aria-label={isUser ? "Message de l’utilisateur" : "Message de l’assistant"}
      className={cn("flex gap-3", isUser && "justify-end")}
    >
      {!isUser && <AiAvatar />}
      <div className="min-w-0 max-w-[min(44rem,90%)]">
        {!isUser && (
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">Assistant QHSE</span>
            <span className="text-[11px] text-slate-400">
              {timeLabel(message.metadata?.createdAt)}
            </span>
          </div>
        )}
        <div
          className={cn(
            isUser && "rounded-3xl rounded-br-lg bg-slate-900 px-4 py-3 text-white shadow-sm",
          )}
        >
          {message.parts.map((part, index) => {
            if (part.type === "text") {
              return (
                <p
                  key={`${message.id}-text-${index}`}
                  className={cn(
                    "whitespace-pre-wrap text-[15px] leading-6",
                    isUser ? "text-white" : "text-slate-700",
                  )}
                >
                  {part.text}
                </p>
              );
            }
            if (part.type === "tool-recordProfileAnswers") {
              return (
                <ToolResultCard
                  key={part.toolCallId}
                  part={part as unknown as RecordProfileToolPart}
                />
              );
            }
            return null;
          })}
          {message.metadata?.attachments?.map((attachment) => (
            <Attachment
              key={attachment.id}
              className={cn("mt-3", isUser && "border-white/15 bg-white/10 text-white")}
              size="sm"
            >
              <AttachmentMedia className={cn(isUser && "bg-white/10 text-white")}>
                <FileTextIcon />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{attachment.fileName}</AttachmentTitle>
                <AttachmentDescription className={cn(isUser && "text-slate-300")}>
                  {attachment.contentType} · {bytesLabel(attachment.sizeBytes)}
                </AttachmentDescription>
              </AttachmentContent>
            </Attachment>
          ))}
        </div>
        {isUser && (
          <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[11px] text-slate-400">
            <CheckCircle2Icon className="size-3" /> Envoyé ·{" "}
            {timeLabel(message.metadata?.createdAt)}
          </div>
        )}
      </div>
      {isUser && (
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-700">
          <UserRoundIcon className="size-4" />
        </span>
      )}
    </article>
  );
}

function CurrentQuestionCard({
  profile,
  onSuggestion,
}: {
  profile: ProjectProfile;
  onSuggestion: (value: string) => void;
}) {
  const question = profile.nextQuestion;
  if (!question) {
    return (
      <article className="flex gap-3" aria-label="Profil prêt à finaliser">
        <AiAvatar />
        <div className="max-w-xl rounded-3xl rounded-tl-lg border border-emerald-200 bg-emerald-50 p-5">
          <CheckCircle2Icon className="size-6 text-emerald-600" />
          <h2 className="mt-3 text-lg font-semibold text-emerald-950">Votre profil est complet</h2>
          <p className="mt-2 text-sm leading-6 text-emerald-900/70">
            Relisez les informations collectées avant de finaliser cette version du profil.
          </p>
          <Link
            to={`/projects/${profile.project.slug}/profile`}
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"
          >
            Vérifier le profil <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </article>
    );
  }
  const questionNumber = profileQuestions.findIndex((item) => item.key === question.key) + 1;
  const suggestions = quickReplies[question.key] ?? [];
  return (
    <article className="flex gap-3" aria-label="Question actuelle">
      <AiAvatar />
      <div className="min-w-0 max-w-[min(46rem,92%)] flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">Assistant QHSE</span>
          <Badge className="border-violet-200 bg-violet-50 text-violet-700" variant="outline">
            Question actuelle
          </Badge>
        </div>
        <div className="overflow-hidden rounded-3xl rounded-tl-lg border border-violet-200 bg-white shadow-[0_14px_40px_-28px_rgba(91,33,182,0.55)]">
          <div className="flex items-center justify-between gap-3 border-b border-violet-100 bg-violet-50/70 px-5 py-3">
            <span className="text-xs font-semibold uppercase tracking-[0.11em] text-violet-700">
              {sectionLabels[question.section]}
            </span>
            <span className="shrink-0 text-xs font-medium text-slate-500">
              Question {questionNumber} sur {profileQuestions.length}
            </span>
          </div>
          <div className="space-y-4 p-5">
            <h2 className="text-[17px] font-semibold leading-7 text-slate-950">
              {question.prompt}
            </h2>
            {question.regulatoryCritical && (
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">
                <CircleHelpIcon className="mt-0.5 size-3.5 shrink-0 text-blue-600" /> Cette réponse
                aide à déterminer les exigences réglementaires applicables.
              </div>
            )}
            {suggestions.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-slate-500">Réponses rapides</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((suggestion) => (
                    <Button
                      key={suggestion}
                      type="button"
                      onClick={() => onSuggestion(suggestion)}
                      size="sm"
                      variant="outline"
                      className="h-auto min-h-7 whitespace-normal rounded-full border-slate-200 bg-white px-3 py-1.5 text-left text-xs font-normal text-slate-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function ProfileDrawer({ profile }: { profile: ProjectProfile }) {
  const answered = profile.fields.filter((field) => isAnswered(field.status));
  return (
    <Sheet>
      <SheetTrigger
        aria-label="Voir les détails du profil"
        render={
          <Button
            className="border-violet-200 bg-white text-violet-700 hover:bg-violet-50"
            size="sm"
            variant="outline"
          />
        }
      >
        <LayoutListIcon />
        <span className="hidden sm:inline">Voir les détails</span>
        <span className="sm:hidden">Détails</span>
      </SheetTrigger>
      <SheetContent className="w-[min(92vw,430px)]! sm:max-w-[430px]!">
        <SheetHeader className="border-b border-slate-100 pr-14">
          <SheetTitle className="text-lg font-semibold">Profil du projet</SheetTitle>
          <SheetDescription>
            Les informations sont mises à jour après chaque réponse validée.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 p-6">
            <section className="rounded-3xl bg-violet-50 p-5">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-medium text-violet-700">Progression globale</p>
                  <p className="mt-1 text-3xl font-semibold text-violet-950">
                    {profile.completion.completenessPercent}%
                  </p>
                </div>
                <Badge className="bg-white text-violet-700" variant="secondary">
                  {profile.completion.answeredRequired} sur {profile.completion.totalRequired}
                </Badge>
              </div>
              <Progress
                className="mt-4 [&_[data-slot=progress-indicator]]:bg-violet-600 [&_[data-slot=progress-track]]:bg-violet-200"
                value={profile.completion.completenessPercent}
              />
              <div className="mt-4 flex items-center justify-between border-t border-violet-100 pt-4 text-xs">
                <span className="text-violet-700">Préparation réglementaire</span>
                <strong className="text-violet-950">
                  {profile.completion.regulatoryReadiness}%
                </strong>
              </div>
            </section>
            <section>
              <h2 className="text-sm font-semibold text-slate-950">Sections du profil</h2>
              <div className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-4">
                {Object.entries(sectionLabels).map(([section, label], index) => {
                  const questions = profileQuestions.filter(
                    (item) => item.section === section && item.required,
                  );
                  const count = questions.filter((item) =>
                    answered.some((field) => field.key === item.key),
                  ).length;
                  const percent = Math.round((count / questions.length) * 100);
                  return (
                    <div className="flex items-center gap-3 py-3.5" key={section}>
                      <span
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                          percent === 100
                            ? "bg-emerald-100 text-emerald-700"
                            : percent > 0
                              ? "bg-violet-100 text-violet-700"
                              : "bg-slate-100 text-slate-400",
                        )}
                      >
                        {percent === 100 ? <CheckIcon className="size-3.5" /> : index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between gap-3">
                          <p className="truncate text-sm font-medium text-slate-800">{label}</p>
                          <span className="text-xs text-slate-400">
                            {count}/{questions.length}
                          </span>
                        </div>
                        <Progress
                          className="mt-2 gap-0 [&_[data-slot=progress-track]]:h-1 [&_[data-slot=progress-indicator]]:bg-violet-600"
                          value={percent}
                        />
                      </div>
                      <ChevronRightIcon className="size-4 text-slate-300" />
                    </div>
                  );
                })}
              </div>
            </section>
            <section>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-950">Informations enregistrées</h2>
                <Badge variant="secondary">{answered.length}</Badge>
              </div>
              <div className="mt-3 space-y-2.5">
                {answered.slice(0, 10).map((field) => (
                  <div
                    key={field.key}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"
                  >
                    <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-500">{labelForField(field.key)}</p>
                      <p className="truncate text-sm font-medium text-slate-900">
                        {formatFieldValue(field.value)}
                      </p>
                    </div>
                  </div>
                ))}
                {!answered.length && (
                  <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                    Les réponses validées apparaîtront ici.
                  </p>
                )}
              </div>
            </section>
          </div>
        </ScrollArea>
        <SheetFooter className="border-t border-slate-100 bg-slate-50">
          <Button
            render={<Link to={`/projects/${profile.project.slug}/profile`} />}
            className="w-full"
          >
            Ouvrir la page profil
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ProfileStatusBar({ profile }: { profile: ProjectProfile }) {
  return (
    <div className="shrink-0 border-b border-slate-200 bg-[#fafafe] px-4 py-3 lg:px-8">
      <div className="mx-auto flex max-w-5xl items-center gap-3 sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-2xl bg-violet-100 text-sm font-bold text-violet-700">
            {profile.completion.completenessPercent}%
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800">Profil du projet</p>
            <p className="max-w-[45vw] truncate text-[11px] text-slate-500 sm:max-w-none">
              {profile.project.name} · {profile.completion.answeredRequired} réponses sur{" "}
              {profile.completion.totalRequired}
            </p>
          </div>
        </div>
        <div className="ml-auto shrink-0">
          <ProfileDrawer profile={profile} />
        </div>
      </div>
    </div>
  );
}

export function ProjectProfileChat({ projectIdOrSlug }: { projectIdOrSlug: string }) {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["project-profile", projectIdOrSlug],
    queryFn: () => clientApi.projectProfile(projectIdOrSlug),
  });
  const conversationQuery = useQuery({
    queryKey: ["project-profile-conversation", projectIdOrSlug],
    queryFn: () => clientApi.projectProfileConversation(projectIdOrSlug),
  });
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [composerError, setComposerError] = useState<string>();
  const [recording, setRecording] = useState(false);
  const hydrated = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<ProfileUiMessage>({
        api: apiUrl(`/v1/projects/${encodeURIComponent(projectIdOrSlug)}/profile/chat/stream`),
        credentials: "include",
        prepareSendMessagesRequest: ({ messages, trigger, messageId, body }) => {
          const latestUser = [...messages].reverse().find((message) => message.role === "user");
          if (!latestUser) throw new Error("Aucun message utilisateur à envoyer");
          return {
            body: {
              messages: [
                {
                  id: latestUser.id,
                  role: "user",
                  parts: latestUser.parts.filter(
                    (part) => part.type === "text" || part.type === "file",
                  ),
                },
              ],
              trigger,
              messageId: messageId ?? latestUser.id,
              language: "fr",
              module: "PROFILE_COMPLETION",
              attachmentIds: [],
              ...body,
            },
          };
        },
      }),
    [projectIdOrSlug],
  );

  const { messages, setMessages, sendMessage, status, error, stop } = useChat<ProfileUiMessage>({
    id: `profile-chat-${projectIdOrSlug}`,
    transport,
    onFinish: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-profile", projectIdOrSlug] }),
        queryClient.invalidateQueries({
          queryKey: ["project-profile-conversation", projectIdOrSlug],
        }),
      ]);
    },
  });

  useEffect(() => {
    if (!conversationQuery.isPending && !hydrated.current) {
      setMessages(conversationMessages(conversationQuery.data ?? null));
      hydrated.current = true;
    }
  }, [conversationQuery.data, conversationQuery.isPending, setMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: status === "streaming" ? "auto" : "smooth" });
  }, [messages, status, profileQuery.data?.nextQuestion?.key]);

  const uploadFile = useCallback(
    async (file: File, purpose: PendingAttachment["purpose"]) => {
      const localId = crypto.randomUUID();
      setComposerError(undefined);
      setAttachments((current) => [
        ...current,
        {
          localId,
          name: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          purpose,
          status: "uploading",
        },
      ]);
      try {
        const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
        const checksum = digestToHex(digest);
        const created = await clientApi.createFileUpload({
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          checksum,
          purpose,
        });
        const organizationId = profileQuery.data?.project.organizationId;
        const uploadResponse = await fetch(created.upload.url, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type,
            "x-amz-checksum-sha256": digestToBase64(digest),
            "x-amz-meta-checksumhex": checksum,
            ...(organizationId ? { "x-amz-meta-organizationid": organizationId } : {}),
          },
        });
        if (!uploadResponse.ok) throw new Error("Le transfert du fichier a échoué");
        await clientApi.completeFileUpload(created.file.id);
        if (purpose === "VOICE_NOTE") await clientApi.transcribeVoiceNote(created.file.id);
        setAttachments((current) =>
          current.map((item) =>
            item.localId === localId ? { ...item, id: created.file.id, status: "ready" } : item,
          ),
        );
      } catch (uploadError) {
        setAttachments((current) =>
          current.map((item) => (item.localId === localId ? { ...item, status: "error" } : item)),
        );
        setComposerError(
          uploadError instanceof Error ? uploadError.message : "Le fichier n’a pas pu être ajouté.",
        );
      }
    },
    [profileQuery.data?.project.organizationId],
  );

  async function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    for (const file of files) await uploadFile(file, "CHAT_ATTACHMENT");
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(
        stream,
        MediaRecorder.isTypeSupported("audio/webm") ? { mimeType: "audio/webm" } : undefined,
      );
      audioChunksRef.current = [];
      audioStreamRef.current = stream;
      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const file = new File(audioChunksRef.current, `note-vocale-${Date.now()}.webm`, { type });
        audioStreamRef.current?.getTracks().forEach((track) => track.stop());
        void uploadFile(file, "VOICE_NOTE");
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setComposerError("Autorisez l’accès au microphone pour enregistrer une note vocale.");
    }
  }

  async function submit() {
    const readyAttachments = attachments.filter((item) => item.status === "ready" && item.id);
    const content =
      draft.trim() ||
      (readyAttachments.length
        ? "Veuillez analyser les fichiers joints et utiliser les informations explicites pour compléter mon profil."
        : "");
    if (!content || attachments.some((item) => item.status === "uploading")) return;
    const messageAttachments: MessageAttachment[] = readyAttachments.map((item) => ({
      id: item.id!,
      fileName: item.name,
      contentType: item.contentType,
      sizeBytes: item.sizeBytes,
      purpose: item.purpose,
    }));
    const previousDraft = draft;
    const previousAttachments = attachments;
    setDraft("");
    setAttachments([]);
    setComposerError(undefined);
    try {
      await sendMessage(
        {
          text: content,
          metadata: {
            createdAt: new Date().toISOString(),
            ...(messageAttachments.length ? { attachments: messageAttachments } : {}),
          },
        },
        {
          body: {
            conversationId: conversationQuery.data?.id,
            attachmentIds: readyAttachments.map((item) => item.id),
          },
        },
      );
    } catch {
      setDraft(previousDraft);
      setAttachments(previousAttachments);
      setComposerError("Le message n’a pas pu être envoyé. Réessayez.");
    }
  }

  if (profileQuery.isPending || conversationQuery.isPending) {
    return (
      <div className="-m-6 grid h-[calc(100dvh-4rem)] place-items-center bg-white">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <LoaderCircleIcon className="size-5 animate-spin text-violet-600" /> Chargement de la
          conversation…
        </div>
      </div>
    );
  }
  if (profileQuery.error || !profileQuery.data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
        <h1 className="font-semibold">Le profil ne peut pas être chargé</h1>
        <p className="mt-2 text-sm">Réessayez dans quelques instants.</p>
      </div>
    );
  }
  const profile = profileQuery.data;
  const busy = status === "submitted" || status === "streaming";
  const canSend =
    (draft.trim().length > 0 || attachments.some((item) => item.status === "ready")) &&
    !attachments.some((item) => item.status === "uploading") &&
    !busy;

  return (
    <div className="-m-6 flex h-[calc(100dvh-4rem)] min-h-[680px] flex-col overflow-hidden bg-white">
      <ProfileStatusBar profile={profile} />
      <section
        className="flex min-h-0 flex-1 flex-col bg-white"
        aria-label="Conversation de profil"
      >
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-5 py-8 lg:px-10">
            <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
              <span className="h-px flex-1 bg-slate-100" /> Conversation de profil{" "}
              <span className="h-px flex-1 bg-slate-100" />
            </div>
            {!messages.length && (
              <ChatMessage
                message={{
                  id: "welcome",
                  role: "assistant",
                  parts: [
                    {
                      type: "text",
                      text: `Bonjour, je vais vous aider à compléter le profil de ${profile.project.name}. Je poserai une question à la fois et j’enregistrerai uniquement les informations que vous confirmez.`,
                    },
                  ],
                }}
              />
            )}
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {status === "submitted" && (
              <div className="flex items-center gap-3">
                <AiAvatar />
                <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  <LoaderCircleIcon className="size-4 animate-spin text-violet-600" /> L’assistant
                  analyse votre réponse…
                </div>
              </div>
            )}
            {!busy && <CurrentQuestionCard profile={profile} onSuggestion={setDraft} />}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-4 lg:px-8">
          <div className="mx-auto max-w-4xl">
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((attachment) => (
                  <Attachment
                    key={attachment.localId}
                    className={cn(
                      "max-w-sm",
                      attachment.status === "error" && "border-red-200 bg-red-50",
                    )}
                    size="sm"
                    state={
                      attachment.status === "uploading"
                        ? "uploading"
                        : attachment.status === "ready"
                          ? "done"
                          : "error"
                    }
                  >
                    <AttachmentMedia>
                      <FileTextIcon />
                    </AttachmentMedia>
                    <AttachmentContent>
                      <AttachmentTitle>{attachment.name}</AttachmentTitle>
                      <AttachmentDescription>
                        {attachment.status === "uploading"
                          ? "Téléversement…"
                          : attachment.status === "error"
                            ? "Échec du transfert"
                            : `${bytesLabel(attachment.sizeBytes)} · prêt`}
                      </AttachmentDescription>
                    </AttachmentContent>
                    <AttachmentAction
                      aria-label={`Retirer ${attachment.name}`}
                      onClick={() =>
                        setAttachments((current) =>
                          current.filter((item) => item.localId !== attachment.localId),
                        )
                      }
                    >
                      <XIcon />
                    </AttachmentAction>
                  </Attachment>
                ))}
              </div>
            )}
            {recording && (
              <div className="mb-2 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2">
                <span className="size-2 animate-pulse rounded-full bg-rose-500" />
                <span className="text-xs font-semibold text-rose-700">
                  Enregistrement en cours…
                </span>
                <div className="h-px flex-1 bg-rose-200" />
                <Button
                  aria-label="Arrêter l’enregistrement"
                  onClick={() => void toggleRecording()}
                  size="icon-sm"
                  variant="ghost"
                >
                  <SquareIcon className="size-3.5 fill-rose-600 text-rose-600" />
                </Button>
              </div>
            )}
            {(composerError || error) && (
              <div
                role="alert"
                className="mb-2 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700"
              >
                <AlertCircleIcon className="size-4" />{" "}
                {composerError ?? "La réponse n’a pas pu être générée. Vous pouvez réessayer."}
              </div>
            )}
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-2 shadow-[0_12px_35px_-25px_rgba(15,23,42,0.45)] focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
              <Textarea
                aria-label="Votre réponse"
                className="min-h-14 border-0 bg-transparent px-2 py-1.5 text-[15px] shadow-none focus-visible:border-0 focus-visible:ring-0"
                disabled={busy}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                placeholder={
                  profile.nextQuestion
                    ? "Écrivez votre réponse…"
                    : "Posez une question sur votre profil…"
                }
                value={draft}
              />
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1">
                  <input
                    ref={fileInput}
                    className="sr-only"
                    type="file"
                    multiple
                    accept=".pdf,.docx,.txt,.csv,image/jpeg,image/png,image/webp"
                    onChange={(event) => void selectFiles(event)}
                  />
                  <Button
                    aria-label="Ajouter un fichier"
                    disabled={busy || attachments.length >= 10}
                    onClick={() => fileInput.current?.click()}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <PaperclipIcon />
                  </Button>
                  <Button
                    aria-label={
                      recording ? "Arrêter l’enregistrement" : "Enregistrer un message vocal"
                    }
                    className={cn(recording && "bg-rose-100 text-rose-700")}
                    disabled={busy}
                    onClick={() => void toggleRecording()}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <MicIcon />
                  </Button>
                  <span className="hidden pl-1 text-[11px] text-slate-400 sm:inline">
                    PDF, Word, image ou audio
                  </span>
                </div>
                {busy ? (
                  <Button
                    aria-label="Arrêter la réponse"
                    className="rounded-full"
                    onClick={stop}
                    size="icon"
                    variant="outline"
                  >
                    <SquareIcon className="size-3.5 fill-current" />
                  </Button>
                ) : (
                  <Button
                    aria-label="Envoyer la réponse"
                    className="rounded-full bg-violet-600 hover:bg-violet-700"
                    disabled={!canSend}
                    onClick={() => void submit()}
                    size="icon"
                  >
                    {canSend ? <ArrowUpIcon /> : <SendIcon />}
                  </Button>
                )}
              </div>
            </div>
            <p className="mt-2 text-center text-[11px] text-slate-400">
              L’IA peut se tromper. Vérifiez les informations avant de finaliser le profil.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
