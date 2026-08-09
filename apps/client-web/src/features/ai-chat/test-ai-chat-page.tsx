import {
  ArrowUp,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  FileText,
  Info,
  Languages,
  Mic,
  MoreHorizontal,
  Paperclip,
  Pause,
  RotateCcw,
  Send,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  Attachment,
  AttachmentAction,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@qhse/ui/components/attachment";
import { Avatar, AvatarBadge, AvatarFallback } from "@qhse/ui/components/avatar";
import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Progress } from "@qhse/ui/components/progress";
import { ScrollArea } from "@qhse/ui/components/scroll-area";
import { Textarea } from "@qhse/ui/components/textarea";
import { cn } from "@qhse/ui/lib/utils";

export type DemoMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: string;
  attachment?: { name: string; description: string };
  confirmation?: { label: string; value: string };
};

export const initialMessages: DemoMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    timestamp: "10:24",
    content:
      "Bonjour Naïm, je vais vous aider à compléter le profil d’Atlas Industrie. Je poserai une question à la fois et vous pourrez corriger chaque information avant validation.",
  },
  {
    id: "document",
    role: "user",
    timestamp: "10:25",
    content:
      "Voici notre présentation. Elle contient une partie des informations sur l’entreprise.",
    attachment: { name: "Présentation_Atlas.pdf", description: "PDF · 2,4 Mo" },
  },
  {
    id: "document-read",
    role: "assistant",
    timestamp: "10:25",
    content:
      "J’ai bien reçu le document. J’y ai trouvé le nom de l’entreprise, son activité principale et sa zone d’intervention. Pour confirmer : combien de salariés compte actuellement l’organisation ?",
  },
  {
    id: "employees",
    role: "user",
    timestamp: "10:27",
    content: "Nous sommes actuellement 42 salariés, dont 6 personnes dans l’équipe qualité.",
  },
  {
    id: "employees-confirmed",
    role: "assistant",
    timestamp: "10:27",
    content: "Parfait, j’ai enregistré cette information.",
    confirmation: { label: "Effectif de l’organisation", value: "42 salariés" },
  },
];

export const suggestions = [
  "Production et contrôle qualité",
  "Vente et service client",
  "Achats et gestion fournisseurs",
];

export const profileSections = [
  { label: "Identité", value: 100, details: "3 sur 3" },
  { label: "Organisation", value: 50, details: "4 sur 8" },
  { label: "Activités & processus", value: 18, details: "2 sur 11" },
  { label: "Contexte réglementaire", value: 0, details: "0 sur 6" },
  { label: "Stratégie", value: 0, details: "0 sur 5" },
];

export function AiAvatar() {
  return (
    <Avatar className="size-9 border-0 bg-violet-600 text-white after:border-violet-500" size="lg">
      <AvatarFallback className="bg-violet-600 text-white">
        <Sparkles className="size-4" />
      </AvatarFallback>
      <AvatarBadge className="bg-emerald-400" />
    </Avatar>
  );
}

export function Message({ message }: { message: DemoMessage }) {
  const isUser = message.role === "user";
  return (
    <article
      aria-label={isUser ? "Message de l’utilisateur" : "Message de l’assistant"}
      className={cn("flex gap-3", isUser && "justify-end")}
    >
      {!isUser && <AiAvatar />}
      <div className={cn("min-w-0 max-w-[min(42rem,88%)]", isUser && "items-end")}>
        {!isUser && (
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">Assistant QHSE</span>
            <span className="text-[11px] text-slate-400">{message.timestamp}</span>
          </div>
        )}
        <div
          className={cn(
            "text-[15px] leading-6 text-slate-700",
            isUser && "rounded-3xl rounded-br-lg bg-slate-900 px-4 py-3 text-white shadow-sm",
          )}
        >
          <p>{message.content}</p>
          {message.attachment && (
            <Attachment className="mt-3 border-white/15 bg-white/10 text-white" size="sm">
              <AttachmentMedia className="bg-white/10 text-white">
                <FileText />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{message.attachment.name}</AttachmentTitle>
                <AttachmentDescription className="text-slate-300">
                  {message.attachment.description}
                </AttachmentDescription>
              </AttachmentContent>
            </Attachment>
          )}
        </div>
        {message.confirmation && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Check className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-emerald-700">Information enregistrée</p>
              <p className="truncate text-sm font-semibold text-slate-900">
                {message.confirmation.label} · {message.confirmation.value}
              </p>
            </div>
            <Button className="text-emerald-800" size="xs" variant="ghost">
              Modifier
            </Button>
          </div>
        )}
        {isUser && (
          <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[11px] text-slate-400">
            <CheckCircle2 className="size-3" /> Envoyé · {message.timestamp}
          </div>
        )}
      </div>
      {isUser && (
        <Avatar className="mt-0.5 size-8">
          <AvatarFallback className="bg-blue-50 text-blue-700">
            <UserRound className="size-4" />
          </AvatarFallback>
        </Avatar>
      )}
    </article>
  );
}

