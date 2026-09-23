/**
 * Canonical, read-only snapshot of "Analyse des enjeux" (ISO 9001 §4.1).
 *
 * Every export format is built from THIS single snapshot, so they always
 * carry the same figures. Professional content only: no prompts, no model
 * diagnostics, no internal identifiers, no raw source URLs (publisher names
 * only). Ported from the foundation's context/export/document.ts onto this
 * platform's ContextIssue/ContextExternalFactor contracts.
 */
import type {
  ContextAnalysisMethod,
  ContextExternalFactor,
  ContextIssue,
  SupportedLanguage,
} from "@qhse/contracts";
import { INTL_LOCALES, smqContext } from "@qhse/domain";

import { CONTEXT_EXPORT_LABELS } from "./context-export-labels.js";

const { pestelDimensionKey, pestelDimensions, swotQuadrants } = smqContext;

type ExportLabels = (typeof CONTEXT_EXPORT_LABELS)[SupportedLanguage];

/** The domain labels speak "swot"/"pestel"; the API speaks "SWOT"/"PESTEL". */
function analysisMethodLabel(method: ContextAnalysisMethod, language: SupportedLanguage): string {
  return smqContext.analysisMethodLabel(method.toLowerCase(), language);
}

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
  language: SupportedLanguage;
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

function formatDate(value: Date | string | null | undefined, language: SupportedLanguage) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(INTL_LOCALES[language]);
}

function toDocumentIssue(issue: ContextIssue, labels: ExportLabels): ContextDocumentIssue {
  const nature = issue.nature && issue.nature in labels.nature ? issue.nature : null;
  return {
    title: issue.title,
    description: issue.description ?? "—",
    originLabel: labels.origin[issue.origin],
    natureLabel: nature
      ? labels.nature[nature as keyof ExportLabels["nature"]]
      : (issue.nature ?? "—"),
    categoryLabel: issue.categoryLabel || "—",
    statusLabel: labels.status[issue.reviewStatus],
    impactQuality: issue.impactQuality || "—",
    impactCustomer: issue.impactCustomerSatisfaction || "—",
    impactOverall: issue.impactOverall || "—",
    priorityLabel: issue.selectedPriority ? labels.priority : "—",
    addedManually: issue.sourceKind === "MANUAL",
    corrected: issue.reviewStatus === "MODIFIED" || issue.corrections.length > 0,
  };
}

function buildSwot(issues: ContextIssue[], language: SupportedLanguage): ContextDocumentGroup[] {
  const labels = CONTEXT_EXPORT_LABELS[language];
  return swotQuadrants(language)
    .map((quadrant) => ({
      label: quadrant.label,
      helper: quadrant.helper,
      issues: issues
        .filter((issue) => issue.nature === quadrant.key)
        .map((issue) => toDocumentIssue(issue, labels)),
    }))
    .filter((group) => group.issues.length > 0);
}

function buildPestel(issues: ContextIssue[], language: SupportedLanguage): ContextDocumentGroup[] {
  const labels = CONTEXT_EXPORT_LABELS[language];
  const external = issues.filter((issue) => issue.origin === "EXTERNAL");
  return [
    ...pestelDimensions(language).map((dimension) => ({
      label: dimension.label,
      helper: dimension.helper,
      issues: external
        .filter(
          (issue) => pestelDimensionKey(issue.categoryKey, issue.categoryLabel) === dimension.key,
        )
        .map((issue) => toDocumentIssue(issue, labels)),
    })),
    {
      label: labels.otherDimensions,
      helper: labels.otherDimensionsHelp,
      issues: external
        .filter((issue) => pestelDimensionKey(issue.categoryKey, issue.categoryLabel) === "autre")
        .map((issue) => toDocumentIssue(issue, labels)),
    },
  ].filter((group) => group.issues.length > 0);
}

export function buildContextDocument(input: {
  language: SupportedLanguage;
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
  const { language } = input;
  const labels = CONTEXT_EXPORT_LABELS[language];
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

  const swot = performed.includes("SWOT") ? buildSwot(input.issues, language) : null;
  const pestel = performed.includes("PESTEL") ? buildPestel(input.issues, language) : null;

  const retained = input.issues.filter(
    (issue) => issue.reviewStatus === "VALIDATED" || issue.reviewStatus === "MODIFIED",
  );

  return {
    language,
    title: labels.title,
    organizationName: input.organizationName,
    projectName: input.projectName,
    isoStandard: input.isoStandard,
    generatedOn: formatDate(new Date(), language) ?? "—",
    methodLabel: input.methodExplicit
      ? performed.map((method) => analysisMethodLabel(method, language)).join(" + ")
      : labels.byDefault(analysisMethodLabel(input.method, language)),
    methodSummary: input.method === "PESTEL" ? labels.pestelSummary : labels.swotSummary,
    analysisDate: formatDate(input.analysisDate, language),
    internalIssues: input.issues
      .filter((issue) => issue.origin === "INTERNAL")
      .map((issue) => toDocumentIssue(issue, labels)),
    factors,
    swot: swot && swot.length > 0 ? swot : null,
    pestel: pestel && pestel.length > 0 ? pestel : null,
    synthesis: input.issues.map((issue) => toDocumentIssue(issue, labels)),
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

export function contextDocumentFileName(doc: ContextDocument, extension: "xlsx"): string {
  const slug = doc.projectName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48);
  const stamp = new Date().toISOString().slice(0, 10);
  return `${CONTEXT_EXPORT_LABELS[doc.language].fileName}-${slug || "project"}-${stamp}.${extension}`;
}
