/**
 * Canonical, read-only snapshot of "Analyse des enjeux" (ISO 9001 §4.1).
 *
 * Every export format is built from THIS single snapshot, so they always
 * carry the same figures. Professional content only: no prompts, no model
 * diagnostics, no internal identifiers, no raw source URLs (publisher names
 * only). Ported from the foundation's context/export/document.ts onto this
 * platform's ContextIssue/ContextExternalFactor contracts.
 */
import type { ContextAnalysisMethod, ContextExternalFactor, ContextIssue } from "@qhse/contracts";
import { smqContext } from "@qhse/domain";

const {
  HISTORICAL_METHOD_LABEL,
  PESTEL_DIMENSIONS,
  SWOT_QUADRANTS,
  analysisMethodLabel,
  pestelDimensionKey,
} = smqContext;

export interface ContextDocumentIssue {
  title: string;
  description: string;
  originLabel: string;
  natureLabel: string;
  categoryLabel: string;
  statusLabel: string;
  impactQuality: string;
  impactCustomer: string;
  impactOverall: string;
  priorityLabel: string;
  addedManually: boolean;
  corrected: boolean;
}

export interface ContextDocumentFactor {
  title: string;
  description: string;
  categoryLabel: string;
  relevance: string;
  /** Publisher names only — never raw URLs. */
  publishers: string[];
}

export interface ContextDocumentGroup {
  label: string;
  helper: string;
  issues: ContextDocumentIssue[];
}

export interface ContextDocument {
  title: string;
  organizationName: string;
  projectName: string;
  isoStandard: string;
  generatedOn: string;
  methodLabel: string;
  methodSummary: string;
  analysisDate: string | null;
  internalIssues: ContextDocumentIssue[];
  factors: ContextDocumentFactor[];
  swot: ContextDocumentGroup[] | null;
  pestel: ContextDocumentGroup[] | null;
  synthesis: ContextDocumentIssue[];
  summary: {
    issues: number;
    retained: number;
    notRetained: number;
    pending: number;
    manual: number;
    corrected: number;
    factors: number;
    sources: number;
  };
}

const ORIGIN_LABELS: Record<string, string> = {
  INTERNAL: "Contexte interne",
  EXTERNAL: "Contexte externe",
};

const NATURE_LABELS: Record<string, string> = {
  force: "Force",
  faiblesse: "Faiblesse",
  opportunite: "Opportunité",
  menace: "Menace",
};

const STATUS_LABELS: Record<string, string> = {
  VALIDATED: "Retenu",
  MODIFIED: "Retenu avec corrections",
  NOT_RETAINED: "Non retenu",
  PENDING: "À examiner",
};

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("fr-FR");
}

function toDocumentIssue(issue: ContextIssue): ContextDocumentIssue {
  return {
    title: issue.title,
    description: issue.description ?? "—",
    originLabel: ORIGIN_LABELS[issue.origin] ?? issue.origin,
    natureLabel: (issue.nature ? NATURE_LABELS[issue.nature] : null) ?? issue.nature ?? "—",
    categoryLabel: issue.categoryLabel || "—",
    statusLabel: STATUS_LABELS[issue.reviewStatus] ?? issue.reviewStatus,
    impactQuality: issue.impactQuality || "—",
    impactCustomer: issue.impactCustomerSatisfaction || "—",
    impactOverall: issue.impactOverall || "—",
    priorityLabel: issue.selectedPriority ? "Prioritaire" : "—",
    addedManually: issue.sourceKind === "MANUAL",
    corrected: issue.reviewStatus === "MODIFIED" || issue.corrections.length > 0,
  };
}

function buildSwot(issues: ContextIssue[]): ContextDocumentGroup[] {
  return SWOT_QUADRANTS.map((quadrant) => ({
    label: quadrant.label,
    helper: quadrant.helper,
    issues: issues.filter((issue) => issue.nature === quadrant.key).map(toDocumentIssue),
  })).filter((group) => group.issues.length > 0);
}

