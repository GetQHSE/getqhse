import { profileQuestionByKey, profileQuestions, type ProfileSection } from "@qhse/profile";

/**
 * Canonical digest for "Analyse des enjeux" (ISO 9001 §4.1), handed to every
 * model call of steps 2 and 3. Same layout as the foundation's
 * buildAnalysisDigest: facts only, no interpretation.
 */

export type ContextDigestInput = {
  project: {
    name: string;
    entityType: string;
    description: string | null;
    standardCode: string;
    countryCode: string;
    organizationName: string;
    activities: string[];
  };
  /** Latest profile snapshot `data.fields` (key → validated value). */
  profileFields: Record<string, unknown>;
  internalInputs: { sectionKey: string; questionLabel: string; answerText: string }[];
  registerEntries: {
    citationLabel: string;
    sourceTitle: string | null;
    sourceReference: string | null;
    applicabilityRationale: string;
  }[];
};

const PROFILE_SECTION_LABELS: Record<ProfileSection, string> = {
  IDENTITY_ACTIVITY: "Identité et activité",
  SCOPE_GEOGRAPHY: "Périmètre et géographie",
  OPERATIONS_RESOURCES: "Opérations et ressources",
  EXTERNAL_CONTEXT: "Contexte externe",
  INTERESTED_PARTIES: "Parties intéressées",
  STRATEGY_OBJECTIVES: "Stratégie et objectifs",
};

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Snapshot fields that carry a validated answer. */
export function validatedProfileAnswers(fields: Record<string, unknown>): [string, unknown][] {
  return Object.entries(fields).filter(
    ([key, value]) => key !== "project.logoUrl" && hasValue(value),
  );
}

export function contextScopeCountries(input: ContextDigestInput): string[] {
  const codes = input.profileFields["scope.operatingCountries"];
  const list = Array.isArray(codes) && codes.length > 0 ? codes : [input.project.countryCode];
  return [...new Set(list.filter((code): code is string => typeof code === "string"))].map(
    countryName,
  );
}

export function contextActivitySummary(input: ContextDigestInput): string | null {
  if (input.project.activities.length > 0) return input.project.activities.join(", ");
  const sector = input.profileFields["organization.primarySector"] as
    { label?: string } | undefined;
  return sector?.label?.trim() || null;
}

export function buildContextDigest(input: ContextDigestInput): string {
  const lines: string[] = [
    "== IDENTITÉ DE L'ORGANISATION ==",
    `Entité / projet : ${input.project.name}`,
    `Organisation : ${input.project.organizationName || "non précisée"}`,
    `Type d'entité : ${input.project.entityType || "non précisé"}`,
    `Activités : ${contextActivitySummary(input) ?? "non précisées"}`,
    `Description : ${input.project.description ?? "non précisée"}`,
    `Référentiel : ${input.project.standardCode} (référentiel normatif, pas une législation)`,
    `Pays / juridictions identifiés : ${contextScopeCountries(input).join(", ") || "non identifiés"}`,
    "",
    "== PROFIL VALIDÉ (faits d'entreprise) ==",
  ];

  const answers = new Map(validatedProfileAnswers(input.profileFields));
  const sections = [...new Set(profileQuestions.map((question) => question.section))];
  for (const section of sections) {
    const questions = profileQuestions.filter(
      (question) => question.section === section && answers.has(question.key),
    );
    if (questions.length === 0) continue;
    lines.push("", `## ${PROFILE_SECTION_LABELS[section]}`);
    for (const question of questions) {
      lines.push(`- [${question.key}] ${question.prompt.fr}`);
      lines.push(`  Réponse validée : ${formatValue(answers.get(question.key))}`);
    }
  }
  const unknownKeys = [...answers.keys()].filter((key) => !profileQuestionByKey.has(key as never));
  for (const key of unknownKeys) {
    lines.push(`- [${key}]`, `  Réponse validée : ${formatValue(answers.get(key))}`);
  }

  lines.push("", "== CONTEXTE INTERNE DÉCLARÉ (étape 1) ==");
  if (input.internalInputs.length === 0) {
    lines.push("Aucune information interne renseignée.");
  } else {
    const bySection = new Map<string, typeof input.internalInputs>();
    for (const item of input.internalInputs) {
      const bucket = bySection.get(item.sectionKey) ?? [];
      bucket.push(item);
      bySection.set(item.sectionKey, bucket);
    }
    for (const [section, items] of bySection) {
      lines.push("", `## ${section}`);
      for (const item of items) {
        lines.push(`- ${item.questionLabel}`, `  ${item.answerText.trim()}`);
      }
    }
  }

  lines.push("", "== CONTEXTE RÉGLEMENTAIRE DÉJÀ ÉTABLI (module veille) ==");
  if (input.registerEntries.length === 0) {
    lines.push(
      "Aucune veille réglementaire terminée : la dimension légale ne doit PAS être recherchée ici.",
    );
  } else {
    const jurisdiction = countryName(input.project.countryCode);
    for (const entry of input.registerEntries.slice(0, 60)) {
      const title = entry.sourceTitle ?? entry.citationLabel;
      lines.push(
        `- ${title}${entry.sourceReference ? ` (${entry.sourceReference})` : ""} — ${jurisdiction} — décision IA : applicable`,
      );
      if (entry.applicabilityRationale) lines.push(`  Motif : ${entry.applicabilityRationale}`);
    }
  }

  return lines.join("\n");
}
