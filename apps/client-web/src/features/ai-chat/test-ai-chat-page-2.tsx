import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  FileText,
  Headphones,
  Info,
  Languages,
  MessageCircleMore,
  Mic,
  MoreHorizontal,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useState } from "react";

import { Avatar, AvatarBadge, AvatarFallback } from "@qhse/ui/components/avatar";
import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Progress } from "@qhse/ui/components/progress";
import { ScrollArea } from "@qhse/ui/components/scroll-area";
import { Textarea } from "@qhse/ui/components/textarea";
import { cn } from "@qhse/ui/lib/utils";

const sections = [
  { label: "Identité", count: "3/3", state: "complete" },
  { label: "Organisation", count: "4/8", state: "active" },
  { label: "Activités & processus", count: "2/11", state: "active" },
  { label: "Contexte réglementaire", count: "0/6", state: "pending" },
  { label: "Stratégie", count: "0/5", state: "pending" },
] as const;

const processOptions = [
  { id: "production", label: "Production", description: "Fabrication et assemblage" },
  { id: "quality", label: "Contrôle qualité", description: "Contrôles et libération produit" },
  { id: "purchasing", label: "Achats", description: "Sélection et suivi fournisseurs" },
  { id: "sales", label: "Vente", description: "Devis, commande et relation client" },
  { id: "delivery", label: "Logistique", description: "Stockage et livraison" },
  { id: "support", label: "Service après-vente", description: "Réclamations et assistance" },
];

function AssistantAvatar({ small = false }: { small?: boolean }) {
  return (
    <Avatar
      className={cn(
        "border-0 bg-[#6d43e5] text-white after:border-white/20",
        small ? "size-7" : "size-9",
      )}
    >
      <AvatarFallback className="bg-[#6d43e5] text-white">
        <Sparkles className={small ? "size-3.5" : "size-4"} />
      </AvatarFallback>
      {!small && <AvatarBadge className="bg-emerald-400" />}
    </Avatar>
  );
}