function buildPestel(issues: ContextIssue[]): ContextDocumentGroup[] {
  const external = issues.filter((issue) => issue.origin === "EXTERNAL");
  return [
    ...PESTEL_DIMENSIONS.map((dimension) => ({
      label: dimension.label,
      helper: dimension.helper,
      issues: external
        .filter(
          (issue) => pestelDimensionKey(issue.categoryKey, issue.categoryLabel) === dimension.key,
        )
        .map(toDocumentIssue),
    })),
    {
      label: "Autres dimensions",
      helper: "Enjeux externes non rattachés à une dimension PESTEL.",
      issues: external
        .filter((issue) => pestelDimensionKey(issue.categoryKey, issue.categoryLabel) === "autre")
        .map(toDocumentIssue),
    },
  ].filter((group) => group.issues.length > 0);
}

export function buildContextDocument(input: {
  organizationName: string;
  projectName: string;
  isoStandard: string;
  method: ContextAnalysisMethod;
  methodExplicit: boolean;
  methodsPerformed?: ContextAnalysisMethod[];
  analysisDate: string | null;
  factors: ContextExternalFactor[];
  issues: ContextIssue[];
}): ContextDocument {
  const performed =
    input.methodsPerformed && input.methodsPerformed.length > 0
      ? input.methodsPerformed
      : [input.method];

  const factors: ContextDocumentFactor[] = input.factors.map((factor) => ({
    title: factor.title,
    description: factor.description ?? "—",
    categoryLabel: factor.categoryLabel || "—",
    relevance: factor.relevanceToCompany || "—",
    publishers: [
      ...new Set(
        factor.sources
          .map((source) => (source.publisher ?? "").trim())
          .filter((label) => label.length > 0),
      ),
    ],
  }));

  const swot = performed.includes("SWOT") ? buildSwot(input.issues) : null;
  const pestel = performed.includes("PESTEL") ? buildPestel(input.issues) : null;

  const retained = input.issues.filter(
    (issue) => issue.reviewStatus === "VALIDATED" || issue.reviewStatus === "MODIFIED",
  );

  return {
    title: "Analyse des enjeux — contexte de l'organisation",
    organizationName: input.organizationName,
    projectName: input.projectName,
    isoStandard: input.isoStandard,
    generatedOn: new Date().toLocaleDateString("fr-FR"),
    methodLabel: input.methodExplicit
      ? performed.map((method) => analysisMethodLabel(method)).join(" + ")
      : `${analysisMethodLabel(input.method)} (par défaut)`,
    methodSummary:
      input.method === "PESTEL"
        ? "Investigation externe structurée par dimension PESTEL ; la dimension légale reprend la veille réglementaire."
        : "Synthèse globale du contexte interne et externe en Forces, Faiblesses, Opportunités et Menaces.",
    analysisDate: formatDate(input.analysisDate),
    internalIssues: input.issues
      .filter((issue) => issue.origin === "INTERNAL")
      .map(toDocumentIssue),
    factors,
    swot: swot && swot.length > 0 ? swot : null,
    pestel: pestel && pestel.length > 0 ? pestel : null,
    synthesis: input.issues.map(toDocumentIssue),
    summary: {
      issues: input.issues.length,
      retained: retained.length,
      notRetained: input.issues.filter((issue) => issue.reviewStatus === "NOT_RETAINED").length,
      pending: input.issues.filter((issue) => issue.reviewStatus === "PENDING").length,
      manual: input.issues.filter((issue) => issue.sourceKind === "MANUAL").length,
      corrected: input.issues.filter((issue) => issue.reviewStatus === "MODIFIED").length,
      factors: input.factors.length,
      sources: input.factors.reduce((total, factor) => total + factor.sources.length, 0),
    },
  };
}

export const HISTORICAL_METHOD_NOTICE = `${HISTORICAL_METHOD_LABEL} : cette analyse a été réalisée avant l'enregistrement d'une méthode.`;

export function contextDocumentFileName(doc: ContextDocument, extension: "xlsx"): string {
  const slug = doc.projectName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48);
  const stamp = new Date().toISOString().slice(0, 10);
  return `analyse-enjeux-${slug || "projet"}-${stamp}.${extension}`;
}
