import {
  buildContextDigest,
  toOutputLanguage,
  validatedProfileAnswers,
  type ContextDigestInput,
} from "@qhse/ai";
import type { DatabaseClient } from "@qhse/database";
import { projectCountryCodes } from "@qhse/domain";

/**
 * Canonical material for steps 2 and 3 of "Analyse des enjeux" — the
 * platform equivalent of the foundation's assembleCanonicalAnalysisContext.
 * Step 1 counts as done only once the human clicked "Continuer" (status
 * "completed"), exactly like the foundation.
 */
export async function loadContextMaterial(database: DatabaseClient, projectId: string) {
  const project = await database.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      organization: true,
      activities: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      profile: { include: { snapshots: { orderBy: { sequence: "desc" }, take: 1 } } },
      contextSettings: true,
      regulatoryWatch: true,
    },
  });

  const inputRows = await database.contextInternalInput.findMany({ where: { projectId } });
  const internalInputs = inputRows.filter((row) => row.answerText.trim());
  const internalCompleted =
    internalInputs.length > 0 && inputRows.some((row) => row.status === "completed");

  const registerEntries = project.regulatoryWatch?.currentBaselineId
    ? await database.regulatoryRegisterEntry.findMany({
        where: { baselineId: project.regulatoryWatch.currentBaselineId },
        orderBy: { orderIndex: "asc" },
        take: 200,
      })
    : [];

  const snapshotData = (project.profile?.snapshots[0]?.data ?? {}) as {
    fields?: Record<string, unknown>;
  };
  const digestInput: ContextDigestInput = {
    project: {
      name: project.name,
      entityType: project.entityType,
      description: project.description,
      standardCode: project.standardCode,
      countryCode: project.countryCode,
      organizationName: project.organization.name,
      activities: project.activities.map((activity) => activity.name),
    },
    profileFields: snapshotData.fields ?? {},
    internalInputs,
    registerEntries,
  };

  return {
    project,
    /** Every text generated for the project is written in its language. */
    language: toOutputLanguage(project.language),
    method: project.contextSettings?.analysisMethod ?? null,
    internalCompleted,
    countries: projectCountryCodes(snapshotData, project.countryCode),
    validatedAnswersCount: validatedProfileAnswers(digestInput.profileFields).length,
    registerEntries,
    digest: buildContextDigest(digestInput),
  };
}
