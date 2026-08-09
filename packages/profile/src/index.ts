import { z } from "zod";

export const PROFILE_SCHEMA_VERSION = 1;

export const profileFieldKeys = [
  "project.name",
  "project.logoUrl",
  "organization.mission",
  "organization.offerings",
  "organization.offeringRanges",
  "market.primaryCustomerSegments",
  "organization.employeeCount",
  "operations.keyProcesses",
  "scope.certificationScope",
  "operations.externalProviders",
  "organization.afterSalesServices",
  "scope.operatingReach",
  "scope.operatingCountries",
  "organization.primarySector",
  "regulatory.implementedFrameworks",
  "operations.orderToDeliveryFlow",
  "resources.keyResources",
  "resources.criticalCompetencies",
  "operations.majorDifficulties",
  "context.externalFactors",
  "regulatory.knownRequirements",
  "context.sectorChallenges",
  "stakeholders.customerNeeds",
  "stakeholders.otherParties",
  "stakeholders.expectations",
  "strategy.annualObjectives",
  "strategy.values",
  "strategy.differentiators",
  "strategy.iso9001Motivation",
  "context.marketChallenges",
  "context.growthOpportunities",
  "regulatory.criticalRisks",
  "operations.recurrentIssues",
] as const;

export const profileFieldKeySchema = z.enum(profileFieldKeys);
export type ProfileFieldKey = z.infer<typeof profileFieldKeySchema>;

export const profileFieldStatusSchema = z.enum([
  "UNANSWERED",
  "ANSWERED",
  "NEEDS_CLARIFICATION",
  "NOT_APPLICABLE",
  "CONFIRMED",
]);
export type ProfileFieldStatus = z.infer<typeof profileFieldStatusSchema>;

export const profileFieldSourceSchema = z.enum([
  "ONBOARDING",
  "USER_CHAT",
  "USER_EDIT",
  "AI_INFERRED",
  "IMPORTED",
  "SYSTEM",
]);
export type ProfileFieldSource = z.infer<typeof profileFieldSourceSchema>;

export const profileStatusSchema = z.enum(["IN_PROGRESS", "REVIEW_REQUIRED", "COMPLETE", "STALE"]);
export type ProfileStatus = z.infer<typeof profileStatusSchema>;

const text = (max = 4_000) => z.string().trim().min(1).max(max);
const textList = (maxItems = 50) => z.array(text(500)).min(1).max(maxItems);
const optionalText = (max = 2_000) => text(max).optional();
const countryCode = z.string().regex(/^[A-Z]{2}$/);

const yesNoList = (itemName: string) =>
  z
    .object({
      has: z.boolean(),
      items: z.array(text(1_000)).max(50),
    })
    .superRefine((value, context) => {
      if (value.has && value.items.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["items"],
          message: `At least one ${itemName} is required when has is true`,
        });
      }
    });