export function CurrentQuestion({ onSuggestion }: { onSuggestion: (value: string) => void }) {
  return (
    <article className="flex gap-3" aria-label="Question actuelle">
      <AiAvatar />
      <div className="min-w-0 max-w-[min(44rem,90%)] flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">Assistant QHSE</span>
          <Badge className="border-violet-200 bg-violet-50 text-violet-700" variant="outline">
            Question actuelle
          </Badge>
        </div>
        <div className="overflow-hidden rounded-3xl rounded-tl-lg border border-violet-200 bg-white shadow-[0_14px_40px_-28px_rgba(91,33,182,0.55)]">
          <div className="flex items-center justify-between border-b border-violet-100 bg-violet-50/70 px-5 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-violet-700">
              <Building2 className="size-3.5" /> Activités & processus
            </div>
            <span className="text-xs font-medium text-slate-500">Question 10 sur 33</span>
          </div>
          <div className="space-y-4 p-5">
            <div>
              <h2 className="text-[17px] font-semibold leading-7 text-slate-950">
                Quels sont les processus clés qui permettent à votre organisation de fonctionner ?
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-slate-500">
                Par exemple : production, achats, contrôle qualité, vente ou support client.
              </p>
            </div>
            <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">
              <CircleHelp className="mt-0.5 size-3.5 shrink-0 text-blue-600" />
              Cette réponse aidera à définir le périmètre ISO 9001 et les exigences applicables.
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-slate-500">Réponses rapides</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <Button
                    className="h-auto min-h-7 whitespace-normal rounded-full border-slate-200 bg-white px-3 py-1.5 text-left text-xs font-normal text-slate-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
                    key={suggestion}
                    onClick={() => onSuggestion(suggestion)}
                    size="sm"
                    variant="outline"
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function Waveform() {
  const bars = [8, 14, 22, 11, 25, 18, 9, 21, 16, 27, 12, 19, 8, 23, 14, 10];
  return (
    <div className="flex h-7 flex-1 items-center gap-1" aria-hidden="true">
      {bars.map((height, index) => (
        <span
          className="w-1 rounded-full bg-rose-500"
          key={`${height}-${index}`}
          style={{ height }}
        />
      ))}
    </div>
  );
}

export function TestAiChatPage() {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [attached, setAttached] = useState(false);

  const canSend = draft.trim().length > 0;
  const progressLabel = useMemo(() => `${Math.round((9 / 33) * 100)} %`, []);

  function sendMessage() {
    const content = draft.trim();
    if (!content) return;
    setMessages((current) => [
      ...current,
      {
        id: `demo-${current.length + 1}`,
        role: "user",
        content,
        timestamp: "maintenant",
        ...(attached
          ? { attachment: { name: "Processus_Atlas.docx", description: "DOCX · prêt" } }
          : {}),
      },
    ]);
    setDraft("");
    setAttached(false);
    setRecording(false);
  }

  return (
    <div className="-m-6 flex h-[calc(100dvh-4rem)] min-h-[720px] flex-col overflow-hidden bg-[#f6f7f9]">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3.5 lg:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <AiAvatar />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold text-slate-950">Assistant QHSE</h1>
              <Badge className="bg-violet-100 text-violet-700" variant="secondary">
                Prototype
              </Badge>
            </div>
            <p className="truncate text-xs text-slate-500">
              Complétion guidée du profil · Atlas Industrie
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            className="hidden border-violet-200 bg-violet-50 text-violet-700 sm:flex"
            variant="outline"
          >
            <Sparkles /> Profil du projet <ChevronDown />
          </Button>
          <Button aria-label="Changer la langue" size="icon" variant="ghost">
            <Languages />
          </Button>
          <Button aria-label="Plus d’options" size="icon" variant="ghost">
            <MoreHorizontal />
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-h-0 flex-col bg-white" aria-label="Conversation de profil">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-2.5 lg:px-8">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="size-2 rounded-full bg-emerald-500" /> Conversation enregistrée
            </div>
            <div className="flex items-center gap-2">
              <Badge
                className="border-violet-200 bg-violet-50 text-violet-700 xl:hidden"
                variant="outline"
              >
                9 / 33 · {progressLabel}
              </Badge>
              <Button className="text-slate-500" size="xs" variant="ghost">
                <RotateCcw /> <span className="hidden sm:inline">Recommencer</span>
              </Button>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-7 px-5 py-8 lg:px-9">
              <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                <span className="h-px flex-1 bg-slate-100" /> Aujourd’hui{" "}
                <span className="h-px flex-1 bg-slate-100" />
              </div>
              {messages.map((message) => (
                <Message key={message.id} message={message} />
              ))}
              <CurrentQuestion onSuggestion={setDraft} />
            </div>
          </ScrollArea>

          <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-4 lg:px-8">
            <div className="mx-auto max-w-4xl">
              {attached && (
                <Attachment className="mb-2" size="sm" state="done">
                  <AttachmentMedia>
                    <FileText />
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle>Processus_Atlas.docx</AttachmentTitle>
                    <AttachmentDescription>DOCX · 840 Ko · prêt</AttachmentDescription>
                  </AttachmentContent>
                  <AttachmentAction
                    aria-label="Retirer le fichier"
                    onClick={() => setAttached(false)}
                  >
                    <X />
                  </AttachmentAction>
                </Attachment>
              )}
              {recording ? (
                <div className="mb-2 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2">
                  <span className="size-2 animate-pulse rounded-full bg-rose-500" />
                  <span className="text-xs font-semibold text-rose-700">00:12</span>
                  <Waveform />
                  <Button aria-label="Mettre en pause" size="icon-sm" variant="ghost">
                    <Pause className="text-rose-700" />
                  </Button>
                  <Button
                    aria-label="Annuler l’enregistrement"
                    onClick={() => setRecording(false)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <X />
                  </Button>
                </div>
              ) : null}
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-2 shadow-[0_12px_35px_-25px_rgba(15,23,42,0.45)] focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
                <Textarea
                  aria-label="Votre réponse"
                  className="min-h-14 border-0 bg-transparent px-2 py-1.5 text-[15px] shadow-none focus-visible:border-0 focus-visible:ring-0"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Décrivez vos processus clés…"
                  value={draft}
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1">
                    <Button
                      aria-label="Ajouter un fichier"
                      onClick={() => setAttached((value) => !value)}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <Paperclip />
                    </Button>
                    <Button
                      aria-label="Enregistrer un message vocal"
                      className={cn(recording && "bg-rose-100 text-rose-700")}
                      onClick={() => setRecording((value) => !value)}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <Mic />
                    </Button>
                    <span className="hidden pl-1 text-[11px] text-slate-400 sm:inline">
                      PDF, Word, image ou audio
                    </span>
                  </div>
                  <Button
                    aria-label="Envoyer la réponse"
                    className="rounded-full"
                    disabled={!canSend}
                    onClick={sendMessage}
                    size="icon"
                  >
                    {canSend ? <ArrowUp /> : <Send />}
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-center text-[11px] text-slate-400">
                L’IA peut se tromper. Vérifiez les informations avant de finaliser le profil.
              </p>
            </div>
          </div>
        </section>

        <aside className="hidden min-h-0 border-l border-slate-200 bg-[#f8f9fb] xl:flex xl:flex-col">
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-5 p-5">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Progression du profil</p>
                    <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
                      {progressLabel}
                    </p>
                  </div>
                  <span className="flex size-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                    <Sparkles className="size-5" />
                  </span>
                </div>
                <Progress
                  className="mt-4 [&_[data-slot=progress-indicator]]:bg-violet-600"
                  value={27}
                />
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>9 réponses complétées</span>
                  <span>24 restantes</span>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-slate-950">Sections du profil</h2>
                  <Button size="xs" variant="ghost">
                    Voir le profil
                  </Button>
                </div>
                <div className="mt-4 space-y-4">
                  {profileSections.map((section) => (
                    <div key={section.label}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                        <span className="font-medium text-slate-700">{section.label}</span>
                        <span className="text-slate-400">{section.details}</span>
                      </div>
                      <Progress
                        className="gap-0 [&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-indicator]]:bg-blue-600"
                        value={section.value}
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-slate-950">Informations détectées</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Vous pourrez tout modifier depuis la page profil.
                </p>
                <div className="mt-4 space-y-3">
                  {[
                    ["Nom du projet", "Atlas Industrie"],
                    ["Pays d’activité", "Maroc"],
                    ["Effectif", "42 salariés"],
                    ["Activité principale", "Fabrication industrielle"],
                  ].map(([label, value]) => (
                    <div className="flex items-start gap-2.5" key={label}>
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">{label}</p>
                        <p className="truncate text-sm font-medium text-slate-800">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="flex gap-2 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                <Info className="mt-0.5 size-4 shrink-0" />
                Les réponses sont enregistrées automatiquement et isolées dans votre organisation.
              </div>
            </div>
          </ScrollArea>
        </aside>
      </div>
    </div>
  );
}
