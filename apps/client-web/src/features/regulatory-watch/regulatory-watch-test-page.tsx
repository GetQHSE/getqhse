import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@qhse/ui/components/dropdown-menu";
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
  Columns3Icon,
  Clock3Icon,
  DownloadIcon,
  FileCheck2Icon,
  FileTextIcon,
  FilterIcon,
  LinkIcon,
  ListChecksIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TargetIcon,
} from "lucide-react";
import type { TFunction } from "i18next";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { BrandLogo } from "@qhse/ui/components/brand-logo";

/** Stable keys: labels come from the `regulatory` catalog at render time. */
type DocumentStatus = "APPLICABLE" | "VALIDATED" | "TO_CONFIRM";
export type EvaluationStatus = "CONFORMING" | "PARTIAL" | "NON_CONFORMING" | "NOT_ASSESSED";
type DocumentKind = "REGULATION" | "STANDARD";

type RegulatoryT = TFunction<"regulatory">;

export type RegulatoryDocument = {
  id: string;
  kind: DocumentKind;
  reference: string;
  title: string;
  jurisdiction: string;
  provisions: string;
  requirements: number;
  source: string;
  sourceUrl?: string | null;
  requirementText?: string | null;
  sourceNeedsReview?: boolean;
  status: DocumentStatus;
  reason: string;
};

export type RegulatoryEvidenceItem = {
  id: string;
  kind: "DOCUMENT" | "PHOTO" | "NOTE" | "LINK";
  fileId: string | null;
  label: string | null;
  url: string | null;
  note: string | null;
};

/** The action row the register edits. One evaluation can carry several actions; the table and the
 *  sheet work on the first one and report the rest as a count, while the XLSX export still expands
 *  every action to its own line. */
export type RegulatoryActionRow = {
  id: string;
  title: string;
  assigneeId: string | null;
  assigneeName: string | null;
  resources: string | null;
  dueDate: string | null;
  completedDate: string | null;
  status: "OPEN" | "IN_PROGRESS" | "DONE" | "VERIFIED";
  effectivenessCriteria: string | null;
  effectiveness: "PENDING" | "EFFECTIVE" | "INEFFECTIVE";
  comment: string | null;
};

export type RegulatoryEvaluation = {
  id: string;
  revision?: number;
  result?: "CONFORMING" | "PARTIAL" | "NON_CONFORMING" | "NOT_ASSESSED";
  source: string;
  provision: string;
  requirement: string;
  citation?: string;
  officialSourceText?: string;
  status: EvaluationStatus;
  evidence: string;
  action: string;
  owner: string;
  dueDate: string;
  effectiveness: string;
  /** Display strings for the columns the XLSX export has always carried but the table did not. */
  resources?: string;
  completedDate?: string;
  effectivenessCriteria?: string;
  comment?: string;
  /** Raw values, so the same row object can seed the edit sheet without a second lookup. */
  evaluationComment?: string | null;
  evidenceItems?: RegulatoryEvidenceItem[];
  primaryAction?: RegulatoryActionRow | null;
  additionalActionCount?: number;
  aiStatus?: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  aiSuggestedStatus?: EvaluationStatus | undefined;
  aiSuggestedResult?: "CONFORMING" | "PARTIAL" | "NON_CONFORMING" | "NOT_ASSESSED" | null;
  aiRationale?: string | null;
  aiConfidence?: number | null;
  aiMatchedProfileKeys?: string[];
  aiMissingInformation?: string[];
  aiRemediationPlan?: string | null;
  aiAction?:
    | {
        title: string | null;
        resources: string | null;
        startDate: string | null;
        dueDate: string | null;
        responsible: string | null;
        effectivenessCriteria: string | null;
      }
    | undefined;
};

