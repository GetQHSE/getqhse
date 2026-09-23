/**
 * Analysis method of the "Analyse des enjeux" module (SWOT or PESTEL).
 *
 * The method is a project-level, persisted CHOICE. It only affects FUTURE runs:
 * every run keeps the method it was executed with in its own scope/inputs, so
 * historical runs stay readable exactly as they were produced. Runs persisted
 * before this choice existed have no stored method and are labelled
 * "méthodologie historique".
 *
 * Whatever the method, the final effective issues keep the SAME normalized
 * downstream contract consumed by the Risks & Opportunities module:
 *   origin: internal | external
 *   nature: force | faiblesse | opportunite | menace
 */

import type { Language, Localized } from "../../language.js";

export type ContextAnalysisMethod = "swot" | "pestel";

export const DEFAULT_ANALYSIS_METHOD: ContextAnalysisMethod = "swot";

const HISTORICAL_METHOD: Localized = {
  fr: "Méthodologie historique",
  en: "Legacy methodology",
  ar: "منهجية سابقة",
};

export function historicalMethodLabel(language: Language = "fr"): string {
  return HISTORICAL_METHOD[language];
}

export const HISTORICAL_METHOD_LABEL = HISTORICAL_METHOD.fr;

export function isAnalysisMethod(value: unknown): value is ContextAnalysisMethod {
  return value === "swot" || value === "pestel";
}

export function analysisMethodLabel(value: unknown, language: Language = "fr"): string {
  if (value === "swot") return "SWOT";
  if (value === "pestel") return "PESTEL";
  return HISTORICAL_METHOD[language];
}

const METHOD_DESCRIPTIONS: Record<ContextAnalysisMethod, Localized> = {
  swot: {
    fr: "Synthèse globale de votre contexte interne et externe, présentée en Forces, Faiblesses, Opportunités et Menaces.",
    en: "An overall synthesis of your internal and external context, presented as Strengths, Weaknesses, Opportunities and Threats.",
    ar: "خلاصة شاملة لسياقكم الداخلي والخارجي، مقدَّمة في شكل نقاط قوة ونقاط ضعف وفرص وتهديدات.",
  },
  pestel: {
    fr: "L’investigation externe est structurée par dimension : politique, économique, social, technologique, environnemental et légal. Votre contexte interne reste collecté (il fait partie du contexte selon l’ISO).",
    en: "The external investigation is structured by dimension: political, economic, social, technological, environmental and legal. Your internal context is still collected (it is part of the context under ISO).",
    ar: "يُنظَّم البحث الخارجي حسب الأبعاد: السياسي والاقتصادي والاجتماعي والتكنولوجي والبيئي والقانوني. ويظل سياقكم الداخلي مُجمَّعًا (فهو جزء من السياق وفق معيار ISO).",
  },
};

export function analysisMethodOptions(language: Language = "fr"): {
  value: ContextAnalysisMethod;
  title: string;
  description: string;
}[] {
  return (["swot", "pestel"] as const).map((value) => ({
    value,
    title: value.toUpperCase(),
    description: METHOD_DESCRIPTIONS[value][language],
  }));
}

export const ANALYSIS_METHOD_OPTIONS = analysisMethodOptions("fr");

/**
 * PESTEL dimension keys. The AI emits the French `label` of a dimension as a
 * fixed enum value whatever the project language; only display is localized.
 */
export type PestelDimensionKey =
  "politique" | "economique" | "social" | "technologique" | "environnemental" | "legal";

export interface PestelDimension {
  key: PestelDimensionKey;
  label: string;
  helper: string;
  matches: string[];
  reusesRegulatory?: boolean;
}