const profileValueSchemas = {
  "project.name": text(160),
  "project.logoUrl": z.url().nullable(),
  "organization.mission": text(),
  "organization.offerings": z
    .array(
      z.object({
        name: text(200),
        type: z.enum(["PRODUCT", "SERVICE"]),
        range: optionalText(200),
        description: optionalText(),
      }),
    )
    .min(1)
    .max(100),
  "organization.offeringRanges": z
    .object({ hasMultiple: z.boolean(), ranges: z.array(text(200)).max(50) })
    .superRefine((value, context) => {
      if (value.hasMultiple && value.ranges.length < 2) {
        context.addIssue({
          code: "custom",
          path: ["ranges"],
          message: "At least two ranges are required when hasMultiple is true",
        });
      }
    }),
  "market.primaryCustomerSegments": textList(),
  "organization.employeeCount": z.number().int().positive().max(10_000_000),
  "operations.keyProcesses": z
    .array(
      z.object({
        name: text(200),
        description: optionalText(),
        sequence: z.number().int().positive().optional(),
        classification: z.enum(["MANAGEMENT", "CORE", "SUPPORT"]).optional(),
      }),
    )
    .min(1)
    .max(100),
  "scope.certificationScope": text(),
  "operations.externalProviders": z
    .object({
      usesExternalProviders: z.boolean(),
      providers: z
        .array(
          z.object({
            name: optionalText(200),
            category: z.enum(["SUPPLIER", "SUBCONTRACTOR"]),
            suppliedProductOrService: text(500),
            outsourcedProcess: optionalText(500),
            critical: z.boolean(),
          }),
        )
        .max(100),
    })
    .superRefine((value, context) => {
      if (value.usesExternalProviders && value.providers.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["providers"],
          message: "Provider details are required when external providers are used",
        });
      }
    }),
  "organization.afterSalesServices": z
    .object({
      hasAfterSalesServices: z.boolean(),
      services: z.array(z.object({ name: text(200), description: optionalText() })).max(50),
    })
    .superRefine((value, context) => {
      if (value.hasAfterSalesServices && value.services.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["services"],
          message: "Service details are required when after-sales services exist",
        });
      }
    }),
  "scope.operatingReach": z.enum(["LOCAL", "NATIONAL", "INTERNATIONAL"]),
  "scope.operatingCountries": z.array(countryCode).min(1).max(100),
  "organization.primarySector": z.object({ label: text(200), code: optionalText(50) }),
  "regulatory.implementedFrameworks": z
    .object({
      hasImplementedFrameworks: z.boolean(),
      frameworks: z
        .array(
          z.object({
            type: z.enum(["STANDARD", "REGULATION", "CERTIFICATION", "OTHER"]),
            reference: optionalText(200),
            name: text(500),
            status: z.enum(["IMPLEMENTED", "PARTIAL", "PLANNED", "UNKNOWN"]),
            scope: optionalText(),
          }),
        )
        .max(100),
    })
    .superRefine((value, context) => {
      if (value.hasImplementedFrameworks && value.frameworks.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["frameworks"],
          message: "Framework details are required when frameworks are implemented",
        });
      }
    }),
  "operations.orderToDeliveryFlow": text(10_000),
  "resources.keyResources": z
    .array(
      z.object({
        category: z.enum(["HUMAN", "EQUIPMENT", "SOFTWARE", "INFRASTRUCTURE", "SUPPLIER", "OTHER"]),
        name: text(300),
        critical: z.boolean(),
      }),
    )
    .min(1)
    .max(100),
  "resources.criticalCompetencies": textList(),
  "operations.majorDifficulties": yesNoList("difficulty"),
  "context.externalFactors": z
    .array(
      z.object({
        category: z.enum([
          "LEGAL",
          "ECONOMIC",
          "COMPETITION",
          "TECHNOLOGY",
          "ENVIRONMENT",
          "SOCIAL",
          "OTHER",
        ]),
        description: text(1_000),
      }),
    )
    .min(1)
    .max(100),
  "regulatory.knownRequirements": z
    .object({
      hasKnownRequirements: z.boolean(),
      requirements: z
        .array(
          z.object({ name: text(500), reference: optionalText(200), description: optionalText() }),
        )
        .max(100),
    })
    .superRefine((value, context) => {
      if (value.hasKnownRequirements && value.requirements.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["requirements"],
          message: "Requirement details are required when known requirements exist",
        });
      }
    }),
  "context.sectorChallenges": textList(),
  "stakeholders.customerNeeds": z
    .array(z.object({ customerType: text(300), needs: textList(20) }))
    .min(1)
    .max(50),
  "stakeholders.otherParties": z
    .array(
      z.object({
        category: z.enum([
          "EMPLOYEE",
          "SUPPLIER",
          "SUBCONTRACTOR",
          "AUTHORITY",
          "BANK",
          "PARTNER",
          "OWNER",
          "COMMUNITY",
          "OTHER",
        ]),
        name: optionalText(300),
      }),
    )
    .min(1)
    .max(100),
  "stakeholders.expectations": z
    .array(z.object({ party: text(300), expectations: textList(30) }))
    .min(1)
    .max(100),
  "strategy.annualObjectives": z
    .array(
      z.object({
        description: text(1_000),
        target: optionalText(500),
        dueDate: z.iso.date().optional(),
        owner: optionalText(300),
      }),
    )
    .min(1)
    .max(10),
  "strategy.values": textList(20),
  "strategy.differentiators": textList(20),
  "strategy.iso9001Motivation": text(),
  "context.marketChallenges": textList(),
  "context.growthOpportunities": textList(),
  "regulatory.criticalRisks": textList(),
  "operations.recurrentIssues": z
    .object({
      hasRecurrentIssues: z.boolean(),
      issues: z
        .array(
          z.object({
            description: text(1_000),
            frequency: optionalText(200),
            impact: optionalText(1_000),
          }),
        )
        .max(100),
    })
    .superRefine((value, context) => {
      if (value.hasRecurrentIssues && value.issues.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["issues"],
          message: "Issue details are required when recurrent issues exist",
        });
      }
    }),
} satisfies Record<ProfileFieldKey, z.ZodType>;