const documents: RegulatoryDocument[] = [
  {
    id: "doc-1",
    kind: "REGULATION",
    reference: "Loi n° 65-99",
    title: "Code du travail",
    jurisdiction: "Maroc",
    provisions: "Articles 24, 281, 287 et 288",
    requirements: 11,
    source: "Secrétariat général du gouvernement",
    status: "VALIDATED",
    reason:
      "Applicable en raison de la présence de salariés, d’activités de production et d’équipements de travail sur le site de Casablanca.",
  },
  {
    id: "doc-2",
    kind: "STANDARD",
    reference: "ISO 9001:2015",
    title: "Systèmes de management de la qualité",
    jurisdiction: "International",
    provisions: "Clauses 4.4, 7.1.5, 8.5, 9.1 et 10.2",
    requirements: 9,
    source: "Organisation internationale de normalisation",
    status: "VALIDATED",
    reason:
      "La certification ISO 9001 fait partie des objectifs déclarés du projet et couvre les activités de fabrication et de prestation sur site client.",
  },
  {
    id: "doc-3",
    kind: "REGULATION",
    reference: "Loi n° 28-00",
    title: "Gestion des déchets et leur élimination",
    jurisdiction: "Maroc",
    provisions: "Articles 19, 20, 22 et 24",
    requirements: 7,
    source: "Bulletin officiel du Royaume du Maroc",
    status: "VALIDATED",
    reason:
      "Les opérations de découpe, soudage et peinture génèrent des déchets métalliques, des emballages souillés et des résidus de produits chimiques.",
  },
  {
    id: "doc-4",
    kind: "STANDARD",
    reference: "ISO 45001:2018",
    title: "Management de la santé et de la sécurité au travail",
    jurisdiction: "International",
    provisions: "Clauses 6.1.2, 7.2, 8.1 et 10.2",
    requirements: 6,
    source: "Organisation internationale de normalisation",
    status: "VALIDATED",
    reason:
      "Les risques liés au travail des métaux, à la manutention et aux interventions chez les clients rendent ces exigences pertinentes.",
  },
  {
    id: "doc-5",
    kind: "REGULATION",
    reference: "Texte environnemental sectoriel",
    title: "Rejets et émissions des activités industrielles",
    jurisdiction: "Maroc",
    provisions: "Périmètre à préciser",
    requirements: 3,
    source: "Source officielle à confirmer",
    status: "TO_CONFIRM",
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
    status: "CONFORMING",
    evidence: "Inspection mensuelle SST · juillet 2026",
    action: "Aucune action requise",
    owner: "Responsable HSE",
    dueDate: "—",
    effectiveness: "Vérifiée",
    resources: "—",
    completedDate: "12 juil. 2026",
    effectivenessCriteria: "Aucun écart relevé sur deux inspections consécutives",
    comment: "Conformité confirmée lors de la revue HSE de juillet.",
  },
  {
    id: "eval-2",
    source: "ISO 9001:2015",
    provision: "Clause 7.1.5",
    requirement:
      "Identifier, vérifier et étalonner les ressources de surveillance et de mesure nécessaires.",
    status: "PARTIAL",
    evidence: "Registre métrologie 2026",
    action: "Compléter l’identification des instruments de l’atelier pliage",
    owner: "Responsable qualité",
    dueDate: "30 sept. 2026",
    effectiveness: "À vérifier",
    resources: "Budget métrologie 2026 · prestataire externe",
    completedDate: "—",
    effectivenessCriteria: "100 % des instruments critiques identifiés et étalonnés",
    comment: "Atelier pliage non couvert par le registre actuel.",
  },
  {
    id: "eval-3",
    source: "Loi n° 28-00",
    provision: "Article 20",
    requirement:
      "Assurer la collecte et la gestion des déchets dans des conditions évitant les risques pour la santé et l’environnement.",
    status: "NON_CONFORMING",
    evidence: "Photos zone déchets · août 2026",
    action: "Créer une zone de rétention et formaliser le tri des déchets souillés",
    owner: "Responsable production",
    dueDate: "15 sept. 2026",
    effectiveness: "Non vérifiée",
    resources: "Génie civil interne · 2 hommes-jours",
    completedDate: "—",
    effectivenessCriteria: "Zone de rétention conforme et bordereaux de suivi archivés",
    comment: "Écart majeur relevé lors de la visite terrain du 8 août.",
  },
  {
    id: "eval-4",
    source: "ISO 9001:2015",
    provision: "Clause 8.5.1",
    requirement:
      "Réaliser la production et la prestation de service dans des conditions maîtrisées.",
    status: "CONFORMING",
    evidence: "Instructions de soudage et fiches de contrôle",
    action: "Maintenir la revue annuelle des instructions",
    owner: "Responsable qualité",
    dueDate: "15 janv. 2027",
    effectiveness: "Vérifiée",
    resources: "—",
    completedDate: "20 janv. 2026",
    effectivenessCriteria: "Revue annuelle tracée et instructions à jour",
    comment: "—",
  },
  {
    id: "eval-5",
    source: "ISO 45001:2018",
    provision: "Clause 8.1.2",
    requirement:
      "Éliminer les dangers et réduire les risques pour la santé et la sécurité au travail.",
    status: "NOT_ASSESSED",
    evidence: "Aucune preuve liée",
    action: "Évaluation à réaliser",
    owner: "Non attribué",
    dueDate: "—",
    effectiveness: "Non évaluée",
    resources: "—",
    completedDate: "—",
    effectivenessCriteria: "—",
    comment: "—",
  },
];