function ConversationPane() {
  const [draft, setDraft] = useState("");
  const [voiceReady, setVoiceReady] = useState(true);

  return (
    <section
      className="flex min-h-0 flex-col border-r border-slate-200 bg-white"
      aria-label="Conversation"
    >
      <div className="flex h-[62px] shrink-0 items-center justify-between border-b border-slate-100 px-5">
        <div className="flex min-w-0 items-center gap-3">
          <AssistantAvatar />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-slate-950">Assistant QHSE</p>
              <span className="size-1.5 rounded-full bg-emerald-500" />
            </div>
            <p className="truncate text-xs text-slate-500">Mémoire du projet activée</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button aria-label="Changer la langue" size="icon-sm" variant="ghost">
            <Languages />
          </Button>
          <Button aria-label="Plus d’options" size="icon-sm" variant="ghost">
            <MoreHorizontal />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-7 lg:px-8">
          <div className="flex justify-center">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-500">
              Aujourd’hui · Profil du projet
            </span>
          </div>

          <div className="flex gap-3">
            <AssistantAvatar small />
            <div className="max-w-[84%]">
              <div className="rounded-2xl rounded-tl-md bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-700">
                Bonjour Naïm. Je vais compléter le profil avec vous, une information à la fois. Vous
                pourrez toujours modifier mes propositions.
              </div>
              <p className="mt-1 text-[10px] text-slate-400">10:24</p>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <div className="max-w-[84%]">
              <div className="rounded-2xl rounded-tr-md bg-[#171b29] px-4 py-3 text-sm leading-6 text-white">
                Je peux vous transmettre notre présentation générale.
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/10 p-2.5">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-white/10">
                    <FileText className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">Présentation_Atlas.pdf</p>
                    <p className="text-[11px] text-slate-300">2,4 Mo · envoyé</p>
                  </div>
                  <CheckCircle2 className="size-4 text-emerald-400" />
                </div>
              </div>
              <p className="mt-1 text-right text-[10px] text-slate-400">10:25 · Lu</p>
            </div>
            <Avatar className="size-7">
              <AvatarFallback className="bg-blue-50 text-blue-700">
                <UserRound className="size-3.5" />
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="flex gap-3">
            <AssistantAvatar small />
            <div className="max-w-[84%]">
              <div className="rounded-2xl rounded-tl-md bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-700">
                Le document m’a permis d’identifier quatre informations. J’ai besoin de votre
                confirmation avant de les enregistrer.
                <div className="mt-3 space-y-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  {[
                    ["Activité principale", "Fabrication industrielle"],
                    ["Zone d’intervention", "Maroc"],
                  ].map(([label, value]) => (
                    <div className="flex items-center gap-2" key={label}>
                      <Check className="size-3.5 text-emerald-600" />
                      <span className="text-xs text-slate-500">{label}</span>
                      <span className="ml-auto text-xs font-semibold text-slate-800">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">10:26</p>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <div className="max-w-[84%] rounded-2xl rounded-tr-md bg-[#171b29] px-4 py-3 text-sm leading-6 text-white">
              Oui, ces informations sont correctes. Nous employons aussi 42 personnes.
            </div>
            <Avatar className="size-7">
              <AvatarFallback className="bg-blue-50 text-blue-700">
                <UserRound className="size-3.5" />
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="flex gap-3">
            <AssistantAvatar small />
            <div className="max-w-[84%] rounded-2xl rounded-tl-md border border-violet-100 bg-violet-50 px-4 py-3 text-sm leading-6 text-violet-950">
              Très bien. La prochaine question est ouverte dans l’espace de réponse à droite.
              Sélectionnez les processus concernés puis validez.
            </div>
          </div>

          {voiceReady && (
            <div className="flex justify-end gap-3">
              <div className="flex w-64 items-center gap-3 rounded-2xl rounded-tr-md bg-[#171b29] px-3 py-2.5 text-white">
                <Button
                  aria-label="Écouter le message vocal"
                  className="rounded-full bg-white/10 text-white hover:bg-white/20"
                  size="icon-sm"
                  variant="ghost"
                >
                  <Headphones />
                </Button>
                <div className="flex flex-1 items-center gap-0.5" aria-hidden="true">
                  {[9, 16, 11, 23, 15, 8, 20, 13, 24, 10, 17, 8].map((height, index) => (
                    <span
                      className="w-1 rounded-full bg-violet-300"
                      key={`${height}-${index}`}
                      style={{ height }}
                    />
                  ))}
                </div>
                <span className="text-[11px] text-slate-300">0:18</span>
                <Button
                  aria-label="Retirer le message vocal"
                  className="text-slate-300"
                  onClick={() => setVoiceReady(false)}
                  size="icon-xs"
                  variant="ghost"
                >
                  <X />
                </Button>
              </div>
              <Avatar className="size-7">
                <AvatarFallback className="bg-blue-50 text-blue-700">
                  <UserRound className="size-3.5" />
                </AvatarFallback>
              </Avatar>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-slate-100 p-4 lg:px-6">
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
          <Textarea
            aria-label="Message libre"
            className="min-h-12 border-0 bg-transparent px-2 py-1 shadow-none focus-visible:border-0 focus-visible:ring-0"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ajoutez une précision ou posez une question…"
            value={draft}
          />
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              <Button aria-label="Joindre un fichier" size="icon-sm" variant="ghost">
                <Paperclip />
              </Button>
              <Button aria-label="Enregistrer un audio" size="icon-sm" variant="ghost">
                <Mic />
              </Button>
            </div>
            <Button aria-label="Envoyer le message" disabled={!draft.trim()} size="icon-sm">
              <Send />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function AnswerWorkspace() {
  const [selected, setSelected] = useState(["production", "quality"]);
  const [customProcess, setCustomProcess] = useState("");
  const [validated, setValidated] = useState(false);

  function toggleProcess(id: string) {
    setValidated(false);
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <section className="flex min-h-0 flex-col bg-[#f7f7fa]" aria-label="Espace de réponse">
      <div className="flex h-[62px] shrink-0 items-center justify-between border-b border-slate-200 px-5 lg:px-7">
        <div>
          <p className="text-xs font-medium text-slate-500">Question actuelle</p>
          <p className="text-sm font-semibold text-slate-950">Activités & processus</p>
        </div>
        <Badge className="border-violet-200 bg-violet-50 text-violet-700" variant="outline">
          10 sur 33
        </Badge>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-3xl p-5 lg:p-8">
          <div className="mb-6 flex items-center gap-3">
            <Button aria-label="Question précédente" size="icon-sm" variant="outline">
              <ArrowLeft />
            </Button>
            <Progress
              className="flex-1 gap-0 [&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-indicator]]:bg-violet-600"
              value={30}
            />
            <span className="text-xs font-medium tabular-nums text-slate-500">30 %</span>
            <Button aria-label="Question suivante" size="icon-sm" variant="outline">
              <ArrowRight />
            </Button>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.35)] lg:p-7">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <Building2 className="size-5" />
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-violet-700">
              Processus de l’organisation
            </p>
            <h1 className="mt-2 text-xl font-semibold leading-8 text-slate-950 lg:text-2xl">
              Quels processus sont essentiels au fonctionnement de votre organisation ?
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Sélectionnez toutes les réponses applicables. Vous pourrez détailler chaque processus
              plus tard.
            </p>

            <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
              {processOptions.map((option) => {
                const isSelected = selected.includes(option.id);
                return (
                  <button
                    aria-pressed={isSelected}
                    className={cn(
                      "flex min-h-20 items-start gap-3 rounded-2xl border p-3.5 text-left transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-100",
                      isSelected
                        ? "border-violet-400 bg-violet-50 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                    )}
                    key={option.id}
                    onClick={() => toggleProcess(option.id)}
                    type="button"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border",
                        isSelected
                          ? "border-violet-600 bg-violet-600 text-white"
                          : "border-slate-300 text-transparent",
                      )}
                    >
                      <Check className="size-3.5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-2 pl-3">
              <Plus className="size-4 shrink-0 text-slate-400" />
              <input
                aria-label="Autre processus"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                onChange={(event) => {
                  setValidated(false);
                  setCustomProcess(event.target.value);
                }}
                placeholder="Ajouter un autre processus…"
                value={customProcess}
              />
              <Button disabled={!customProcess.trim()} size="xs" variant="outline">
                Ajouter
              </Button>
            </div>

            <div className="mt-5 flex items-start gap-2 rounded-2xl bg-blue-50 p-3 text-xs leading-5 text-blue-800">
              <Info className="mt-0.5 size-4 shrink-0" />
              Cette information permettra de construire la cartographie des processus et le
              périmètre du système de management.
            </div>

            {validated ? (
              <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-emerald-950">Réponse enregistrée</p>
                    <p className="text-xs text-emerald-700">
                      {selected.length} processus sélectionnés
                    </p>
                  </div>
                </div>
                <Button
                  className="text-emerald-800"
                  onClick={() => setValidated(false)}
                  size="xs"
                  variant="ghost"
                >
                  Modifier
                </Button>
              </div>
            ) : (
              <Button
                className="mt-5 w-full bg-violet-600 hover:bg-violet-700"
                disabled={selected.length === 0}
                onClick={() => setValidated(true)}
                size="lg"
              >
                Valider {selected.length} processus <ArrowRight />
              </Button>
            )}
          </div>

          <p className="mt-4 text-center text-xs text-slate-400">
            Vous pouvez aussi répondre librement dans la conversation.
          </p>
        </div>
      </ScrollArea>
    </section>
  );
}

export function TestAiChatPage2() {
  return (
    <div className="-m-6 flex h-[calc(100dvh-4rem)] min-h-[720px] flex-col overflow-hidden bg-white">
      <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-slate-200 bg-[#111522] px-5 text-white lg:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            aria-label="Retour au projet"
            className="text-slate-300 hover:bg-white/10 hover:text-white"
            size="icon-sm"
            variant="ghost"
          >
            <ArrowLeft />
          </Button>
          <div className="h-7 w-px bg-white/10" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold">Atlas Industrie</p>
              <Badge className="border-white/15 bg-white/10 text-white" variant="outline">
                ISO 9001
              </Badge>
            </div>
            <p className="truncate text-xs text-slate-400">Complétion du profil</p>
          </div>
        </div>
        <div className="hidden items-center gap-1 rounded-xl bg-white/5 p-1 sm:flex">
          <Button
            className="bg-white text-slate-900 hover:bg-white/90"
            size="sm"
            variant="secondary"
          >
            <MessageCircleMore /> Entretien guidé
          </Button>
          <Button
            className="text-slate-300 hover:bg-white/10 hover:text-white"
            size="sm"
            variant="ghost"
          >
            Aperçu du profil
          </Button>
        </div>
        <Badge className="bg-violet-500/20 text-violet-200" variant="secondary">
          <Sparkles /> Prototype 2
        </Badge>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,0.9fr)_minmax(440px,1.1fr)]">
        <aside className="hidden min-h-0 border-r border-slate-200 bg-[#f8f9fb] lg:flex lg:flex-col">
          <div className="border-b border-slate-200 p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">Profil complété</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">27 %</p>
              </div>
              <p className="text-xs font-medium text-slate-500">9 / 33</p>
            </div>
            <Progress
              className="mt-3 [&_[data-slot=progress-indicator]]:bg-violet-600"
              value={27}
            />
          </div>
          <nav className="space-y-1 p-3" aria-label="Sections du profil">
            {sections.map((section, index) => (
              <button
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                  section.label === "Activités & processus"
                    ? "bg-violet-100 text-violet-900"
                    : "text-slate-600 hover:bg-slate-100",
                )}
                key={section.label}
                type="button"
              >
                {section.state === "complete" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                ) : section.label === "Activités & processus" ? (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[10px] font-semibold text-white">
                    {index + 1}
                  </span>
                ) : (
                  <Circle className="size-4 shrink-0 text-slate-300" />
                )}
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{section.label}</span>
                <span className="text-[11px] text-slate-400">{section.count}</span>
                <ChevronRight className="size-3.5 text-slate-400" />
              </button>
            ))}
          </nav>
          <div className="mt-auto border-t border-slate-200 p-4">
            <div className="rounded-2xl bg-slate-900 p-4 text-white">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <AudioLines className="size-4 text-violet-300" /> Répondre par la voix
              </div>
              <p className="mt-2 text-[11px] leading-5 text-slate-400">
                Décrivez naturellement votre organisation, l’assistant structurera vos réponses.
              </p>
              <Button
                className="mt-3 w-full bg-white/10 text-white hover:bg-white/15"
                size="sm"
                variant="ghost"
              >
                <Mic /> Commencer
              </Button>
            </div>
          </div>
        </aside>

        <ConversationPane />
        <AnswerWorkspace />
      </div>
    </div>
  );
}