export type ProfileSection =
  | "IDENTITY_ACTIVITY"
  | "SCOPE_GEOGRAPHY"
  | "OPERATIONS_RESOURCES"
  | "EXTERNAL_CONTEXT"
  | "INTERESTED_PARTIES"
  | "STRATEGY_OBJECTIVES";

export type ProfileQuestion = {
  key: ProfileFieldKey;
  section: ProfileSection;
  prompt: { fr: string; ar?: string };
  required: boolean;
  regulatoryCritical: boolean;
  allowNotApplicable: boolean;
};

const arabicPrompts: Record<ProfileFieldKey, string> = {
  "project.name": "ما اسم مؤسستكم؟",
  "project.logoUrl": "هل ترغبون في إضافة شعار مؤسستكم؟",
  "organization.mission": "ما المهمة الرئيسية لمؤسستكم؟",
  "organization.offerings": "ما المنتجات أو الخدمات التي تقدمونها؟",
  "organization.offeringRanges": "هل لديكم عدة فئات من المنتجات أو الخدمات؟",
  "market.primaryCustomerSegments": "ما فئات العملاء التي تبيعون لها بشكل رئيسي؟",
  "organization.employeeCount": "كم يبلغ عدد العاملين في مؤسستكم تقريباً؟",
  "operations.keyProcesses": "ما العمليات أو المراحل الرئيسية اللازمة لتقديم منتجاتكم أو خدماتكم؟",
  "scope.certificationScope": "ما النطاق الذي ترغبون في تغطيته بشهادة ISO 9001؟",
  "operations.externalProviders": "هل تستعينون بمقاولين من الباطن أو موردين خارجيين لبعض الأنشطة؟",
  "organization.afterSalesServices": "هل تقدمون خدمات ما بعد البيع أو الصيانة؟",
  "scope.operatingReach": "هل أنشطتكم محلية أم وطنية أم دولية؟",
  "scope.operatingCountries": "في أي بلدان تمارسون أنشطتكم؟",
  "organization.primarySector": "ما قطاع نشاطكم الرئيسي؟",
  "regulatory.implementedFrameworks": "هل سبق أن طبقتم معايير أو متطلبات تنظيمية معينة؟",
  "operations.orderToDeliveryFlow": "كيف تمر الطلبية من طلب العميل إلى التسليم؟",
  "resources.keyResources": "ما الموارد الرئيسية التي تعتمد عليها مؤسستكم للعمل؟",
  "resources.criticalCompetencies": "ما الكفاءات الأساسية الضرورية لنشاطكم؟",
  "operations.majorDifficulties": "هل واجهتم صعوبات كبيرة في سير العمل؟",
  "context.externalFactors": "ما العوامل الخارجية التي قد تؤثر في نشاطكم؟",
  "regulatory.knownRequirements": "هل تعرفون متطلبات قانونية أو معيارية محددة يجب احترامها؟",
  "context.sectorChallenges": "ما التحديات الحالية في قطاع نشاطكم؟",
  "stakeholders.customerNeeds": "من هم عملاؤكم النموذجيون وما أهم احتياجاتهم؟",
  "stakeholders.otherParties": "من هم أهم الأطراف المعنية الأخرى بالنسبة لمؤسستكم؟",
  "stakeholders.expectations": "ما الذي تتوقعه هذه الأطراف المعنية من مؤسستكم؟",
  "strategy.annualObjectives": "ما أهم ثلاثة أو أربعة أهداف لمؤسستكم خلال هذه السنة؟",
  "strategy.values": "ما القيم التي توجه قراراتكم؟",
  "strategy.differentiators": "ما الذي يميزكم عن منافسيكم؟",
  "strategy.iso9001Motivation": "لماذا ترغبون في اعتماد نهج ISO 9001؟",
  "context.marketChallenges": "ما أبرز التحديات التي تواجهونها في السوق؟",
  "context.growthOpportunities": "ما فرص النمو التي حددتموها؟",
  "regulatory.criticalRisks": "ما المخاطر القانونية أو التنظيمية التي تعتبرونها حرجة؟",
  "operations.recurrentIssues": "هل لديكم حوادث أو حالات عدم مطابقة متكررة في عملياتكم؟",
};