/** The register grid mirrors the "EVALUATION REGLEMENTAIRE ET NORMATIVE" block of the XLSX export
 *  column for column, so what a reviewer reads on screen is what lands in the file. The exigence
 *  column and the chevron are structural and stay pinned; everything else can be hidden through the
 *  "Colonnes" picker. */
type EvaluationColumnId =
  | "status"
  | "evidence"
  | "action"
  | "owner"
  | "resources"
  | "dueDate"
  | "completedDate"
  | "effectivenessCriteria"
  | "effectiveness"
  | "comment";

type EvaluationColumn = {
  id: EvaluationColumnId;
  className?: string;
  cell: (evaluation: RegulatoryEvaluation, t: RegulatoryT) => React.ReactNode;
};

function textCell(value: string | undefined): React.ReactNode {
  return <span className="line-clamp-3 block whitespace-pre-line">{value?.trim() || "—"}</span>;
}

const optionalEvaluationColumns: EvaluationColumn[] = [
  {
    id: "status",
    className: "whitespace-nowrap",
    cell: (evaluation, t) => (
      <>
        <EvaluationBadge status={evaluation.status} />
        {evaluation.aiStatus === "RUNNING" && (
          <p className="mt-1 text-[10px] font-medium text-violet-700">{t("lists.aiRunning")}</p>
        )}
      </>
    ),
  },
  { id: "evidence", className: "max-w-52", cell: (evaluation) => textCell(evaluation.evidence) },
  {
    id: "action",
    className: "max-w-64",
    cell: (evaluation, t) => (
      <>
        {textCell(evaluation.action)}
        {(evaluation.additionalActionCount ?? 0) > 0 && (
          <span className="mt-1 block text-[10px] font-medium text-violet-700">
            {t("lists.otherActions", { count: evaluation.additionalActionCount ?? 0 })}
          </span>
        )}
      </>
    ),
  },
  { id: "owner", cell: (evaluation) => textCell(evaluation.owner) },
  { id: "resources", className: "max-w-48", cell: (evaluation) => textCell(evaluation.resources) },
  {
    id: "dueDate",
    className: "whitespace-nowrap",
    cell: (evaluation) => textCell(evaluation.dueDate),
  },
  {
    id: "completedDate",
    className: "whitespace-nowrap",
    cell: (evaluation) => textCell(evaluation.completedDate),
  },
  {
    id: "effectivenessCriteria",
    className: "max-w-56",
    cell: (evaluation) => textCell(evaluation.effectivenessCriteria),
  },
  {
    id: "effectiveness",
    className: "whitespace-nowrap",
    cell: (evaluation) => textCell(evaluation.effectiveness),
  },
  { id: "comment", className: "max-w-64", cell: (evaluation) => textCell(evaluation.comment) },
];

