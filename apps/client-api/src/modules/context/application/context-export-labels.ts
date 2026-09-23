/**
 * Labels of the context register export. The register is a project
 * deliverable, so it is written in the project language.
 */
import type { SupportedLanguage } from "@qhse/contracts";

type Labels = {
  title: string;
  origin: Record<"INTERNAL" | "EXTERNAL", string>;
  nature: Record<"force" | "faiblesse" | "opportunite" | "menace", string>;
  status: Record<"VALIDATED" | "MODIFIED" | "NOT_RETAINED" | "PENDING", string>;
  priority: string;
  otherDimensions: string;
  otherDimensionsHelp: string;
  byDefault: (method: string) => string;
  pestelSummary: string;
  swotSummary: string;
  fileName: string;
  yes: string;
  no: string;
  sheets: { summary: string; register: string; factors: string };
  columns: {
    field: string;
    value: string;
    title: string;
    description: string;
    origin: string;
    nature: string;
    category: string;
    status: string;
    impactQuality: string;
    impactCustomer: string;
    impactOverall: string;
    priority: string;
    manual: string;
    corrected: string;
    relevance: string;
    sources: string;
  };
  summary: {
    organization: string;
    project: string;
    standard: string;
    method: string;
    methodSummary: string;
    analysisDate: string;
    generatedOn: string;
    issues: string;
    retained: string;
    notRetained: string;
    pending: string;
    manual: string;
    corrected: string;
    factors: string;
    sources: string;
  };
};