const PESTEL_DEFINITIONS: (Omit<PestelDimension, "label" | "helper"> & {
  label: Localized;
  helper: Localized;
})[] = [
  {
    key: "politique",
    label: { fr: "Politique", en: "Political", ar: "سياسي" },
    helper: {
      fr: "Décisions publiques, marchés publics, subventions, stabilité opérationnelle.",
      en: "Public decisions, public procurement, subsidies, operational stability.",
      ar: "القرارات العمومية، الصفقات العمومية، الدعم، الاستقرار التشغيلي.",
    },
    matches: ["politique", "political", "gouvernance_publique", "public", "سياسي"],
  },
  {
    key: "economique",
    label: { fr: "Économique", en: "Economic", ar: "اقتصادي" },
    helper: {
      fr: "Marché, coûts, financement, demande, concurrence.",
      en: "Market, costs, financing, demand, competition.",
      ar: "السوق، التكاليف، التمويل، الطلب، المنافسة.",
    },
    matches: [
      "economique",
      "économique",
      "economic",
      "marche",
      "marché",
      "market",
      "concurrentiel",
      "concurrence",
      "competition",
      "financier",
      "financial",
      "approvisionnement",
      "chaine_dapprovisionnement",
      "supply",
      "اقتصادي",
    ],
  },
  {
    key: "social",
    label: { fr: "Social", en: "Social", ar: "اجتماعي" },
    helper: {
      fr: "Démographie, attentes clients, main-d’œuvre et compétences disponibles.",
      en: "Demographics, customer expectations, available workforce and skills.",
      ar: "الديموغرافيا، توقعات العملاء، اليد العاملة والكفاءات المتاحة.",
    },
    matches: [
      "social",
      "societal",
      "sociétal",
      "demographique",
      "démographique",
      "demographic",
      "client",
      "clients",
      "customer",
      "attentes_clients",
      "main_doeuvre",
      "workforce",
      "competences",
      "compétences",
      "skills",
      "emploi",
      "اجتماعي",
    ],
  },
  {
    key: "technologique",
    label: { fr: "Technologique", en: "Technological", ar: "تكنولوجي" },
    helper: {
      fr: "Technologies, outils, numérisation, innovation du secteur.",
      en: "Technologies, tools, digitalisation, innovation in the sector.",
      ar: "التكنولوجيات، الأدوات، الرقمنة، الابتكار في القطاع.",
    },
    matches: [
      "technologique",
      "technological",
      "technique",
      "numerique",
      "numérique",
      "digital",
      "innovation",
      "تكنولوجي",
    ],
  },
  {
    key: "environnemental",
    label: { fr: "Environnemental", en: "Environmental", ar: "بيئي" },
    helper: {
      fr: "Climat, ressources, énergie, contraintes environnementales du secteur.",
      en: "Climate, resources, energy, environmental constraints of the sector.",
      ar: "المناخ، الموارد، الطاقة، القيود البيئية للقطاع.",
    },
    matches: [
      "environnemental",
      "environnement",
      "environmental",
      "climatique",
      "climat",
      "climate",
      "energie",
      "énergie",
      "energy",
      "infrastructures",
      "logistique",
      "بيئي",
    ],
  },
  {
    key: "legal",
    label: { fr: "Légal", en: "Legal", ar: "قانوني" },
    helper: {
      fr: "Cette dimension n’est pas recherchée ici : elle réutilise votre veille réglementaire établie.",
      en: "This dimension is not researched here: it reuses your established regulatory watch.",
      ar: "لا يتم البحث في هذا البعد هنا: فهو يعيد استخدام اليقظة التنظيمية التي أعددتموها.",
    },
    matches: [
      "legal",
      "légal",
      "juridique",
      "reglementaire",
      "réglementaire",
      "regulatory",
      "normatif",
      "قانوني",
    ],
    reusesRegulatory: true,
  },
];

/** PESTEL dimensions. "Légal" is never re-searched: it reuses the regulatory watch. */
export function pestelDimensions(language: Language = "fr"): PestelDimension[] {
  return PESTEL_DEFINITIONS.map((dimension) => ({
    ...dimension,
    label: dimension.label[language],
    helper: dimension.helper[language],
  }));
}

export const PESTEL_DIMENSIONS: PestelDimension[] = pestelDimensions("fr");

/** The French labels the AI must emit verbatim as the PESTEL `dimension` enum. */
export const PESTEL_DIMENSION_ENUM = PESTEL_DIMENSIONS.map((dimension) => dimension.label) as [
  string,
  ...string[],
];

/** Best-effort mapping of a factor/issue category onto a PESTEL dimension. */
export function pestelDimensionKey(
  categoryKey: string | null,
  categoryLabel?: string | null,
): string {
  const haystack = `${categoryKey ?? ""} ${categoryLabel ?? ""}`.toLowerCase().replace(/\s+/g, "_");
  for (const dimension of PESTEL_DEFINITIONS) {
    if (dimension.matches.some((token) => haystack.includes(token))) return dimension.key;
  }
  return "autre";
}

export type SwotQuadrantKey = "force" | "faiblesse" | "opportunite" | "menace";

const SWOT_DEFINITIONS: { key: SwotQuadrantKey; label: Localized; helper: Localized }[] = [
  {
    key: "force",
    label: { fr: "Forces", en: "Strengths", ar: "نقاط القوة" },
    helper: {
      fr: "Contexte interne favorable",
      en: "Favourable internal context",
      ar: "سياق داخلي ملائم",
    },
  },
  {
    key: "faiblesse",
    label: { fr: "Faiblesses", en: "Weaknesses", ar: "نقاط الضعف" },
    helper: {
      fr: "Contexte interne à renforcer",
      en: "Internal context to strengthen",
      ar: "سياق داخلي يحتاج إلى تعزيز",
    },
  },
  {
    key: "opportunite",
    label: { fr: "Opportunités", en: "Opportunities", ar: "الفرص" },
    helper: {
      fr: "Contexte externe favorable",
      en: "Favourable external context",
      ar: "سياق خارجي ملائم",
    },
  },
  {
    key: "menace",
    label: { fr: "Menaces", en: "Threats", ar: "التهديدات" },
    helper: {
      fr: "Contexte externe défavorable",
      en: "Unfavourable external context",
      ar: "سياق خارجي غير ملائم",
    },
  },
];

export function swotQuadrants(
  language: Language = "fr",
): { key: SwotQuadrantKey; label: string; helper: string }[] {
  return SWOT_DEFINITIONS.map((quadrant) => ({
    key: quadrant.key,
    label: quadrant.label[language],
    helper: quadrant.helper[language],
  }));
}

export const SWOT_QUADRANTS = swotQuadrants("fr");