const evaluationStatusStyles: Record<EvaluationStatus, string> = {
  CONFORMING: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PARTIAL: "border-amber-200 bg-amber-50 text-amber-800",
  NON_CONFORMING: "border-rose-200 bg-rose-50 text-rose-700",
  NOT_ASSESSED: "border-slate-200 bg-slate-100 text-slate-600",
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

export function EvaluationBadge({ status }: { status: EvaluationStatus }) {
  const { t } = useTranslation("regulatory");
  return (
    <Badge className={cn("h-6 border px-2.5", evaluationStatusStyles[status])} variant="outline">
      {t(`evaluationStatus.${status}`)}
    </Badge>
  );
}

function DocumentBadge({ status }: { status: DocumentStatus }) {
  const { t } = useTranslation("regulatory");
  return status === "VALIDATED" || status === "APPLICABLE" ? (
    <Badge className="h-6 border border-emerald-200 bg-emerald-50 px-2.5 text-emerald-700">
      <CheckCircle2Icon /> {t(`documentStatus.${status}`)}
    </Badge>
  ) : (
    <Badge className="h-6 border border-amber-200 bg-amber-50 px-2.5 text-amber-800">
      <CircleAlertIcon /> {t("documentStatus.TO_CONFIRM")}
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
  const { t } = useTranslation("regulatory");
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<"ALL" | DocumentKind>("ALL");
  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return items.filter((document) => {
      const matchesFamily = family === "ALL" || document.kind === family;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [document.reference, document.title, document.provisions]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      return matchesFamily && matchesQuery;
    });
  }, [family, items, query]);

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_50px_-38px_rgba(15,23,42,0.35)]">
      <div className="border-b border-slate-100 px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">{t("lists.documentsTitle")}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">{t("lists.documentsBody")}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative min-w-0 sm:w-72">
              <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                aria-label={t("lists.searchText")}
                className="h-10 rounded-xl border-slate-200 bg-slate-50 ps-9"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("lists.searchPlaceholder")}
                value={query}
              />
            </label>
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {(["ALL", "REGULATION", "STANDARD"] as const).map((item) => (
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
                  {item === "ALL" ? t("lists.all") : t(`documentKind.${item}`)}
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
                {t("lists.textStandard")}
              </TableHead>
              <TableHead className="h-11 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {t("lists.articles")}
              </TableHead>
              <TableHead className="h-11 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {t("lists.requirements")}
              </TableHead>
              <TableHead className="h-11 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {t("lists.status")}
              </TableHead>
              <TableHead className="w-16 px-6">
                <span className="sr-only">{t("lists.actions")}</span>
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
                        document.kind === "STANDARD"
                          ? "bg-violet-50 text-violet-700"
                          : "bg-blue-50 text-blue-700",
                      )}
                    >
                      {document.kind === "STANDARD" ? (
                        <BookOpenCheckIcon className="size-4" />
                      ) : (
                        <FileTextIcon className="size-4" />
                      )}
                    </span>
                    <div>
                      <p className="font-semibold text-slate-950">{document.reference}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{document.title}</p>
                      <p className="mt-1.5 text-[11px] text-slate-400">
                        {t(`documentKind.${document.kind}`)} · {document.jurisdiction}
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
                <TableCell className="px-6 py-5 text-end">
                  <Button
                    aria-label={t("lists.view", { reference: document.reference })}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <ChevronRightIcon className="text-slate-400 group-hover:text-violet-700 rtl:rotate-180" />
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
            className="w-full p-4 text-start transition hover:bg-slate-50 sm:p-5"
            key={document.id}
            onClick={() => onOpen(document)}
            type="button"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
                {document.kind === "STANDARD" ? <BookOpenCheckIcon /> : <FileTextIcon />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-950">{document.reference}</p>
                  <DocumentBadge status={document.status} />
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{document.title}</p>
                <p className="mt-3 text-xs leading-5 text-slate-700">{document.provisions}</p>
                <p className="mt-2 text-[11px] font-medium text-violet-700">
                  {t("lists.requirementsIdentified", { count: document.requirements })}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {filteredDocuments.length === 0 && (
        <div className="px-6 py-16 text-center">
          <SearchIcon className="mx-auto size-6 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">{t("lists.noText")}</p>
          <p className="mt-1 text-xs text-slate-400">{t("lists.noTextHint")}</p>
        </div>
      )}

      <footer className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>
          {t("lists.textsShown", { shown: filteredDocuments.length, total: items.length })}
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldCheckIcon className="size-3.5 text-emerald-600" /> {t("lists.sourcesKept")}
        </span>
      </footer>
    </section>
  );
}

