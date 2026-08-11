import {
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  LayoutList,
  Mic,
  Paperclip,
  Pause,
  Send,
  X,
} from "lucide-react";
import { useState } from "react";

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

import {
  CurrentQuestion,
  Message,
  Waveform,
  initialMessages,
  profileSections,
} from "./test-ai-chat-page.js";

function ProfileDrawer({ projectName }: { projectName: string }) {
  const detectedInformation = [
    ["Nom du projet", projectName],
    ["Pays d’activité", "Maroc"],
    ["Effectif", "42 salariés"],
    ["Activité principale", "Fabrication industrielle"],
  ];
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
        <LayoutList />
        <span className="hidden sm:inline">Voir les détails</span>
        <span className="sm:hidden">Détails</span>
      </SheetTrigger>
      <SheetContent className="w-[min(92vw,420px)]! sm:max-w-[420px]!">
        <SheetHeader className="border-b border-slate-100 pr-14">
          <SheetTitle className="text-lg font-semibold">Profil du projet</SheetTitle>
          <SheetDescription>
            Les informations collectées sont enregistrées au fur et à mesure.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 p-6">
            <section className="rounded-3xl bg-violet-50 p-5">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-medium text-violet-700">Progression globale</p>
                  <p className="mt-1 text-3xl font-semibold tracking-tight text-violet-950">27 %</p>
                </div>
                <Badge className="bg-white text-violet-700" variant="secondary">
                  9 sur 33
                </Badge>
              </div>
              <Progress
                className="mt-4 [&_[data-slot=progress-indicator]]:bg-violet-600 [&_[data-slot=progress-track]]:bg-violet-200"
                value={27}
              />
            </section>

            <section>
              <h2 className="text-sm font-semibold text-slate-950">Sections du profil</h2>
              <div className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-4">
                {profileSections.map((section, index) => (
                  <div className="flex items-center gap-3 py-3.5" key={section.label}>
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full",
                        section.value === 100
                          ? "bg-emerald-100 text-emerald-700"
                          : section.value > 0
                            ? "bg-violet-100 text-violet-700"
                            : "bg-slate-100 text-slate-400",
                      )}
                    >
                      {section.value === 100 ? (
                        <Check className="size-3.5" />
                      ) : (
                        <span className="text-[11px] font-semibold">{index + 1}</span>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {section.label}
                        </p>
                        <span className="text-xs text-slate-400">{section.details}</span>
                      </div>
                      <Progress
                        className="mt-2 gap-0 [&_[data-slot=progress-track]]:h-1 [&_[data-slot=progress-indicator]]:bg-violet-600"
                        value={section.value}
                      />
                    </div>
                    <ChevronRight className="size-4 text-slate-300" />
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-950">Informations détectées</h2>
                <Badge variant="secondary">4 confirmées</Badge>
              </div>
              <div className="mt-3 space-y-2.5">
                {detectedInformation.map(([label, value]) => (
                  <div
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"
                    key={label}
                  >
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-500">{label}</p>
                      <p className="truncate text-sm font-medium text-slate-900">{value}</p>
                    </div>
                    <Button size="xs" variant="ghost">
                      Modifier
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </ScrollArea>
        <SheetFooter className="border-t border-slate-100 bg-slate-50">
          <Button className="w-full">Ouvrir la page profil</Button>
          <p className="text-center text-[11px] text-slate-400">
            Toutes les modifications restent disponibles dans l’historique.
          </p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ProfileStatusBar({ projectName }: { projectName: string }) {
  return (
    <div className="shrink-0 border-b border-slate-200 bg-[#fafafe] px-4 py-3 lg:px-8">
      <div className="mx-auto flex max-w-5xl items-center gap-3 sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-sm font-bold text-violet-700">
            27%
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800">Profil du projet</p>
            <p className="max-w-[45vw] truncate text-[11px] text-slate-500 sm:max-w-none">
              {projectName} · 9 réponses sur 33
            </p>
          </div>
        </div>
        <div className="ml-auto shrink-0">
          <ProfileDrawer projectName={projectName} />
        </div>
      </div>
    </div>
  );
}

export function TestAiChatPage3({ projectName = "Atlas Industrie" }: { projectName?: string }) {
  const [messages, setMessages] = useState(() =>
    initialMessages.map((message) => ({
      ...message,
      content: message.content.replace("Atlas Industrie", projectName),
    })),
  );
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [attached, setAttached] = useState(false);
  const canSend = draft.trim().length > 0;

  function sendMessage() {
    const content = draft.trim();
    if (!content) return;
    setMessages((current) => [
      ...current,
      {
        id: `demo-v3-${current.length + 1}`,
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
    <div className="-m-6 flex h-[calc(100dvh-4rem)] min-h-[720px] flex-col overflow-hidden bg-white">
      <ProfileStatusBar projectName={projectName} />

      <section
        className="flex min-h-0 flex-1 flex-col bg-white"
        aria-label="Conversation de profil"
      >
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-5 py-8 lg:px-10">
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
            {recording && (
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
            )}
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
    </div>
  );
}
