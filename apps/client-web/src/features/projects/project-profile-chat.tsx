import { countryName } from "@qhse/domain/countries";
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
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Streamdown } from "streamdown";

import { clientApi } from "../../app/client-api.js";
import { apiUrl } from "../../app/api-url.js";
import { useFormat } from "../../app/format.js";
import { currentLanguage, i18n } from "../../app/i18n.js";
import type frProfile from "../../locales/fr/profile.js";

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

const sections = [
  "IDENTITY_ACTIVITY",
  "SCOPE_GEOGRAPHY",
  "OPERATIONS_RESOURCES",
  "EXTERNAL_CONTEXT",
  "INTERESTED_PARTIES",
  "STRATEGY_OBJECTIVES",
] as const;

/** Suggested answers are sent to the AI, so they are phrased in the project language. */
type QuickReply = keyof (typeof frProfile)["conversation"]["quickReplies"];
type FieldLabel = keyof (typeof frProfile)["fields"];

const quickReplies: Partial<Record<ProfileFieldKey, QuickReply[]>> = {
  "scope.operatingReach": [
    "operatingReach_local",
    "operatingReach_national",
    "operatingReach_international",
  ],
  "organization.employeeCount": ["employees_small", "employees_medium", "employees_large"],
  "operations.externalProviders": ["providers_yes", "providers_no"],
  "organization.afterSalesServices": ["afterSales_yes", "afterSales_no"],
  "regulatory.implementedFrameworks": ["frameworks_yes", "frameworks_no"],
};

type ProfileT = TFunction<"profile">;

/** Translator for text that belongs to the AI conversation (project language). */
function conversationT(profile: ProjectProfile): ProfileT {
  return i18n.getFixedT(profile.project.language, "profile");
}

function labelForField(key: ProfileFieldKey, t: ProfileT): string {
  return t(`fields.${key.replace(".", "_") as FieldLabel}`, {
    defaultValue: key.split(".").at(-1) ?? key,
  });
}

function formatFieldValue(value: unknown, t: ProfileT): string {
  if (value == null) return t("value.notProvided");
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? t("editorUi.yes") : t("editorUi.no");
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
    return labels.length ? labels.join(", ") : t("value.items", { count: value.length });
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["label", "name", "reference"] as const) {
      if (typeof record[key] === "string") return record[key];
    }
  }
  return t("value.structuredShort");
}

function isAnswered(status: string): boolean {
  return ["ANSWERED", "CONFIRMED", "NOT_APPLICABLE"].includes(status);
}

export function conversationMessages(
  conversation: ProjectProfileConversation | null,
): ProfileUiMessage[] {
  if (!conversation) return [];
  return conversation.messages
    .filter((message) => message.role === "USER" || message.role === "ASSISTANT")
    .map((message) => ({
      id: message.role === "USER" && message.clientMessageId ? message.clientMessageId : message.id,
      role: message.role === "USER" ? "user" : "assistant",
      parts: [{ type: "text", text: message.content }],
      metadata: {
        createdAt: message.createdAt,
        ...(message.attachments ? { attachments: message.attachments } : {}),
      },
    }));
}

export function reconcileConversationMessages(
  current: ProfileUiMessage[],
  persisted: ProfileUiMessage[],
): ProfileUiMessage[] {
  const knownIds = new Set(current.map((message) => message.id));
  const missing = persisted.filter((message) => !knownIds.has(message.id));
  if (!missing.length) return current;
  const order = new Map(
    [...current, ...missing].map((message, index) => [message.id, index] as const),
  );
  return [...current, ...missing].sort((left, right) => {
    const leftTime = left.metadata?.createdAt
      ? new Date(left.metadata.createdAt).getTime()
      : Number.POSITIVE_INFINITY;
    const rightTime = right.metadata?.createdAt
      ? new Date(right.metadata.createdAt).getTime()
      : Number.POSITIVE_INFINITY;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0);
  });
}

function useDelayedIndicator(active: boolean, delayMs = 500): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timeout = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timeout);
  }, [active, delayMs]);
  return visible;
}

function useTimeLabel() {
  const { t } = useTranslation("profile");
  const format = useFormat();
  return (value?: string) =>
    value ? format.date(value, { hour: "2-digit", minute: "2-digit" }) : t("chat.now");
}

