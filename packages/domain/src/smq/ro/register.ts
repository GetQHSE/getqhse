import { isRetainedRo, roScore, type WorkflowItem } from "./workflow.js";
export const RO_EXPORT_LABELS = {
  fr: {
    title: "Registre des risques et opportunités",
    risk: "Risque",
    opportunity: "Opportunité",
    context_issue: "Enjeux",
    pip_requirement: "PIP",
    manual: "Ajout utilisateur",
    existing: "Maîtrises existantes",
    none: "Aucune maîtrise déclarée",
    headers: [
      "Branche",
      "Source",
      "Partie intéressée",
      "Type",
      "Risque / opportunité",
      "Cotation /25",
      "Priorité",
      "Maîtrises existantes",
      "Action",
      "Objectif",
      "Processus",
      "Responsable",
      "Budget",
      "Ressources",
      "Date prévue",
      "Date de réalisation",
      "État",
      "Avancement %",
      "Critère d’efficacité",
      "Date de mesure prévue",
      "Date de revue",
      "Résultat",
      "Valeur mesurée",
    ],
  },
  en: {
    title: "Risks and opportunities register",
    risk: "Risk",
    opportunity: "Opportunity",
    context_issue: "Context issues",
    pip_requirement: "Interested parties",
    manual: "User addition",
    existing: "Existing controls",
    none: "No controls declared",
    headers: [
      "Branch",
      "Source",
      "Interested party",
      "Type",
      "Risk / opportunity",
      "Rating /25",
      "Priority",
      "Existing controls",
      "Action",
      "Objective",
      "Process",
      "Owner",
      "Budget",
      "Resources",
      "Planned date",
      "Actual date",
      "Status",
      "Progress %",
      "Effectiveness criterion",
      "Planned review date",
      "Review date",
      "Result",
      "Measured value",
    ],
  },
  ar: {
    title: "سجل المخاطر والفرص",
    risk: "خطر",
    opportunity: "فرصة",
    context_issue: "القضايا",
    pip_requirement: "الأطراف المعنية",
    manual: "إضافة المستخدم",
    existing: "ضوابط قائمة",
    none: "لم يتم إعلان ضوابط",
    headers: [
      "المسار",
      "المصدر",
      "الطرف المعني",
      "النوع",
      "الخطر أو الفرصة",
      "التقييم /25",
      "الأولوية",
      "الضوابط القائمة",
      "الإجراء",
      "الهدف",
      "العملية",
      "المسؤول",
      "الميزانية",
      "الموارد",
      "التاريخ المخطط",
      "تاريخ الإنجاز",
      "الحالة",
      "التقدم %",
      "معيار الفعالية",
      "تاريخ القياس المخطط",
      "تاريخ المراجعة",
      "النتيجة",
      "القيمة المقاسة",
    ],
  },
} as const;
export const RO_EVENT_LABELS = {
  fr: {
    todo: "À faire",
    in_progress: "En cours",
    completed: "Terminée",
    cancelled: "Annulée",
    effective: "Efficace",
    partially_effective: "Partiellement efficace",
    ineffective: "Inefficace",
  },
  en: {
    todo: "To do",
    in_progress: "In progress",
    completed: "Completed",
    cancelled: "Cancelled",
    effective: "Effective",
    partially_effective: "Partially effective",
    ineffective: "Ineffective",
  },
  ar: {
    todo: "لم يبدأ",
    in_progress: "قيد التنفيذ",
    completed: "مكتمل",
    cancelled: "ملغى",
    effective: "فعال",
    partially_effective: "فعال جزئيا",
    ineffective: "غير فعال",
  },
} as const;
type RegisterItem = Omit<WorkflowItem, "actions"> & {
  source: {
    branch: "context_issue" | "pip_requirement";
    title: string;
    description: string;
    partyName: string | null;
  } | null;
  effective: WorkflowItem["effective"] & {
    content: { type: "risk" | "opportunity"; title: string };
  };
  actions: (WorkflowItem["actions"][number] & {
    content: {
      title: string;
      objective: string;
      process: string;
      owner: string;
      budget: string;
      resources: string;
      criterion: string;
      effectivenessDate: string;
    };
    progress: {
      status: "todo" | "in_progress" | "completed" | "cancelled";
      actualDate: string | null;
      percent: number;
    } | null;
    effectiveness: {
      date: string;
      result: "effective" | "partially_effective" | "ineffective";
      measuredValue: string;
    }[];
  })[];
};
export function roRegisterRows(items: RegisterItem[], language: "fr" | "en" | "ar") {
  const l = RO_EXPORT_LABELS[language],
    events = RO_EVENT_LABELS[language];
  return items.filter(isRetainedRo).flatMap((i) => {
    const actions = i.actions.filter(isRetainedRo);
    const base = [
      i.source ? l[i.source.branch] : l.manual,
      i.source?.branch === "pip_requirement" ? i.source.description : (i.source?.title ?? "—"),
      i.source?.partyName ?? "—",
      l[i.effective.content.type],
      i.effective.content.title,
      String(roScore(i) ?? "—"),
      i.effective.rating?.priority ?? "—",
      i.effective.controlsState === "existing" ? i.effective.controls.join(" · ") : l.none,
    ];
    if (!actions.length) return [[...base, ...Array<string>(15).fill("—")]];
    return actions.map((a) => {
      const review = a.effectiveness[0];
      return [
        ...base,
        a.content.title,
        a.content.objective,
        a.content.process,
        a.content.owner,
        a.content.budget,
        a.content.resources,
        a.content.plannedDate,
        a.progress?.actualDate ?? "—",
        events[a.progress?.status ?? "todo"],
        String(a.progress?.percent ?? 0),
        a.content.criterion,
        a.content.effectivenessDate,
        review?.date ?? "—",
        review ? events[review.result] : "—",
        review?.measuredValue ?? "—",
      ];
    });
  });
}
