import { computeCriticality, powerInterestStrategy } from "./methodology.js";
import { isRetained } from "./workflow.js";

export const PIP_EXPORT_LABELS = {
  fr: {
    sources: {
      normative: "Exigence normative",
      legal_regulatory: "Obligation légale ou réglementaire",
      contractual: "Engagement contractuel",
      customer: "Exigence client",
      organizational: "Exigence interne",
      stakeholder_expectation: "Attente de la partie intéressée",
      ai_recommendation: "Recommandation IA GetQhse",
    },
    title: "Registre des parties intéressées pertinentes",
    internal: "Interne",
    external: "Externe",
    headers: [
      "Partie intéressée",
      "Catégorie",
      "Type",
      "Besoins / attentes",
      "Exigences SMQ",
      "Dispositions opérationnelles",
      "Services concernés",
      "Pouvoir",
      "Intérêt",
      "Stratégie",
      "Criticité /9",
      "Surveillance",
      "Fréquence",
      "Sources",
    ],
    strategies: {
      key_actor: "Gérer attentivement / Acteur clé",
      keep_satisfied: "Garder satisfait",
      keep_informed: "Tenir informé",
      monitor: "Surveiller / Effort proportionné",
    },
  },
  en: {
    sources: {
      normative: "Normative requirement",
      legal_regulatory: "Legal or regulatory obligation",
      contractual: "Contractual commitment",
      customer: "Customer requirement",
      organizational: "Internal requirement",
      stakeholder_expectation: "Interested party expectation",
      ai_recommendation: "GetQhse AI recommendation",
    },
    title: "Relevant interested parties register",
    internal: "Internal",
    external: "External",
    headers: [
      "Interested party",
      "Category",
      "Type",
      "Needs / expectations",
      "QMS requirements",
      "Operational dispositions",
      "Functions concerned",
      "Power",
      "Interest",
      "Strategy",
      "Criticality /9",
      "Monitoring",
      "Frequency",
      "Sources",
    ],
    strategies: {
      key_actor: "Manage closely / Key actor",
      keep_satisfied: "Keep satisfied",
      keep_informed: "Keep informed",
      monitor: "Monitor / Proportionate effort",
    },
  },
  ar: {
    sources: {
      normative: "متطلب معياري",
      legal_regulatory: "التزام قانوني أو تنظيمي",
      contractual: "التزام تعاقدي",
      customer: "متطلب العميل",
      organizational: "متطلب داخلي",
      stakeholder_expectation: "توقع الطرف المعني",
      ai_recommendation: "توصية الذكاء الاصطناعي من GetQhse",
    },
    title: "سجل الأطراف المعنية ذات الصلة",
    internal: "داخلي",
    external: "خارجي",
    headers: [
      "الطرف المعني",
      "الفئة",
      "النوع",
      "الاحتياجات والتوقعات",
      "متطلبات نظام الجودة",
      "التدابير التشغيلية",
      "الوظائف المعنية",
      "القوة",
      "الاهتمام",
      "الاستراتيجية",
      "الأهمية /9",
      "المراقبة",
      "التكرار",
      "المصادر",
    ],
    strategies: {
      key_actor: "إدارة دقيقة / طرف رئيسي",
      keep_satisfied: "الحفاظ على الرضا",
      keep_informed: "الإبقاء على اطلاع",
      monitor: "مراقبة بجهد متناسب",
    },
  },
} as const;
type Review = "PENDING" | "VALIDATED" | "MODIFIED" | "NOT_RETAINED";
type ExportParty = {
  reviewStatus: Review;
  content: { name: string; category: string; scope: string };
  requirements: {
    reviewStatus: Review;
    content: {
      kind: string;
      text: string;
      sourceType: keyof (typeof PIP_EXPORT_LABELS)["en"]["sources"];
      sourceLabel: string | null;
      sourceUrl: string | null;
    };
    services: string[];
  }[];
  evaluation: {
    content: {
      power: number | null;
      interest: number | null;
      impact: number | null;
      requirementLevel: number | null;
      monitoringMethod: string;
      monitoringFrequency: string;
    };
  } | null;
};
/** One representation consumed by the screen and every export format. */
export function pipRegisterRows(
  parties: ExportParty[],
  method: string,
  language: "fr" | "en" | "ar",
) {
  const labels = PIP_EXPORT_LABELS[language];
  return parties.filter(isRetained).map((party) => {
    const items = party.requirements.filter(isRetained);
    const e = party.evaluation?.content;
    const strategy = powerInterestStrategy(e?.power, e?.interest);
    const texts = (kind: string) =>
      items
        .filter((r) => r.content.kind === kind)
        .map((r) => r.content.text)
        .join("\n");
    return [
      party.content.name,
      party.content.category,
      party.content.scope === "internal" ? labels.internal : labels.external,
      texts("need"),
      texts("qms_requirement"),
      texts("operational_disposition"),
      [...new Set(items.flatMap((r) => r.services))].join(" · "),
      method !== "criticality" ? String(e?.power ?? "—") : "—",
      method !== "criticality" ? String(e?.interest ?? "—") : "—",
      method !== "criticality" && strategy ? labels.strategies[strategy] : "—",
      method !== "power_interest"
        ? String(computeCriticality(e?.impact, e?.requirementLevel) ?? "—")
        : "—",
      e?.monitoringMethod ?? "—",
      e?.monitoringFrequency ?? "—",
      [
        ...new Set(
          items
            .map((r) =>
              [labels.sources[r.content.sourceType], r.content.sourceLabel, r.content.sourceUrl]
                .filter(Boolean)
                .join(" · "),
            )
            .filter(Boolean),
        ),
      ].join("\n"),
    ];
  });
}
