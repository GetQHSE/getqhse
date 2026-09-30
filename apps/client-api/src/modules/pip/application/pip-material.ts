import { createHash } from "node:crypto";
import { buildContextDigest, toOutputLanguage } from "@qhse/ai";
import type { DatabaseClient } from "@qhse/database";

/** Reads published regulatory evidence and only human-retained issues. */
export async function loadPipMaterial(database: DatabaseClient, projectId: string) {
  const project = await database.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      organization: true,
      activities: { orderBy: { id: "asc" } },
      profile: { include: { snapshots: { orderBy: { sequence: "desc" }, take: 1 } } },
      regulatoryWatch: true,
    },
  });
  const [internalInputs, synthesis] = await Promise.all([
    database.contextInternalInput.findMany({
      where: { projectId, status: "completed" },
      orderBy: { questionKey: "asc" },
    }),
    database.contextAnalysisRun.findFirst({
      where: { projectId, kind: "SYNTHESIS", status: "COMPLETED", validatedAt: { not: null } },
      orderBy: { completedAt: "desc" },
    }),
  ]);
  const [entries, issueRows, clarifications] = await Promise.all([
    project.regulatoryWatch?.currentBaselineId
      ? database.regulatoryRegisterEntry.findMany({
          where: { baselineId: project.regulatoryWatch.currentBaselineId },
          orderBy: { orderIndex: "asc" },
          take: 200,
        })
      : [],
    synthesis
      ? database.contextIssue.findMany({
          where: {
            runId: synthesis.id,
            projectId,
            reviewStatus: { in: ["VALIDATED", "MODIFIED"] },
          },
          orderBy: { id: "asc" },
        })
      : [],
    database.pipClarification.findMany({
      where: { projectId, answer: { not: null } },
      orderBy: { id: "asc" },
    }),
  ]);
  const snapshot = (project.profile?.snapshots[0]?.data ?? {}) as {
    fields?: Record<string, unknown>;
  };
  const digest = buildContextDigest({
    project: {
      name: project.name,
      organizationName: project.organization.name,
      entityType: project.entityType,
      description: project.description,
      standardCode: project.standardCode,
      countryCode: project.countryCode,
      activities: project.activities.map((a) => a.name),
    },
    profileFields: snapshot.fields ?? {},
    internalInputs,
    registerEntries: entries,
  });
  const issues = issueRows.map((issue) => ({
    id: issue.id,
    title: issue.title ?? issue.aiTitle,
    description: issue.description ?? issue.aiDescription,
  }));
  const regulations = entries.map((entry) => ({
    id: entry.id,
    title: entry.sourceTitle ?? entry.citationLabel,
    requirementText: entry.requirementText,
    sourceUrl: entry.sourceUrl,
  }));
  const material = {
    language: toOutputLanguage(project.language),
    digest,
    issues,
    regulations,
    clarifications: clarifications.map((c) => ({ question: c.question, answer: c.answer! })),
  };
  // The fingerprint deliberately excludes PIP decisions and model/run timestamps.
  const fingerprint = createHash("sha256").update(JSON.stringify(material)).digest("hex");
  return { project, material, fingerprint };
}