const question = (
  key: ProfileFieldKey,
  section: ProfileSection,
  fr: string,
  options: {
    required?: boolean;
    regulatoryCritical?: boolean;
    allowNotApplicable?: boolean;
  } = {},
): ProfileQuestion => ({
  key,
  section,
  prompt: { fr, ar: arabicPrompts[key] },
  required: options.required ?? true,
  regulatoryCritical: options.regulatoryCritical ?? false,
  allowNotApplicable: options.allowNotApplicable ?? false,
});

export const profileQuestions: readonly ProfileQuestion[] = [
  question("project.name", "IDENTITY_ACTIVITY", "Quel est le nom de votre entreprise ?"),
  question(
    "project.logoUrl",
    "IDENTITY_ACTIVITY",
    "Souhaitez-vous ajouter le logo de votre entreprise ?",
    {
      required: false,
      allowNotApplicable: true,
    },
  ),
  question(
    "organization.mission",
    "IDENTITY_ACTIVITY",
    "Quelle est la mission principale de votre entreprise ?",
  ),
  question(
    "organization.offerings",
    "IDENTITY_ACTIVITY",
    "Quels produits ou services proposez-vous ?",
    {
      regulatoryCritical: true,
    },
  ),
  question(
    "organization.offeringRanges",
    "IDENTITY_ACTIVITY",
    "Avez-vous plusieurs gammes de produits ou services ?",
  ),
  question(
    "market.primaryCustomerSegments",
    "IDENTITY_ACTIVITY",
    "À qui vendez-vous principalement ?",
  ),
  question(
    "organization.employeeCount",
    "IDENTITY_ACTIVITY",
    "Combien de salariés compte approximativement votre entreprise ?",
    {
      regulatoryCritical: true,
    },
  ),
  question(
    "operations.keyProcesses",
    "IDENTITY_ACTIVITY",
    "Quels sont les processus ou étapes clés nécessaires à la réalisation de vos produits ou services ?",
    {
      regulatoryCritical: true,
    },
  ),
  question(
    "scope.certificationScope",
    "SCOPE_GEOGRAPHY",
    "Quel périmètre souhaitez-vous couvrir par la certification ISO 9001 ?",
    {
      regulatoryCritical: true,
    },
  ),
  question(
    "operations.externalProviders",
    "SCOPE_GEOGRAPHY",
    "Utilisez-vous des sous-traitants ou fournisseurs externes pour certaines activités ?",
    {
      regulatoryCritical: true,
    },
  ),
  question(
    "organization.afterSalesServices",
    "SCOPE_GEOGRAPHY",
    "Proposez-vous des services après-vente ou de maintenance ?",
  ),
  question(
    "scope.operatingReach",
    "SCOPE_GEOGRAPHY",
    "Vos activités sont-elles locales, nationales ou internationales ?",
    {
      regulatoryCritical: true,
    },
  ),
  question(
    "scope.operatingCountries",
    "SCOPE_GEOGRAPHY",
    "Dans quels pays exercez-vous vos activités ?",
    {
      regulatoryCritical: true,
    },
  ),
  question(
    "organization.primarySector",
    "SCOPE_GEOGRAPHY",
    "Quel est votre secteur d’activité principal ?",
    {
      regulatoryCritical: true,
    },
  ),
  question(
    "regulatory.implementedFrameworks",
    "SCOPE_GEOGRAPHY",
    "Avez-vous déjà mis en place des normes ou réglementations particulières ?",
    {
      regulatoryCritical: true,
    },
  ),
  question(
    "operations.orderToDeliveryFlow",
    "OPERATIONS_RESOURCES",
    "Comment se déroule une commande, de la demande du client jusqu’à la livraison ?",
  ),
  question(
    "resources.keyResources",
    "OPERATIONS_RESOURCES",
    "Quelles sont les ressources clés qui vous permettent de fonctionner ?",
  ),
  question(
    "resources.criticalCompetencies",
    "OPERATIONS_RESOURCES",
    "Quelles compétences sont indispensables dans votre activité ?",
  ),
  question(
    "operations.majorDifficulties",
    "OPERATIONS_RESOURCES",
    "Avez-vous déjà rencontré des difficultés majeures dans votre fonctionnement ?",
  ),
  question(
    "context.externalFactors",
    "EXTERNAL_CONTEXT",
    "Quels facteurs externes peuvent affecter votre activité ?",
  ),
  question(
    "regulatory.knownRequirements",
    "EXTERNAL_CONTEXT",
    "Connaissez-vous des exigences légales ou normatives spécifiques que vous devez respecter ?",
    {
      regulatoryCritical: true,
    },
  ),
  question(
    "context.sectorChallenges",
    "EXTERNAL_CONTEXT",
    "Quels sont les défis actuels de votre secteur d’activité ?",
  ),
  question(
    "stakeholders.customerNeeds",
    "INTERESTED_PARTIES",
    "Qui sont vos clients types et que recherchent-ils principalement ?",
    {
      regulatoryCritical: true,
    },
  ),
  question(
    "stakeholders.otherParties",
    "INTERESTED_PARTIES",
    "Quels sont vos autres interlocuteurs ou parties intéressées importants ?",
    {
      regulatoryCritical: true,
    },
  ),
  question(
    "stakeholders.expectations",
    "INTERESTED_PARTIES",
    "Qu’attendent ces parties intéressées de votre entreprise ?",
  ),
  question(
    "strategy.annualObjectives",
    "STRATEGY_OBJECTIVES",
    "Quels sont les trois ou quatre principaux objectifs de votre entreprise cette année ?",
  ),
  question("strategy.values", "STRATEGY_OBJECTIVES", "Quelles valeurs guident vos décisions ?"),
  question(
    "strategy.differentiators",
    "STRATEGY_OBJECTIVES",
    "Qu’est-ce qui vous différencie de vos concurrents ?",
  ),
  question(
    "strategy.iso9001Motivation",
    "STRATEGY_OBJECTIVES",
    "Pourquoi souhaitez-vous vous engager dans une démarche ISO 9001 ?",
  ),
  question(
    "context.marketChallenges",
    "EXTERNAL_CONTEXT",
    "Quels sont les principaux défis que vous rencontrez dans votre marché ?",
  ),
  question(
    "context.growthOpportunities",
    "EXTERNAL_CONTEXT",
    "Quelles opportunités de croissance identifiez-vous ?",
  ),
  question(
    "regulatory.criticalRisks",
    "EXTERNAL_CONTEXT",
    "Quels risques juridiques ou réglementaires jugez-vous critiques ?",
    {
      regulatoryCritical: true,
    },
  ),
  question(
    "operations.recurrentIssues",
    "OPERATIONS_RESOURCES",
    "Avez-vous des incidents ou non-conformités récurrents dans vos processus ?",
  ),
];

