import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Input } from "@qhse/ui/components/input";
import { Progress } from "@qhse/ui/components/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@qhse/ui/components/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@qhse/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@qhse/ui/components/tabs";
import { cn } from "@qhse/ui/lib/utils";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  BookOpenCheckIcon,
  BotIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleAlertIcon,
  Clock3Icon,
  DownloadIcon,
  FileCheck2Icon,
  FileTextIcon,
  FilterIcon,
  LinkIcon,
  ListChecksIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TargetIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { BrandLogo } from "@qhse/ui/components/brand-logo";

type DocumentStatus = "Validé" | "À confirmer";
type EvaluationStatus = "Conforme" | "Partiel" | "Non conforme" | "À évaluer";

export type RegulatoryDocument = {
  id: string;
  kind: "Réglementation" | "Norme";
  reference: string;
  title: string;
  jurisdiction: string;
  provisions: string;
  requirements: number;
  source: string;
  status: DocumentStatus;
  reason: string;
};

export type RegulatoryEvaluation = {
  id: string;
  source: string;
  provision: string;
  requirement: string;
  status: EvaluationStatus;
  evidence: string;
  action: string;
  owner: string;
  dueDate: string;
  effectiveness: string;
};

const documents: RegulatoryDocument[] = [
  {
    id: "doc-1",
    kind: "Réglementation",
    reference: "Loi n° 65-99",
    title: "Code du travail",
    jurisdiction: "Maroc",
    provisions: "Articles 24, 281, 287 et 288",
    requirements: 11,
    source: "Secrétariat général du gouvernement",
    status: "Validé",
    reason:
      "Applicable en raison de la présence de salariés, d’activités de production et d’équipements de travail sur le site de Casablanca.",
  },
  {
    id: "doc-2",
    kind: "Norme",
    reference: "ISO 9001:2015",
    title: "Systèmes de management de la qualité",
    jurisdiction: "International",
    provisions: "Clauses 4.4, 7.1.5, 8.5, 9.1 et 10.2",
    requirements: 9,
    source: "Organisation internationale de normalisation",
    status: "Validé",
    reason:
      "La certification ISO 9001 fait partie des objectifs déclarés du projet et couvre les activités de fabrication et de prestation sur site client.",
  },
  {
    id: "doc-3",
    kind: "Réglementation",
    reference: "Loi n° 28-00",
    title: "Gestion des déchets et leur élimination",
    jurisdiction: "Maroc",
    provisions: "Articles 19, 20, 22 et 24",
    requirements: 7,
    source: "Bulletin officiel du Royaume du Maroc",
    status: "Validé",
    reason:
      "Les opérations de découpe, soudage et peinture génèrent des déchets métalliques, des emballages souillés et des résidus de produits chimiques.",
  },
  {
    id: "doc-4",
    kind: "Norme",
    reference: "ISO 45001:2018",
    title: "Management de la santé et de la sécurité au travail",
    jurisdiction: "International",
    provisions: "Clauses 6.1.2, 7.2, 8.1 et 10.2",
    requirements: 6,
    source: "Organisation internationale de normalisation",
    status: "Validé",
    reason:
      "Les risques liés au travail des métaux, à la manutention et aux interventions chez les clients rendent ces exigences pertinentes.",
  },
  {
    id: "doc-5",
    kind: "Réglementation",
    reference: "Texte environnemental sectoriel",
    title: "Rejets et émissions des activités industrielles",
    jurisdiction: "Maroc",
    provisions: "Périmètre à préciser",
    requirements: 3,
    source: "Source officielle à confirmer",
    status: "À confirmer",
    reason:
      "L’applicabilité dépend de la nature des produits de peinture utilisés et des seuils de rejet réels du site.",
  },
];

