export type RequirementAssessment = {
  requirementId: string;
  applicable: boolean;
  result: "CONFORMING" | "PARTIAL" | "NON_CONFORMING" | "NOT_ASSESSED";
  weight?: number;
};

export type ComplianceScore = {
  score: number | null;
  earnedWeight: number;
  possibleWeight: number;
  assessedCount: number;
};

const resultFactor: Record<RequirementAssessment["result"], number> = {
  CONFORMING: 1,
  PARTIAL: 0.5,
  NON_CONFORMING: 0,
  NOT_ASSESSED: 0,
};

export function calculateComplianceScore(
  assessments: readonly RequirementAssessment[],
): ComplianceScore {
  const assessed = assessments.filter((item) => item.applicable && item.result !== "NOT_ASSESSED");
  const possibleWeight = assessed.reduce((sum, item) => sum + (item.weight ?? 1), 0);
  const earnedWeight = assessed.reduce(
    (sum, item) => sum + (item.weight ?? 1) * resultFactor[item.result],
    0,
  );

  return {
    score: possibleWeight === 0 ? null : Math.round((earnedWeight / possibleWeight) * 10_000) / 100,
    earnedWeight,
    possibleWeight,
    assessedCount: assessed.length,
  };
}

export type ApplicabilityContext = {
  activities: readonly string[];
  excludedActivities?: readonly string[];
  siteTags?: readonly string[];
};

export function isRequirementApplicable(
  requiredActivities: readonly string[],
  context: ApplicabilityContext,
): boolean {
  if (requiredActivities.length === 0) return true;
  const excluded = new Set(context.excludedActivities ?? []);
  return requiredActivities.some(
    (activity) => context.activities.includes(activity) && !excluded.has(activity),
  );
}

export type AuditStatus =
  "DRAFT" | "PLANNED" | "IN_PROGRESS" | "IN_REVIEW" | "COMPLETED" | "CANCELLED";

const transitions: Readonly<Record<AuditStatus, readonly AuditStatus[]>> = {
  DRAFT: ["PLANNED", "CANCELLED"],
  PLANNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["IN_REVIEW", "CANCELLED"],
  IN_REVIEW: ["IN_PROGRESS", "COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionAudit(from: AuditStatus, to: AuditStatus): boolean {
  return transitions[from].includes(to);
}

export function assertAuditTransition(from: AuditStatus, to: AuditStatus): void {
  if (!canTransitionAudit(from, to)) {
    throw new Error(`Invalid audit status transition: ${from} -> ${to}`);
  }
}

export type FindingSeverity = "OBSERVATION" | "MINOR" | "MAJOR" | "CRITICAL";

export function classifyFindingSeverity(input: {
  legalBreach: boolean;
  immediateDanger: boolean;
  systemicFailure: boolean;
  isolatedFailure: boolean;
}): FindingSeverity {
  if (input.immediateDanger || input.legalBreach) return "CRITICAL";
  if (input.systemicFailure) return "MAJOR";
  if (input.isolatedFailure) return "MINOR";
  return "OBSERVATION";
}

const deadlineDays: Readonly<Record<FindingSeverity, number>> = {
  CRITICAL: 1,
  MAJOR: 14,
  MINOR: 30,
  OBSERVATION: 60,
};

export function calculateCorrectiveActionDeadline(severity: FindingSeverity, openedAt: Date): Date {
  const result = new Date(openedAt);
  result.setUTCDate(result.getUTCDate() + deadlineDays[severity]);
  return result;
}