export const CONTEXT_EXPORT_LABELS: Record<SupportedLanguage, Labels> = {
  fr: {
    title: "Analyse des enjeux — contexte de l’organisation",
    origin: { INTERNAL: "Contexte interne", EXTERNAL: "Contexte externe" },
    nature: {
      force: "Force",
      faiblesse: "Faiblesse",
      opportunite: "Opportunité",
      menace: "Menace",
    },
    status: {
      VALIDATED: "Retenu",
      MODIFIED: "Retenu avec corrections",
      NOT_RETAINED: "Non retenu",
      PENDING: "À examiner",
    },
    priority: "Prioritaire",
    otherDimensions: "Autres dimensions",
    otherDimensionsHelp: "Enjeux externes non rattachés à une dimension PESTEL.",
    byDefault: (method) => `${method} (par défaut)`,
    pestelSummary:
      "Investigation externe structurée par dimension PESTEL ; la dimension légale reprend la veille réglementaire.",
    swotSummary:
      "Synthèse globale du contexte interne et externe en Forces, Faiblesses, Opportunités et Menaces.",
    fileName: "analyse-enjeux",
    yes: "Oui",
    no: "Non",
    sheets: { summary: "Synthèse", register: "Registre des enjeux", factors: "Facteurs externes" },
    columns: {
      field: "Champ",
      value: "Valeur",
      title: "Intitulé",
      description: "Description",
      origin: "Origine",
      nature: "Nature",
      category: "Catégorie",
      status: "Statut",
      impactQuality: "Impact qualité",
      impactCustomer: "Impact satisfaction client",
      impactOverall: "Impact global",
      priority: "Priorité",
      manual: "Ajout manuel",
      corrected: "Corrigé",
      relevance: "Lien avec l’organisation",
      sources: "Sources",
    },
    summary: {
      organization: "Organisation",
      project: "Projet",
      standard: "Référentiel",
      method: "Méthode",
      methodSummary: "Résumé de la méthode",
      analysisDate: "Date de l’analyse",
      generatedOn: "Généré le",
      issues: "Enjeux au total",
      retained: "Retenus",
      notRetained: "Non retenus",
      pending: "À examiner",
      manual: "Ajoutés manuellement",
      corrected: "Corrigés par un expert",
      factors: "Facteurs externes documentés",
      sources: "Sources externes citées",
    },
  },
  en: {
    title: "Context analysis — context of the organisation",
    origin: { INTERNAL: "Internal context", EXTERNAL: "External context" },
    nature: {
      force: "Strength",
      faiblesse: "Weakness",
      opportunite: "Opportunity",
      menace: "Threat",
    },
    status: {
      VALIDATED: "Retained",
      MODIFIED: "Retained with corrections",
      NOT_RETAINED: "Not retained",
      PENDING: "To review",
    },
    priority: "Priority",
    otherDimensions: "Other dimensions",
    otherDimensionsHelp: "External issues not linked to a PESTEL dimension.",
    byDefault: (method) => `${method} (default)`,
    pestelSummary:
      "External investigation structured by PESTEL dimension; the legal dimension reuses the regulatory watch.",
    swotSummary:
      "Overall synthesis of the internal and external context as Strengths, Weaknesses, Opportunities and Threats.",
    fileName: "context-analysis",
    yes: "Yes",
    no: "No",
    sheets: { summary: "Summary", register: "Issue register", factors: "External factors" },
    columns: {
      field: "Field",
      value: "Value",
      title: "Title",
      description: "Description",
      origin: "Origin",
      nature: "Type",
      category: "Category",
      status: "Status",
      impactQuality: "Quality impact",
      impactCustomer: "Customer satisfaction impact",
      impactOverall: "Overall impact",
      priority: "Priority",
      manual: "Added manually",
      corrected: "Corrected",
      relevance: "Link with the organisation",
      sources: "Sources",
    },
    summary: {
      organization: "Organisation",
      project: "Project",
      standard: "Standard",
      method: "Method",
      methodSummary: "Method summary",
      analysisDate: "Analysis date",
      generatedOn: "Generated on",
      issues: "Total issues",
      retained: "Retained",
      notRetained: "Not retained",
      pending: "To review",
      manual: "Added manually",
      corrected: "Corrected by an expert",
      factors: "Documented external factors",
      sources: "External sources cited",
    },
  },
  ar: {
    title: "تحليل الرهانات — سياق المؤسسة",
    origin: { INTERNAL: "السياق الداخلي", EXTERNAL: "السياق الخارجي" },
    nature: { force: "نقطة قوة", faiblesse: "نقطة ضعف", opportunite: "فرصة", menace: "تهديد" },
    status: {
      VALIDATED: "معتمَد",
      MODIFIED: "معتمَد مع تصحيحات",
      NOT_RETAINED: "غير معتمَد",
      PENDING: "قيد الدراسة",
    },
    priority: "ذو أولوية",
    otherDimensions: "أبعاد أخرى",
    otherDimensionsHelp: "رهانات خارجية غير مرتبطة ببعد من أبعاد PESTEL.",
    byDefault: (method) => `${method} (افتراضيًا)`,
    pestelSummary:
      "بحث خارجي مُهيكَل حسب أبعاد PESTEL؛ ويعيد البعد القانوني استخدام اليقظة التنظيمية.",
    swotSummary: "خلاصة شاملة للسياق الداخلي والخارجي في شكل نقاط قوة ونقاط ضعف وفرص وتهديدات.",
    fileName: "تحليل-الرهانات",
    yes: "نعم",
    no: "لا",
    sheets: { summary: "الخلاصة", register: "سجل الرهانات", factors: "العوامل الخارجية" },
    columns: {
      field: "الحقل",
      value: "القيمة",
      title: "العنوان",
      description: "الوصف",
      origin: "المصدر",
      nature: "الطبيعة",
      category: "الفئة",
      status: "الحالة",
      impactQuality: "الأثر على الجودة",
      impactCustomer: "الأثر على رضا العملاء",
      impactOverall: "الأثر الإجمالي",
      priority: "الأولوية",
      manual: "إضافة يدوية",
      corrected: "مصحَّح",
      relevance: "الصلة بالمؤسسة",
      sources: "المصادر",
    },
    summary: {
      organization: "المؤسسة",
      project: "المشروع",
      standard: "المرجع",
      method: "المنهجية",
      methodSummary: "ملخص المنهجية",
      analysisDate: "تاريخ التحليل",
      generatedOn: "تاريخ التوليد",
      issues: "مجموع الرهانات",
      retained: "المعتمَدة",
      notRetained: "غير المعتمَدة",
      pending: "قيد الدراسة",
      manual: "المضافة يدويًا",
      corrected: "التي صحّحها خبير",
      factors: "العوامل الخارجية الموثَّقة",
      sources: "المصادر الخارجية المذكورة",
    },
  },
};