const evaluations: RegulatoryEvaluation[] = [
  {
    id: "eval-1",
    source: "Loi n° 65-99",
    provision: "Article 281",
    requirement:
      "Maintenir les locaux de travail dans un état assurant la santé et la sécurité des salariés.",
    status: "Conforme",
    evidence: "Inspection mensuelle SST · juillet 2026",
    action: "Aucune action requise",
    owner: "Responsable HSE",
    dueDate: "—",
    effectiveness: "Vérifiée",
  },
  {
    id: "eval-2",
    source: "ISO 9001:2015",
    provision: "Clause 7.1.5",
    requirement:
      "Identifier, vérifier et étalonner les ressources de surveillance et de mesure nécessaires.",
    status: "Partiel",
    evidence: "Registre métrologie 2026",
    action: "Compléter l’identification des instruments de l’atelier pliage",
    owner: "Responsable qualité",
    dueDate: "30 sept. 2026",
    effectiveness: "À vérifier",
  },
  {
    id: "eval-3",
    source: "Loi n° 28-00",
    provision: "Article 20",
    requirement:
      "Assurer la collecte et la gestion des déchets dans des conditions évitant les risques pour la santé et l’environnement.",
    status: "Non conforme",
    evidence: "Photos zone déchets · août 2026",
    action: "Créer une zone de rétention et formaliser le tri des déchets souillés",
    owner: "Responsable production",
    dueDate: "15 sept. 2026",
    effectiveness: "Non vérifiée",
  },
  {
    id: "eval-4",
    source: "ISO 9001:2015",
    provision: "Clause 8.5.1",
    requirement:
      "Réaliser la production et la prestation de service dans des conditions maîtrisées.",
    status: "Conforme",
    evidence: "Instructions de soudage et fiches de contrôle",
    action: "Maintenir la revue annuelle des instructions",
    owner: "Responsable qualité",
    dueDate: "15 janv. 2027",
    effectiveness: "Vérifiée",
  },
  {
    id: "eval-5",
    source: "ISO 45001:2018",
    provision: "Clause 8.1.2",
    requirement:
      "Éliminer les dangers et réduire les risques pour la santé et la sécurité au travail.",
    status: "À évaluer",
    evidence: "Aucune preuve liée",
    action: "Évaluation à réaliser",
    owner: "Non attribué",
    dueDate: "—",
    effectiveness: "Non évaluée",
  },
];

const evaluationStatusStyles: Record<EvaluationStatus, string> = {
  Conforme: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Partiel: "border-amber-200 bg-amber-50 text-amber-800",
  "Non conforme": "border-rose-200 bg-rose-50 text-rose-700",
  "À évaluer": "border-slate-200 bg-slate-100 text-slate-600",
};

export function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof FileTextIcon;
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-[11px] text-slate-400">{detail}</p>
        </div>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-2xl", tone)}>
          <Icon className="size-4.5" />
        </span>
      </div>
    </article>
  );
}

function EvaluationBadge({ status }: { status: EvaluationStatus }) {
  return (
    <Badge className={cn("h-6 border px-2.5", evaluationStatusStyles[status])} variant="outline">
      {status}
    </Badge>
  );
}

function DocumentBadge({ status }: { status: DocumentStatus }) {
  return status === "Validé" ? (
    <Badge className="h-6 border border-emerald-200 bg-emerald-50 px-2.5 text-emerald-700">
      <CheckCircle2Icon /> Validé
    </Badge>
  ) : (
    <Badge className="h-6 border border-amber-200 bg-amber-50 px-2.5 text-amber-800">
      <CircleAlertIcon /> À confirmer
    </Badge>
  );
}