export function EvaluationList({
  onOpen,
  items = evaluations,
  summary = {
    total: 36,
    evaluated: 26,
    conforming: 18,
    partial: 5,
    nonConforming: 3,
    aiAssessed: 26,
    humanValidated: 12,
  },
  aiActive = false,
}: {
  onOpen: (evaluation: RegulatoryEvaluation) => void;
  items?: RegulatoryEvaluation[];
  summary?: {
    total: number;
    evaluated: number;
    conforming: number;
    partial: number;
    nonConforming: number;
    aiAssessed?: number;
    humanValidated?: number;
  };
  aiActive?: boolean;
}) {
  const { t } = useTranslation("regulatory");
  const [status, setStatus] = useState<"ALL" | EvaluationStatus>("ALL");
  // Every export column is visible by default — the register is meant to match the XLSX file — and
  // the picker only ever takes columns away.
  const [hiddenColumns, setHiddenColumns] = useState<ReadonlySet<string>>(() => new Set());
  const visibleColumns = optionalEvaluationColumns.filter(
    (column) => !hiddenColumns.has(column.id),
  );
  const filteredEvaluations = items.filter(
    (evaluation) => status === "ALL" || evaluation.status === status,
  );
  const progressPercent =
    summary.total === 0 ? 0 : Math.round((summary.evaluated / summary.total) * 100);
  const aiAssessed = summary.aiAssessed ?? 0;
  const humanValidated = summary.humanValidated ?? 0;
  const aiPercent = summary.total === 0 ? 0 : Math.round((aiAssessed / summary.total) * 100);
  // The headline used to be a fixed "Évaluation en cours", which kept claiming work was running
  // long after the pass had finished.
  const phase = aiActive
    ? t("lists.phaseAi")
    : summary.total > 0 && summary.evaluated === summary.total
      ? t("lists.phaseDone")
      : t("lists.phaseRunning");
  const hint = aiActive ? t("lists.hintAi") : t("lists.hintReview");

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl bg-[#0b1020] p-5 text-white shadow-sm sm:p-6">
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
          <div className="absolute -end-20 -top-24 size-72 rounded-full bg-violet-600/25 blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-violet-300">
              {aiActive ? (
                <LoaderCircleIcon className="size-3.5 animate-spin" />
              ) : (
                <SparklesIcon className="size-3.5" />
              )}{" "}
              {phase}
            </span>
            <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
              {t("lists.evaluated", { evaluated: summary.evaluated, total: summary.total })}
            </h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400 sm:text-sm">{hint}</p>
          </div>
          <div className="relative rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">{t("lists.overallProgress")}</span>
              <span className="font-semibold tabular-nums text-white">{progressPercent} %</span>
            </div>
            <Progress
              className="mt-3 [&_[data-slot=progress-indicator]]:bg-violet-500 [&_[data-slot=progress-track]]:bg-white/10"
              value={progressPercent}
            />
            <div className="mt-3 flex justify-between text-[10px] text-slate-400">
              <span>{t("lists.conforming", { count: summary.conforming })}</span>
              <span>{t("lists.partial", { count: summary.partial })}</span>
              <span>{t("lists.nonConforming", { count: summary.nonConforming })}</span>
            </div>
            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{t("lists.aiPreassessment")}</span>
                <span className="font-semibold tabular-nums text-white">{aiPercent} %</span>
              </div>
              <Progress
                className="mt-3 [&_[data-slot=progress-indicator]]:bg-sky-400 [&_[data-slot=progress-track]]:bg-white/10"
                value={aiPercent}
              />
              <p className="mt-3 text-[10px] text-slate-400">
                {t("lists.aiCounts", { ai: aiAssessed, confirmed: humanValidated })}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_50px_-38px_rgba(15,23,42,0.35)]">
        <div className="border-b border-slate-100 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">{t("data.evaluationTab")}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">{t("lists.evaluationBody")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1">
                <FilterIcon className="ms-2 size-3.5 shrink-0 text-slate-400" />
                {(["ALL", "CONFORMING", "PARTIAL", "NON_CONFORMING", "NOT_ASSESSED"] as const).map(
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
                      {item === "ALL" ? t("lists.allEvaluations") : t(`evaluationStatus.${item}`)}
                    </button>
                  ),
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button className="h-10 rounded-xl bg-white" variant="outline" />}
                >
                  <Columns3Icon /> {t("lists.columnsButton")}
                  {hiddenColumns.size > 0 && (
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                      {visibleColumns.length}/{optionalEvaluationColumns.length}
                    </span>
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-xs text-slate-500">
                      {t("lists.columnsShown")}
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  {optionalEvaluationColumns.map((column) => (
                    <DropdownMenuCheckboxItem
                      checked={!hiddenColumns.has(column.id)}
                      closeOnClick={false}
                      key={column.id}
                      onCheckedChange={(checked) =>
                        setHiddenColumns((current) => {
                          const next = new Set(current);
                          if (checked) next.delete(column.id);
                          else next.add(column.id);
                          return next;
                        })
                      }
                    >
                      {t(`lists.columns.${column.id}`)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div className="hidden xl:block">
          <Table className="min-w-max">
            <TableHeader className="bg-slate-50/80">
              <TableRow className="hover:bg-slate-50/80">
                <TableHead className="h-11 min-w-72 ps-6 pe-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {t("lists.textRequirement")}
                </TableHead>
                {visibleColumns.map((column) => (
                  <TableHead
                    className="h-11 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500"
                    key={column.id}
                  >
                    {t(`lists.columns.${column.id}`)}
                  </TableHead>
                ))}
                <TableHead className="w-14 px-5">
                  <span className="sr-only">{t("lists.details")}</span>
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
                  <TableCell className="min-w-72 max-w-md whitespace-normal py-4 ps-6 pe-3">
                    <p className="text-[11px] font-semibold text-violet-700">
                      {evaluation.source} · {evaluation.provision}
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-700">
                      {evaluation.requirement}
                    </p>
                  </TableCell>
                  {visibleColumns.map((column) => (
                    <TableCell
                      className={cn(
                        "whitespace-normal px-3 py-4 align-top text-xs leading-5 text-slate-600",
                        column.className,
                      )}
                      key={column.id}
                    >
                      {column.cell(evaluation, t)}
                    </TableCell>
                  ))}
                  <TableCell className="px-5 py-4 text-end">
                    <ChevronRightIcon className="size-4 text-slate-300 group-hover:text-violet-700 rtl:rotate-180" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="divide-y divide-slate-100 xl:hidden">
          {filteredEvaluations.map((evaluation) => (
            <button
              className="w-full p-4 text-start transition hover:bg-slate-50 sm:p-5"
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
                {[
                  { label: t("lists.columns.evidence"), value: evaluation.evidence },
                  { label: t("lists.columns.action"), value: evaluation.action },
                  { label: t("lists.columns.owner"), value: evaluation.owner },
                  { label: t("lists.columns.resources"), value: evaluation.resources },
                  { label: t("lists.columns.dueDate"), value: evaluation.dueDate },
                  { label: t("lists.columns.completedDate"), value: evaluation.completedDate },
                  {
                    label: t("lists.columns.effectivenessCriteria"),
                    value: evaluation.effectivenessCriteria,
                  },
                  { label: t("lists.columns.effectiveness"), value: evaluation.effectiveness },
                  { label: t("lists.columns.comment"), value: evaluation.comment },
                ].map((field) => (
                  <div key={field.label}>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">
                      {field.label}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-slate-600">
                      {field.value?.trim() || "—"}
                    </p>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>

        <footer className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-[11px] text-slate-500 sm:px-6">
          <span>{t("lists.requirementsShown", { count: filteredEvaluations.length })}</span>
          <span>
            {t("lists.columnsCount", {
              shown: visibleColumns.length + 1,
              total: optionalEvaluationColumns.length + 1,
            })}
          </span>
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
  const { t } = useTranslation("regulatory");
  const open = Boolean(document || evaluation);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(96vw,600px)]! sm:max-w-[600px]!">
        {document && (
          <>
            <SheetHeader className="border-b border-slate-100 pe-16">
              <div className="mb-2 flex items-center gap-2">
                <Badge className="bg-violet-50 text-violet-700" variant="secondary">
                  {t(`documentKind.${document.kind}`)}
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
                    <BotIcon className="size-4" /> {t("lists.whyProposed")}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-violet-950/80">{document.reason}</p>
                </section>
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {t("lists.articles")}
                  </h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-800">
                    {document.provisions}
                  </p>
                  {document.requirementText && (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {document.requirementText}
                    </p>
                  )}
                  {document.sourceNeedsReview && (
                    <p className="mt-2 text-xs text-amber-700">{t("lists.verifyOfficial")}</p>
                  )}
                </section>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-[11px] text-slate-400">{t("lists.scope")}</p>
                    <p className="mt-1 text-sm font-medium">{document.jurisdiction}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-[11px] text-slate-400">{t("lists.extractedRequirements")}</p>
                    <p className="mt-1 text-sm font-medium">
                      {t("lists.requirementsCount", { count: document.requirements })}
                    </p>
                  </div>
                </div>
                <section className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start gap-3">
                    <LinkIcon className="mt-0.5 size-4 shrink-0 text-slate-400" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800">
                        {t("lists.officialSource")}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{document.source}</p>
                      {document.sourceUrl ? (
                        <a
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-violet-700 underline underline-offset-2"
                          href={document.sourceUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {t("lists.viewSource")}{" "}
                          <ArrowUpRightIcon className="size-3 rtl:-scale-x-100" />
                        </a>
                      ) : document.sourceNeedsReview ? (
                        <p className="mt-2 text-xs text-amber-700">
                          {t("lists.sourceLinkToConfirm")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </section>
              </div>
            </div>
            <SheetFooter className="border-t border-slate-100 bg-slate-50">
              <Button className="h-10 rounded-xl bg-slate-950 hover:bg-slate-800">
                {t("lists.openRequirements")}
              </Button>
              <Button className="h-10 rounded-xl" variant="outline">
                {t("lists.editApplicability")}
              </Button>
            </SheetFooter>
          </>
        )}

        {evaluation && (
          <>
            <SheetHeader className="border-b border-slate-100 pe-16">
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
                    {t("sheet.requirement")}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-800">{evaluation.requirement}</p>
                </section>
                {evaluation.officialSourceText && (
                  <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {t("sheet.traceability")}
                    </p>
                    {evaluation.citation && (
                      <p className="mt-2 text-xs font-semibold text-slate-700">
                        {evaluation.citation}
                      </p>
                    )}
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                      {evaluation.officialSourceText}
                    </p>
                  </section>
                )}
                <section className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                    <FileCheck2Icon className="size-4" /> {t("lists.linkedEvidence")}
                  </div>
                  <p className="mt-2 text-sm text-emerald-950/80">{evaluation.evidence}</p>
                  <Button className="mt-3 bg-white" size="sm" variant="outline">
                    {t("lists.viewEvidence")}
                  </Button>
                </section>
                <section className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <TargetIcon className="size-4 text-violet-600" /> {t("sheet.actionPlan")}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{evaluation.action}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
                    <div>
                      <p className="text-slate-400">{t("sheet.owner")}</p>
                      <p className="mt-1 font-medium text-slate-700">{evaluation.owner}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">{t("sheet.dueDate")}</p>
                      <p className="mt-1 font-medium text-slate-700">{evaluation.dueDate}</p>
                    </div>
                  </div>
                </section>
                <section className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-[11px] text-slate-400">{t("lists.criterion")}</p>
                  <p className="mt-1 text-sm font-medium text-slate-800">
                    {evaluation.effectiveness}
                  </p>
                </section>
              </div>
            </div>
            <SheetFooter className="border-t border-slate-100 bg-slate-50">
              <Button className="h-10 rounded-xl bg-slate-950 hover:bg-slate-800">
                {t("lists.editEvaluation")}
              </Button>
              <Button className="h-10 rounded-xl" variant="outline">
                {t("lists.addEvidence")}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function RegulatoryWatchTestPage() {
  const { t } = useTranslation("regulatory");
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
            {t("prototype.badge")}
          </Badge>
          <a
            className="ms-auto inline-flex items-center gap-2 text-xs font-medium text-slate-500 transition hover:text-slate-950"
            href="/"
          >
            <ArrowLeftIcon className="size-3.5 rtl:rotate-180" /> {t("prototype.back")}
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1540px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="rounded-3xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs leading-5 text-amber-900 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <span className="flex items-start gap-2">
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" /> {t("prototype.demoData")}
          </span>
          <span className="mt-1 block shrink-0 font-semibold sm:mt-0">
            {t("prototype.publicTest")}
          </span>
        </div>

        <div className="mt-7 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <span>Atlas Industrie</span>
              <ChevronRightIcon className="size-3.5 rtl:rotate-180" />
              <span className="text-slate-600">{t("data.title")}</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">
              {t("data.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              {t("prototype.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="h-10 rounded-xl border-slate-200 bg-white"
              onClick={() => setAnalysisState("done")}
              variant="outline"
            >
              <RefreshCwIcon className={cn(analysisState === "done" && "text-emerald-600")} />
              {analysisState === "done" ? t("prototype.refreshed") : t("data.refresh")}
            </Button>
            <Button
              className="h-10 rounded-xl bg-slate-950 px-4 text-white hover:bg-slate-800"
              onClick={() => setExportReady(true)}
            >
              {exportReady ? <CheckCircle2Icon /> : <DownloadIcon />}
              {exportReady ? t("prototype.exportReady") : t("data.export")}
            </Button>
          </div>
        </div>

        <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={FileTextIcon}
            label={t("data.applicableTexts")}
            value="5"
            detail={t("prototype.textsDetail")}
            tone="bg-blue-50 text-blue-700"
          />
          <MetricCard
            icon={ListChecksIcon}
            label={t("data.identifiedRequirements")}
            value="36"
            detail={t("prototype.requirementsDetail")}
            tone="bg-violet-50 text-violet-700"
          />
          <MetricCard
            icon={CheckCircle2Icon}
            label={t("data.complianceRate")}
            value="72 %"
            detail={t("prototype.complianceDetail")}
            tone="bg-emerald-50 text-emerald-700"
          />
          <MetricCard
            icon={CalendarClockIcon}
            label={t("data.openActions")}
            value="4"
            detail={t("prototype.actionsDetail")}
            tone="bg-rose-50 text-rose-700"
          />
        </section>

        <section className="mt-4 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm">
              <ShieldCheckIcon className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-emerald-950">{t("data.basedOnProfile")}</p>
              <p className="mt-0.5 text-xs leading-5 text-emerald-800/70">
                {t("prototype.traceabilityInfo")}
              </p>
            </div>
          </div>
          <button
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-800"
            type="button"
          >
            {t("prototype.viewTraceability")}{" "}
            <ArrowUpRightIcon className="size-3.5 rtl:-scale-x-100" />
          </button>
        </section>

        <Tabs className="mt-6 gap-4" defaultValue="documents">
          <div className="w-full pb-1">
            <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
              <TabsTrigger
                className="h-auto min-h-11 whitespace-normal rounded-xl px-2 py-2 text-center leading-4 data-active:bg-slate-950 data-active:text-white sm:px-5"
                value="documents"
              >
                <FileTextIcon /> {t("lists.documentsTitle")}
                <span className="ms-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 data-[active=true]:bg-white/10">
                  5
                </span>
              </TabsTrigger>
              <TabsTrigger
                className="h-auto min-h-11 whitespace-normal rounded-xl px-2 py-2 text-center leading-4 data-active:bg-slate-950 data-active:text-white sm:px-5"
                value="evaluation"
              >
                <ListChecksIcon /> {t("data.evaluationTab")}
                <span className="ms-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
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
            <Clock3Icon className="size-3.5" /> {t("prototype.lastSync")}
          </span>
          <span>{t("prototype.revisionsKept")}</span>
        </div>
      </main>

      <div className="sr-only" aria-live="polite">
        {analysisState === "done" ? t("prototype.refreshed") : ""}
        {exportReady ? t("prototype.exportReadyAnnounce") : ""}
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