export const profileQuestionByKey = new Map(profileQuestions.map((item) => [item.key, item]));

export function validateProfileFieldValue(key: ProfileFieldKey, value: unknown) {
  return profileValueSchemas[key].safeParse(value);
}

export type ProfileFieldState = {
  key: ProfileFieldKey;
  value: unknown;
  status: ProfileFieldStatus;
};

function isAnswered(field: ProfileFieldState | undefined): boolean {
  if (!field) return false;
  if (field.status === "NOT_APPLICABLE") return true;
  if (!(["ANSWERED", "CONFIRMED"] as ProfileFieldStatus[]).includes(field.status)) return false;
  return validateProfileFieldValue(field.key, field.value).success;
}

export type ProfileCompletion = {
  answeredRequired: number;
  totalRequired: number;
  completenessPercent: number;
  answeredRegulatory: number;
  totalRegulatory: number;
  regulatoryReadiness: number;
  missingRequiredKeys: ProfileFieldKey[];
  missingRegulatoryKeys: ProfileFieldKey[];
};

export function calculateProfileCompletion(
  fields: readonly ProfileFieldState[],
): ProfileCompletion {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const required = profileQuestions.filter((item) => item.required);
  const regulatory = profileQuestions.filter((item) => item.regulatoryCritical);
  const missingRequiredKeys = required
    .filter((item) => !isAnswered(byKey.get(item.key)))
    .map((item) => item.key);
  const missingRegulatoryKeys = regulatory
    .filter((item) => !isAnswered(byKey.get(item.key)))
    .map((item) => item.key);
  const answeredRequired = required.length - missingRequiredKeys.length;
  const answeredRegulatory = regulatory.length - missingRegulatoryKeys.length;
  return {
    answeredRequired,
    totalRequired: required.length,
    completenessPercent: Math.round((answeredRequired / required.length) * 100),
    answeredRegulatory,
    totalRegulatory: regulatory.length,
    regulatoryReadiness: Math.round((answeredRegulatory / regulatory.length) * 100),
    missingRequiredKeys,
    missingRegulatoryKeys,
  };
}