export function DocumentList({
  onOpen,
  items = documents,
}: {
  onOpen: (document: RegulatoryDocument) => void;
  items?: RegulatoryDocument[];
}) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<"Tous" | RegulatoryDocument["kind"]>("Tous");
  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    return items.filter((document) => {
      const matchesFamily = family === "Tous" || document.kind === family;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [document.reference, document.title, document.provisions]
          .join(" ")
          .toLocaleLowerCase("fr")
          .includes(normalizedQuery);
      return matchesFamily && matchesQuery;
    });
  }, [family, items, query]);

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_50px_-38px_rgba(15,23,42,0.35)]">
      <div className="border-b border-slate-100 px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Liste des textes réglementaires et normatives
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Périmètre proposé par l’IA, puis validé par un responsable du projet.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative min-w-0 sm:w-72">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                aria-label="Rechercher un texte"
                className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Référence, titre ou article…"
                value={query}
              />
            </label>
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {(["Tous", "Réglementation", "Norme"] as const).map((item) => (
                <button
                  className={cn(
                    "h-8 flex-1 rounded-lg px-3 text-xs font-medium transition sm:flex-none",
                    family === item
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-500 hover:text-slate-800",
                  )}
                  key={item}
                  onClick={() => setFamily(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="hidden lg:block">
        <Table>
          <TableHeader className="bg-slate-50/80">
            <TableRow className="hover:bg-slate-50/80">
              <TableHead className="h-11 px-6 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Texte / norme
              </TableHead>
              <TableHead className="h-11 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Articles applicables
              </TableHead>
              <TableHead className="h-11 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Exigences
              </TableHead>
              <TableHead className="h-11 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Statut
              </TableHead>
              <TableHead className="w-16 px-6">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDocuments.map((document) => (
              <TableRow
                className="group cursor-pointer"
                key={document.id}
                onClick={() => onOpen(document)}
              >
                <TableCell className="max-w-md whitespace-normal px-6 py-5">
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl",
                        document.kind === "Norme"
                          ? "bg-violet-50 text-violet-700"
                          : "bg-blue-50 text-blue-700",
                      )}
                    >
                      {document.kind === "Norme" ? (
                        <BookOpenCheckIcon className="size-4" />
                      ) : (
                        <FileTextIcon className="size-4" />
                      )}
                    </span>
                    <div>
                      <p className="font-semibold text-slate-950">{document.reference}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{document.title}</p>
                      <p className="mt-1.5 text-[11px] text-slate-400">
                        {document.kind} · {document.jurisdiction}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="max-w-sm whitespace-normal px-4 py-5 text-xs leading-5 text-slate-600">
                  {document.provisions}
                </TableCell>
                <TableCell className="px-4 py-5">
                  <span className="font-semibold tabular-nums text-slate-900">
                    {document.requirements}
                  </span>
                </TableCell>
                <TableCell className="px-4 py-5">
                  <DocumentBadge status={document.status} />
                </TableCell>
                <TableCell className="px-6 py-5 text-right">
                  <Button aria-label={`Voir ${document.reference}`} size="icon-sm" variant="ghost">
                    <ChevronRightIcon className="text-slate-400 group-hover:text-violet-700" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="divide-y divide-slate-100 lg:hidden">
        {filteredDocuments.map((document) => (
          <button
            className="w-full p-4 text-left transition hover:bg-slate-50 sm:p-5"
            key={document.id}
            onClick={() => onOpen(document)}
            type="button"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
                {document.kind === "Norme" ? <BookOpenCheckIcon /> : <FileTextIcon />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-950">{document.reference}</p>
                  <DocumentBadge status={document.status} />
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{document.title}</p>
                <p className="mt-3 text-xs leading-5 text-slate-700">{document.provisions}</p>
                <p className="mt-2 text-[11px] font-medium text-violet-700">
                  {document.requirements} exigences identifiées
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {filteredDocuments.length === 0 && (
        <div className="px-6 py-16 text-center">
          <SearchIcon className="mx-auto size-6 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">Aucun texte trouvé</p>
          <p className="mt-1 text-xs text-slate-400">
            Essayez une autre référence ou un autre filtre.
          </p>
        </div>
      )}

      <footer className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>
          {filteredDocuments.length} textes affichés sur {items.length}
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldCheckIcon className="size-3.5 text-emerald-600" /> Sources et versions conservées
          pour chaque citation
        </span>
      </footer>
    </section>
  );
}

export function EvaluationList({
  onOpen,
  items = evaluations,
  summary = { total: 36, evaluated: 26, conforming: 18, partial: 5, nonConforming: 3 },
}: {
  onOpen: (evaluation: RegulatoryEvaluation) => void;
  items?: RegulatoryEvaluation[];
  summary?: {
    total: number;
    evaluated: number;
    conforming: number;
    partial: number;
    nonConforming: number;
  };
}) {
  const [status, setStatus] = useState<"Toutes" | EvaluationStatus>("Toutes");
  const filteredEvaluations = items.filter(
    (evaluation) => status === "Toutes" || evaluation.status === status,
  );
  const progressPercent =
    summary.total === 0 ? 0 : Math.round((summary.evaluated / summary.total) * 100);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl bg-[#0b1020] p-5 text-white shadow-sm sm:p-6">
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
          <div className="absolute -right-20 -top-24 size-72 rounded-full bg-violet-600/25 blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-violet-300">
              <SparklesIcon className="size-3.5" /> Évaluation en cours
            </span>
            <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
              {summary.evaluated} exigences évaluées sur {summary.total}
            </h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400 sm:text-sm">
              Priorisez les non-conformités, liez les preuves et suivez l’efficacité des actions.
            </p>
          </div>
          <div className="relative rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">Avancement global</span>
              <span className="font-semibold tabular-nums text-white">{progressPercent} %</span>
            </div>
            <Progress
              className="mt-3 [&_[data-slot=progress-indicator]]:bg-violet-500 [&_[data-slot=progress-track]]:bg-white/10"
              value={progressPercent}
            />
            <div className="mt-3 flex justify-between text-[10px] text-slate-400">
              <span>{summary.conforming} conformes</span>
              <span>{summary.partial} partielles</span>
              <span>{summary.nonConforming} non conformes</span>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_50px_-38px_rgba(15,23,42,0.35)]">
        <div className="border-b border-slate-100 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Évaluation réglementaire et normative
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Une ligne par exigence, avec preuve, action, responsable et contrôle d’efficacité.
              </p>
            </div>
            <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1">
              <FilterIcon className="ml-2 size-3.5 shrink-0 text-slate-400" />
              {(["Toutes", "Conforme", "Partiel", "Non conforme", "À évaluer"] as const).map(
                (item) => (
                  <button
                    className={cn(
                      "h-8 shrink-0 rounded-lg px-3 text-xs font-medium transition",
                      status === item
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-500 hover:text-slate-800",
                    )}
                    key={item}
                    onClick={() => setStatus(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>

        <div className="hidden xl:block">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="hover:bg-slate-50/80">
                {[
                  "Texte / exigence applicable",
                  "Conformité",
                  "Preuve",
                  "Action",
                  "Responsable",
                  "Date prévue",
                ].map((heading) => (
                  <TableHead
                    className="h-11 px-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500 first:pl-6"
                    key={heading}
                  >
                    {heading}
                  </TableHead>
                ))}
                <TableHead className="w-14 px-5">
                  <span className="sr-only">Détails</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEvaluations.map((evaluation) => (
                <TableRow
                  className="group cursor-pointer"
                  key={evaluation.id}
                  onClick={() => onOpen(evaluation)}
                >
                  <TableCell className="max-w-md whitespace-normal py-5 pl-6 pr-4">
                    <p className="text-[11px] font-semibold text-violet-700">
                      {evaluation.source} · {evaluation.provision}
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-700">
                      {evaluation.requirement}
                    </p>
                  </TableCell>
                  <TableCell className="px-4 py-5">
                    <EvaluationBadge status={evaluation.status} />
                  </TableCell>
                  <TableCell className="max-w-52 whitespace-normal px-4 py-5 text-xs leading-5 text-slate-600">
                    {evaluation.evidence}
                  </TableCell>
                  <TableCell className="max-w-64 whitespace-normal px-4 py-5 text-xs leading-5 text-slate-600">
                    {evaluation.action}
                  </TableCell>
                  <TableCell className="px-4 py-5 text-xs text-slate-600">
                    {evaluation.owner}
                  </TableCell>
                  <TableCell className="px-4 py-5 text-xs text-slate-600">
                    {evaluation.dueDate}
                  </TableCell>
                  <TableCell className="px-5 py-5 text-right">
                    <ChevronRightIcon className="size-4 text-slate-300 group-hover:text-violet-700" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="divide-y divide-slate-100 xl:hidden">
          {filteredEvaluations.map((evaluation) => (
            <button
              className="w-full p-4 text-left transition hover:bg-slate-50 sm:p-5"
              key={evaluation.id}
              onClick={() => onOpen(evaluation)}
              type="button"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-violet-700">
                  {evaluation.source} · {evaluation.provision}
                </p>
                <EvaluationBadge status={evaluation.status} />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-800">{evaluation.requirement}</p>
              <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-3 text-xs sm:grid-cols-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">Preuve</p>
                  <p className="mt-1 text-slate-600">{evaluation.evidence}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">Action</p>
                  <p className="mt-1 text-slate-600">{evaluation.action}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <footer className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-[11px] text-slate-500 sm:px-6">
          <span>{filteredEvaluations.length} exigences affichées</span>
          <span>Dernière modification aujourd’hui à 14:32</span>
        </footer>
      </section>
    </div>
  );
}

export function DetailSheet({
  document,
  evaluation,
  onOpenChange,
}: {
  document: RegulatoryDocument | null;
  evaluation: RegulatoryEvaluation | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = Boolean(document || evaluation);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(96vw,600px)]! sm:max-w-[600px]!">
        {document && (
          <>
            <SheetHeader className="border-b border-slate-100 pr-16">
              <div className="mb-2 flex items-center gap-2">
                <Badge className="bg-violet-50 text-violet-700" variant="secondary">
                  {document.kind}
                </Badge>
                <DocumentBadge status={document.status} />
              </div>
              <SheetTitle className="text-xl font-semibold">{document.reference}</SheetTitle>
              <SheetDescription className="leading-5">{document.title}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                <section className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-violet-800">
                    <BotIcon className="size-4" /> Pourquoi ce texte est proposé
                  </div>
                  <p className="mt-2 text-sm leading-6 text-violet-950/80">{document.reason}</p>
                </section>
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Articles applicables
                  </h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-800">
                    {document.provisions}
                  </p>
                </section>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-[11px] text-slate-400">Périmètre</p>
                    <p className="mt-1 text-sm font-medium">{document.jurisdiction}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-[11px] text-slate-400">Exigences extraites</p>
                    <p className="mt-1 text-sm font-medium">{document.requirements} exigences</p>
                  </div>
                </div>
                <section className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start gap-3">
                    <LinkIcon className="mt-0.5 size-4 shrink-0 text-slate-400" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Source officielle</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{document.source}</p>
                      <button
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-violet-700"
                        type="button"
                      >
                        Consulter la source <ArrowUpRightIcon className="size-3" />
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            </div>
            <SheetFooter className="border-t border-slate-100 bg-slate-50">
              <Button className="h-10 rounded-xl bg-slate-950 hover:bg-slate-800">
                Ouvrir les exigences
              </Button>
              <Button className="h-10 rounded-xl" variant="outline">
                Modifier l’applicabilité
              </Button>
            </SheetFooter>
          </>
        )}

        {evaluation && (
          <>
            <SheetHeader className="border-b border-slate-100 pr-16">
              <div className="mb-2 flex items-center gap-2">
                <EvaluationBadge status={evaluation.status} />
              </div>
              <SheetTitle className="text-lg font-semibold">{evaluation.provision}</SheetTitle>
              <SheetDescription>{evaluation.source}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <div className="space-y-5">
                <section>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Exigence applicable
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-800">{evaluation.requirement}</p>
                </section>
                <section className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                    <FileCheck2Icon className="size-4" /> Preuve associée
                  </div>
                  <p className="mt-2 text-sm text-emerald-950/80">{evaluation.evidence}</p>
                  <Button className="mt-3 bg-white" size="sm" variant="outline">
                    Voir la preuve
                  </Button>
                </section>
                <section className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <TargetIcon className="size-4 text-violet-600" /> Plan d’action
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{evaluation.action}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
                    <div>
                      <p className="text-slate-400">Responsable</p>
                      <p className="mt-1 font-medium text-slate-700">{evaluation.owner}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Date prévue</p>
                      <p className="mt-1 font-medium text-slate-700">{evaluation.dueDate}</p>
                    </div>
                  </div>
                </section>
                <section className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-[11px] text-slate-400">Critère d’efficacité</p>
                  <p className="mt-1 text-sm font-medium text-slate-800">
                    {evaluation.effectiveness}
                  </p>
                </section>
              </div>
            </div>
            <SheetFooter className="border-t border-slate-100 bg-slate-50">
              <Button className="h-10 rounded-xl bg-slate-950 hover:bg-slate-800">
                Modifier l’évaluation
              </Button>
              <Button className="h-10 rounded-xl" variant="outline">
                Ajouter une preuve
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function RegulatoryWatchTestPage() {
  const [selectedDocument, setSelectedDocument] = useState<RegulatoryDocument | null>(null);
  const [selectedEvaluation, setSelectedEvaluation] = useState<RegulatoryEvaluation | null>(null);
  const [analysisState, setAnalysisState] = useState<"idle" | "done">("idle");
  const [exportReady, setExportReady] = useState(false);

  return (
    <div className="min-h-dvh bg-[#f5f6f8] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-[1540px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-slate-950 text-white">
              <BrandLogo variant="icon" className="size-4 object-contain" />
            </span>
            <span className="text-sm font-semibold tracking-tight">getqhse</span>
          </div>
          <span className="hidden h-5 w-px bg-slate-200 sm:block" />
          <Badge className="hidden bg-violet-50 text-violet-700 sm:inline-flex" variant="secondary">
            Prototype veille
          </Badge>
          <a
            className="ml-auto inline-flex items-center gap-2 text-xs font-medium text-slate-500 transition hover:text-slate-950"
            href="/"
          >
            <ArrowLeftIcon className="size-3.5" /> Retour au tableau de bord
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1540px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="rounded-3xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs leading-5 text-amber-900 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <span className="flex items-start gap-2">
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" /> Données de démonstration : les
            références et conclusions doivent être validées avant utilisation réglementaire.
          </span>
          <span className="mt-1 block shrink-0 font-semibold sm:mt-0">
            Environnement public de test
          </span>
        </div>

        <div className="mt-7 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <span>Atlas Industrie</span>
              <ChevronRightIcon className="size-3.5" />
              <span className="text-slate-600">Veille réglementaire</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">
              Veille réglementaire
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Le référentiel applicable et son évaluation, construits à partir du profil validé du
              projet.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="h-10 rounded-xl border-slate-200 bg-white"
              onClick={() => setAnalysisState("done")}
              variant="outline"
            >
              <RefreshCwIcon className={cn(analysisState === "done" && "text-emerald-600")} />
              {analysisState === "done" ? "Analyse actualisée" : "Actualiser l’analyse"}
            </Button>
            <Button
              className="h-10 rounded-xl bg-slate-950 px-4 text-white hover:bg-slate-800"
              onClick={() => setExportReady(true)}
            >
              {exportReady ? <CheckCircle2Icon /> : <DownloadIcon />}
              {exportReady ? "Export préparé" : "Exporter en Excel"}
            </Button>
          </div>
        </div>

        <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={FileTextIcon}
            label="Textes applicables"
            value="5"
            detail="4 validés · 1 à confirmer"
            tone="bg-blue-50 text-blue-700"
          />
          <MetricCard
            icon={ListChecksIcon}
            label="Exigences identifiées"
            value="36"
            detail="Issues de 17 provisions"
            tone="bg-violet-50 text-violet-700"
          />
          <MetricCard
            icon={CheckCircle2Icon}
            label="Taux de conformité"
            value="72 %"
            detail="26 exigences évaluées"
            tone="bg-emerald-50 text-emerald-700"
          />
          <MetricCard
            icon={CalendarClockIcon}
            label="Actions ouvertes"
            value="4"
            detail="1 échéance prioritaire"
            tone="bg-rose-50 text-rose-700"
          />
        </section>

        <section className="mt-4 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm">
              <ShieldCheckIcon className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-emerald-950">
                Référentiel basé sur le profil validé
              </p>
              <p className="mt-0.5 text-xs leading-5 text-emerald-800/70">
                Profil révision 4 · Analyse terminée le 10 août 2026 · Référentiel publié
              </p>
            </div>
          </div>
          <button
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-800"
            type="button"
          >
            Voir la traçabilité <ArrowUpRightIcon className="size-3.5" />
          </button>
        </section>

        <Tabs className="mt-6 gap-4" defaultValue="documents">
          <div className="w-full pb-1">
            <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
              <TabsTrigger
                className="h-auto min-h-11 whitespace-normal rounded-xl px-2 py-2 text-center leading-4 data-active:bg-slate-950 data-active:text-white sm:px-5"
                value="documents"
              >
                <FileTextIcon /> Liste des textes réglementaires et normatives
                <span className="ml-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 data-[active=true]:bg-white/10">
                  5
                </span>
              </TabsTrigger>
              <TabsTrigger
                className="h-auto min-h-11 whitespace-normal rounded-xl px-2 py-2 text-center leading-4 data-active:bg-slate-950 data-active:text-white sm:px-5"
                value="evaluation"
              >
                <ListChecksIcon /> Évaluation réglementaire et normative
                <span className="ml-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                  36
                </span>
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="documents">
            <DocumentList
              onOpen={(document) => {
                setSelectedEvaluation(null);
                setSelectedDocument(document);
              }}
            />
          </TabsContent>
          <TabsContent value="evaluation">
            <EvaluationList
              onOpen={(evaluation) => {
                setSelectedDocument(null);
                setSelectedEvaluation(evaluation);
              }}
            />
          </TabsContent>
        </Tabs>

        <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 text-[11px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-1.5">
            <Clock3Icon className="size-3.5" /> Dernière synchronisation : aujourd’hui à 14:32
          </span>
          <span>Les contenus normatifs restent liés à leur révision et à leur page source.</span>
        </div>
      </main>

      <div className="sr-only" aria-live="polite">
        {analysisState === "done" ? "Analyse actualisée" : ""}
        {exportReady ? "Export Excel préparé" : ""}
      </div>

      <DetailSheet
        document={selectedDocument}
        evaluation={selectedEvaluation}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDocument(null);
            setSelectedEvaluation(null);
          }
        }}
      />
    </div>
  );
}