function useBytesLabel() {
  const { t } = useTranslation("profile");
  const format = useFormat();
  return (bytes: number) =>
    bytes < 1_000_000
      ? t("chat.kilobytes", { value: format.number(Math.max(1, Math.round(bytes / 1_000))) })
      : t("chat.megabytes", {
          value: format.number(bytes / 1_000_000, { maximumFractionDigits: 1 }),
        });
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
  const { t } = useTranslation("profile");
  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="mt-3 flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm text-violet-800">
        <LoaderCircleIcon className="size-4 animate-spin" /> {t("chat.verifying")}
      </div>
    );
  }
  if (part.state === "output-error" || !part.output) {
    return (
      <div className="mt-3 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
        <span>{part.errorText ?? t("chat.saveFailed")}</span>
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
              {t("chat.recorded", { count: accepted.length })}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {accepted.map((key) => (
                <span
                  key={key}
                  className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700"
                >
                  {labelForField(key, t)}
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
          {t("chat.needsClarification")}
        </div>
      )}
    </div>
  );
}

function ChatMessage({ message }: { message: ProfileUiMessage }) {
  const { t } = useTranslation("profile");
  const timeLabel = useTimeLabel();
  const bytesLabel = useBytesLabel();
  const isUser = message.role === "user";
  const toolParts = message.parts.filter(
    (part): part is (typeof message.parts)[number] & RecordProfileToolPart =>
      part.type === "tool-recordProfileAnswers",
  );
  const selectedToolPart =
    [...toolParts].reverse().find((part) => (part.output?.acceptedKeys.length ?? 0) > 0) ??
    toolParts.at(-1);
  return (
    <article
      aria-label={isUser ? t("chat.userMessage") : t("chat.assistantMessage")}
      className={cn("flex gap-3", isUser && "justify-end")}
    >
      {!isUser && <AiAvatar />}
      <div className="min-w-0 max-w-[min(44rem,90%)]">
        {!isUser && (
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{t("chat.assistant")}</span>
            <span className="text-[11px] text-slate-400">
              {timeLabel(message.metadata?.createdAt)}
            </span>
          </div>
        )}
        <div
          className={cn(
            isUser && "rounded-3xl rounded-ee-lg bg-slate-900 px-4 py-3 text-white shadow-sm",
          )}
        >
          {message.parts.map((part, index) => {
            if (part.type === "text") {
              // User text is shown as typed; the assistant answers in Markdown
              // (bold questions, lists), which must be rendered, not printed.
              return isUser ? (
                <p
                  key={`${message.id}-text-${index}`}
                  className="whitespace-pre-wrap text-[15px] leading-6 text-white"
                >
                  {part.text}
                </p>
              ) : (
                <Streamdown
                  key={`${message.id}-text-${index}`}
                  className="text-[15px] leading-6 text-slate-700 [&_li]:my-0.5 [&_ol]:my-2 [&_p]:my-2 [&_[data-streamdown=strong]]:text-slate-900 [&_ul]:my-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                >
                  {part.text}
                </Streamdown>
              );
            }
            if (part.type === "tool-recordProfileAnswers") {
              if (part.toolCallId !== selectedToolPart?.toolCallId) return null;
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
            <CheckCircle2Icon className="size-3" />{" "}
            {t("chat.sent", { time: timeLabel(message.metadata?.createdAt) })}
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
  const { t } = useTranslation("profile");
  const question = profile.nextQuestion;
  if (!question) {
    return (
      <article className="flex gap-3" aria-label={t("chat.readyToFinalize")}>
        <AiAvatar />
        <div className="max-w-xl rounded-3xl rounded-ss-lg border border-emerald-200 bg-emerald-50 p-5">
          <CheckCircle2Icon className="size-6 text-emerald-600" />
          <h2 className="mt-3 text-lg font-semibold text-emerald-950">{t("chat.complete")}</h2>
          <p className="mt-2 text-sm leading-6 text-emerald-900/70">{t("chat.completeBody")}</p>
          <Link
            to={`/projects/${profile.project.slug}/profile`}
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"
          >
            {t("chat.checkProfile")} <ArrowRightIcon className="size-4 rtl:rotate-180" />
          </Link>
        </div>
      </article>
    );
  }
  const questionNumber = profileQuestions.findIndex((item) => item.key === question.key) + 1;
  const conversation = conversationT(profile);
  const suggestions = (quickReplies[question.key] ?? []).map((key) =>
    conversation(`conversation.quickReplies.${key}`),
  );
  return (
    <article className="flex gap-3" aria-label={t("chat.currentQuestion")}>
      <AiAvatar />
      <div className="min-w-0 max-w-[min(46rem,92%)] flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{t("chat.assistant")}</span>
          <Badge className="border-violet-200 bg-violet-50 text-violet-700" variant="outline">
            {t("chat.currentQuestion")}
          </Badge>
        </div>
        <div className="overflow-hidden rounded-3xl rounded-ss-lg border border-violet-200 bg-white shadow-[0_14px_40px_-28px_rgba(91,33,182,0.55)]">
          <div className="flex items-center justify-between gap-3 border-b border-violet-100 bg-violet-50/70 px-5 py-3">
            <span className="text-xs font-semibold uppercase tracking-[0.11em] text-violet-700">
              {t(`sections.${question.section}.label`)}
            </span>
            <span className="shrink-0 text-xs font-medium text-slate-500">
              {t("chat.questionOf", { number: questionNumber, total: profileQuestions.length })}
            </span>
          </div>
          <div className="space-y-4 p-5">
            <h2
              className="text-[17px] font-semibold leading-7 text-slate-950"
              lang={profile.project.language}
            >
              {question.prompt}
            </h2>
            {question.regulatoryCritical && (
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">
                <CircleHelpIcon className="mt-0.5 size-3.5 shrink-0 text-blue-600" />{" "}
                {t("chat.regulatoryHint")}
              </div>
            )}
            {suggestions.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-slate-500">{t("chat.quickReplies")}</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((suggestion) => (
                    <Button
                      key={suggestion}
                      type="button"
                      onClick={() => onSuggestion(suggestion)}
                      size="sm"
                      variant="outline"
                      className="h-auto min-h-7 whitespace-normal rounded-full border-slate-200 bg-white px-3 py-1.5 text-start text-xs font-normal text-slate-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
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
  const { t } = useTranslation("profile");
  const answered = profile.fields.filter((field) => isAnswered(field.status));
  return (
    <Sheet>
      <SheetTrigger
        aria-label={t("chat.viewDetailsAria")}
        render={
          <Button
            className="border-violet-200 bg-white text-violet-700 hover:bg-violet-50"
            size="sm"
            variant="outline"
          />
        }
      >
        <LayoutListIcon />
        <span className="hidden sm:inline">{t("chat.viewDetails")}</span>
        <span className="sm:hidden">{t("chat.details")}</span>
      </SheetTrigger>
      <SheetContent className="w-[min(92vw,430px)]! sm:max-w-[430px]!">
        <SheetHeader className="border-b border-slate-100 pe-14">
          <SheetTitle className="text-lg font-semibold">{t("chat.projectProfile")}</SheetTitle>
          <SheetDescription>{t("chat.drawerHelp")}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 p-6">
            <section className="rounded-3xl bg-violet-50 p-5">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-medium text-violet-700">{t("chat.overallProgress")}</p>
                  <p className="mt-1 text-3xl font-semibold text-violet-950">
                    {profile.completion.completenessPercent}%
                  </p>
                </div>
                <Badge className="bg-white text-violet-700" variant="secondary">
                  {t("chat.ofTotal", {
                    answered: profile.completion.answeredRequired,
                    total: profile.completion.totalRequired,
                  })}
                </Badge>
              </div>
              <Progress
                className="mt-4 [&_[data-slot=progress-indicator]]:bg-violet-600 [&_[data-slot=progress-track]]:bg-violet-200"
                value={profile.completion.completenessPercent}
              />
              <div className="mt-4 flex items-center justify-between border-t border-violet-100 pt-4 text-xs">
                <span className="text-violet-700">{t("page.regulatoryReadiness")}</span>
                <strong className="text-violet-950">
                  {profile.completion.regulatoryReadiness}%
                </strong>
              </div>
            </section>
            <section>
              <h2 className="text-sm font-semibold text-slate-950">{t("chat.profileSections")}</h2>
              <div className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-4">
                {sections.map((section, index) => {
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
                          <p className="truncate text-sm font-medium text-slate-800">
                            {t(`sections.${section}.label`)}
                          </p>
                          <span className="text-xs text-slate-400">
                            {count}/{questions.length}
                          </span>
                        </div>
                        <Progress
                          className="mt-2 gap-0 [&_[data-slot=progress-track]]:h-1 [&_[data-slot=progress-indicator]]:bg-violet-600"
                          value={percent}
                        />
                      </div>
                      <ChevronRightIcon className="size-4 text-slate-300 rtl:rotate-180" />
                    </div>
                  );
                })}
              </div>
            </section>
            <section>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-950">
                  {t("chat.recordedInformation")}
                </h2>
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
                      <p className="text-[11px] text-slate-500">{labelForField(field.key, t)}</p>
                      <p className="truncate text-sm font-medium text-slate-900">
                        {field.key === "scope.operatingCountries" && Array.isArray(field.value)
                          ? field.value
                              .map((code) => countryName(String(code), currentLanguage()))
                              .join(", ")
                          : formatFieldValue(field.value, t)}
                      </p>
                    </div>
                  </div>
                ))}
                {!answered.length && (
                  <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                    {t("chat.recordedEmpty")}
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
            {t("chat.openProfilePage")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ProfileStatusBar({
  profile,
  synchronizing,
  synchronizationFailed,
  onRetry,
}: {
  profile: ProjectProfile;
  synchronizing: boolean;
  synchronizationFailed: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation("profile");
  return (
    <div className="shrink-0 border-b border-slate-200 bg-[#fafafe] px-4 py-3 lg:px-8">
      <div className="mx-auto flex max-w-5xl items-center gap-3 sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-2xl bg-violet-100 text-sm font-bold text-violet-700">
            {profile.completion.completenessPercent}%
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800">{t("chat.projectProfile")}</p>
            <p className="max-w-[45vw] truncate text-[11px] text-slate-500 sm:max-w-none">
              {t("chat.statusSummary", {
                project: profile.project.name,
                answered: profile.completion.answeredRequired,
                total: profile.completion.totalRequired,
              })}
            </p>
          </div>
        </div>
        <div className="ms-auto flex shrink-0 items-center gap-2">
          {synchronizing && (
            <span
              role="status"
              aria-label={t("chat.synchronizing")}
              className="flex items-center gap-1.5 text-[11px] text-slate-500"
            >
              <LoaderCircleIcon className="size-3.5 animate-spin text-violet-600" />
              <span className="hidden sm:inline">{t("chat.synchronizingShort")}</span>
            </span>
          )}
          {synchronizationFailed && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
              onClick={onRetry}
            >
              <AlertCircleIcon className="size-3.5" />
              <span className="hidden sm:inline">{t("chat.refresh")}</span>
            </Button>
          )}
          <ProfileDrawer profile={profile} />
        </div>
      </div>
    </div>
  );
}

function ConversationHistorySkeleton() {
  const { t } = useTranslation("profile");
  return (
    <div aria-label={t("chat.loadingHistory")} role="status" className="space-y-7">
      <span className="sr-only">{t("chat.loadingHistoryLong")}</span>
      <div className="flex animate-pulse gap-3">
        <div className="size-9 shrink-0 rounded-2xl bg-violet-100" />
        <div className="w-full max-w-xl space-y-2 rounded-3xl rounded-ss-lg bg-slate-50 p-5">
          <div className="h-3 w-28 rounded-full bg-slate-200" />
          <div className="h-3 w-full rounded-full bg-slate-200" />
          <div className="h-3 w-4/5 rounded-full bg-slate-200" />
        </div>
      </div>
      <div className="flex animate-pulse justify-end gap-3">
        <div className="h-16 w-full max-w-sm rounded-3xl rounded-ee-lg bg-slate-100" />
        <div className="size-8 shrink-0 rounded-full bg-blue-50" />
      </div>
    </div>
  );
}

function ConversationPageSkeleton() {
  const { t } = useTranslation("profile");
  return (
    <div
      aria-label={t("chat.loadingConversation")}
      role="status"
      className="-m-6 flex h-[calc(100dvh-4rem)] min-h-[680px] flex-col overflow-hidden bg-white"
    >
      <span className="sr-only">{t("chat.loadingConversationLong")}</span>
      <div className="shrink-0 border-b border-slate-200 bg-[#fafafe] px-4 py-3 lg:px-8">
        <div className="mx-auto flex max-w-5xl animate-pulse items-center gap-3">
          <div className="size-9 rounded-2xl bg-violet-100" />
          <div className="space-y-2">
            <div className="h-3 w-28 rounded-full bg-slate-200" />
            <div className="h-2.5 w-48 rounded-full bg-slate-100" />
          </div>
          <div className="ms-auto h-8 w-28 rounded-xl bg-slate-100" />
        </div>
      </div>
      <div className="min-h-0 flex-1 px-5 py-8 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <ConversationHistorySkeleton />
        </div>
      </div>
      <div className="shrink-0 border-t border-slate-100 px-4 py-4 lg:px-8">
        <div className="mx-auto h-24 max-w-4xl animate-pulse rounded-3xl border border-slate-200 bg-slate-50" />
      </div>
    </div>
  );
}

export function ProjectProfileChat({ projectIdOrSlug }: { projectIdOrSlug: string }) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("profile");
  const bytesLabel = useBytesLabel();
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
  const hydratedConversationId = useRef<string | null | undefined>(undefined);
  const skipNextScroll = useRef(false);
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
          if (!latestUser) throw new Error(t("chat.noUserMessage"));
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
              // No language: the server answers in the project's own language.
              module: "PROFILE_COMPLETION",
              attachmentIds: [],
              ...body,
            },
          };
        },
      }),
    [projectIdOrSlug, t],
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
    if (!conversationQuery.isSuccess) return;
    const persisted = conversationMessages(conversationQuery.data ?? null);
    const conversationId = conversationQuery.data?.id ?? null;
    if (hydratedConversationId.current === undefined) {
      setMessages((current) =>
        current.length ? reconcileConversationMessages(current, persisted) : persisted,
      );
      hydratedConversationId.current = conversationId;
      return;
    }
    setMessages((current) => {
      const reconciled = reconcileConversationMessages(current, persisted);
      if (reconciled !== current) skipNextScroll.current = true;
      return reconciled;
    });
    hydratedConversationId.current = conversationId;
  }, [conversationQuery.data, conversationQuery.isSuccess, setMessages]);

  useEffect(() => {
    if (skipNextScroll.current) {
      skipNextScroll.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: status === "streaming" ? "auto" : "smooth" });
  }, [messages, status, profileQuery.data?.nextQuestion?.key]);

  const backgroundRefreshing =
    (profileQuery.isFetching && !profileQuery.isPending) ||
    (conversationQuery.isFetching && !conversationQuery.isPending);
  const showSynchronization = useDelayedIndicator(backgroundRefreshing);

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
        if (!uploadResponse.ok) throw new Error(t("chat.uploadFailed"));
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
          uploadError instanceof Error ? uploadError.message : t("chat.attachFailed"),
        );
      }
    },
    [profileQuery.data?.project.organizationId, t],
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
        const file = new File(
          audioChunksRef.current,
          `${t("chat.voiceNoteName")}-${Date.now()}.webm`,
          { type },
        );
        audioStreamRef.current?.getTracks().forEach((track) => track.stop());
        void uploadFile(file, "VOICE_NOTE");
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setComposerError(t("chat.microphone"));
    }
  }

  async function submit() {
    const readyAttachments = attachments.filter((item) => item.status === "ready" && item.id);
    const content =
      draft.trim() ||
      (readyAttachments.length && profileQuery.data
        ? conversationT(profileQuery.data)("conversation.analyseAttachments")
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
      setComposerError(t("chat.sendFailed"));
    }
  }

  function retrySynchronization() {
    void Promise.all([profileQuery.refetch(), conversationQuery.refetch()]);
  }

  if (profileQuery.isPending && !profileQuery.data) return <ConversationPageSkeleton />;
  if (!profileQuery.data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
        <h1 className="font-semibold">{t("page.loadFailed")}</h1>
        <p className="mt-2 text-sm">{t("chat.tryLater")}</p>
        <Button type="button" variant="outline" className="mt-4" onClick={retrySynchronization}>
          {t("retry", { ns: "common" })}
        </Button>
      </div>
    );
  }
  const profile = profileQuery.data;
  const historyPending = conversationQuery.isPending && !conversationQuery.data;
  const synchronizationFailed = Boolean(profileQuery.error && profileQuery.data);
  const busy = status === "submitted" || status === "streaming";
  const canSend =
    (draft.trim().length > 0 || attachments.some((item) => item.status === "ready")) &&
    !attachments.some((item) => item.status === "uploading") &&
    !busy;

  return (
    <div className="-m-6 flex h-[calc(100dvh-4rem)] min-h-[680px] flex-col overflow-hidden bg-white">
      <ProfileStatusBar
        profile={profile}
        synchronizing={showSynchronization}
        synchronizationFailed={synchronizationFailed}
        onRetry={retrySynchronization}
      />
      <section
        className="flex min-h-0 flex-1 flex-col bg-white"
        aria-label={t("chat.conversation")}
      >
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-5 py-8 lg:px-10">
            <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
              <span className="h-px flex-1 bg-slate-100" /> {t("chat.conversation")}{" "}
              <span className="h-px flex-1 bg-slate-100" />
            </div>
            {conversationQuery.error && (
              <div
                role="alert"
                className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <AlertCircleIcon className="size-4 shrink-0" />
                  {t("chat.historyFailed")}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                  onClick={() => void conversationQuery.refetch()}
                >
                  {t("retry", { ns: "common" })}
                </Button>
              </div>
            )}
            {historyPending && !messages.length && <ConversationHistorySkeleton />}
            {!historyPending && !messages.length && (
              <ChatMessage
                message={{
                  id: "welcome",
                  role: "assistant",
                  parts: [
                    {
                      type: "text",
                      text: conversationT(profile)("conversation.welcome", {
                        project: profile.project.name,
                      }),
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
                  <LoaderCircleIcon className="size-4 animate-spin text-violet-600" />{" "}
                  {t("chat.analysing")}
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
                          ? t("chat.uploading")
                          : attachment.status === "error"
                            ? t("chat.transferFailed")
                            : t("chat.ready", { size: bytesLabel(attachment.sizeBytes) })}
                      </AttachmentDescription>
                    </AttachmentContent>
                    <AttachmentAction
                      aria-label={t("chat.removeAttachment", { name: attachment.name })}
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
                <span className="text-xs font-semibold text-rose-700">{t("chat.recording")}</span>
                <div className="h-px flex-1 bg-rose-200" />
                <Button
                  aria-label={t("chat.stopRecording")}
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
                <AlertCircleIcon className="size-4" /> {composerError ?? t("chat.generationFailed")}
              </div>
            )}
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-2 shadow-[0_12px_35px_-25px_rgba(15,23,42,0.45)] focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
              <Textarea
                aria-label={t("chat.yourAnswer")}
                className="min-h-14 border-0 bg-transparent px-2 py-1.5 text-[15px] shadow-none focus-visible:border-0 focus-visible:ring-0"
                disabled={busy}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                placeholder={profile.nextQuestion ? t("chat.writeAnswer") : t("chat.askQuestion")}
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
                    aria-label={t("chat.addFile")}
                    disabled={busy || attachments.length >= 10}
                    onClick={() => fileInput.current?.click()}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <PaperclipIcon />
                  </Button>
                  <Button
                    aria-label={recording ? t("chat.stopRecording") : t("chat.record")}
                    className={cn(recording && "bg-rose-100 text-rose-700")}
                    disabled={busy}
                    onClick={() => void toggleRecording()}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <MicIcon />
                  </Button>
                  <span className="hidden ps-1 text-[11px] text-slate-400 sm:inline">
                    {t("chat.fileTypes")}
                  </span>
                </div>
                {busy ? (
                  <Button
                    aria-label={t("chat.stopAnswer")}
                    className="rounded-full"
                    onClick={stop}
                    size="icon"
                    variant="outline"
                  >
                    <SquareIcon className="size-3.5 fill-current" />
                  </Button>
                ) : (
                  <Button
                    aria-label={t("chat.send")}
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
            <p className="mt-2 text-center text-[11px] text-slate-400">{t("chat.disclaimer")}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