export function getNextProfileQuestion(
  fields: readonly ProfileFieldState[],
  language: "fr" | "ar" = "fr",
) {
  const missing = new Set(calculateProfileCompletion(fields).missingRequiredKeys);
  const next = profileQuestions.find((item) => missing.has(item.key));
  if (!next) return null;
  return {
    key: next.key,
    section: next.section,
    prompt: next.prompt[language] ?? next.prompt.fr,
    required: next.required,
    regulatoryCritical: next.regulatoryCritical,
    allowNotApplicable: next.allowNotApplicable,
  };
}

export const profileToolAnswerSchema = z.object({
  key: profileFieldKeySchema,
  valueJson: z.string().min(1).max(30_000),
  confidence: z.number().min(0).max(1).default(1),
});

export const profileToolInputSchema = z.object({
  answers: z.array(profileToolAnswerSchema).min(1).max(20),
});

export type ProfileToolAnswer = z.infer<typeof profileToolAnswerSchema>;

export function parseProfileToolAnswer(answer: ProfileToolAnswer) {
  let value: unknown;
  try {
    value = JSON.parse(answer.valueJson) as unknown;
  } catch {
    return { success: false as const, error: "valueJson must contain valid JSON" };
  }
  const result = validateProfileFieldValue(answer.key, value);
  if (!result.success) {
    return {
      success: false as const,
      error: result.error.issues.map((issue) => issue.message).join("; "),
    };
  }
  return {
    success: true as const,
    key: answer.key,
    value: result.data,
    confidence: answer.confidence,
  };
}
