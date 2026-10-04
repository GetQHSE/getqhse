import { createHash } from "node:crypto";
import type { DatabaseClient, Prisma } from "@qhse/database";
import { pipPartyContentSchema, scopeFactsSchema, roEffectiveSchema } from "@qhse/contracts";
import { loadPipMaterial } from "../../pip/application/pip-material.js";
import { loadRoMaterial } from "../../ro/application/ro-material.js";
export const scopeFingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function loadScopeFacts(
  db: DatabaseClient | Prisma.TransactionClient,
  projectId: string,
) {
  const m = await loadRoMaterial(db, projectId);
  const [fields, parties, risks, roState] = await Promise.all([
    m.project.profile
      ? db.projectProfileField.findMany({
          where: { profileId: m.project.profile.id, status: "CONFIRMED" },
          orderBy: { key: "asc" },
        })
      : [],
    db.pipParty.findMany({
      where: { projectId, reviewStatus: { in: ["VALIDATED", "MODIFIED"] } },
      orderBy: { id: "asc" },
    }),
    db.roItem.findMany({
      where: { projectId, reviewStatus: { in: ["VALIDATED", "MODIFIED"] } },
      orderBy: { id: "asc" },
    }),
    db.roState.findUnique({ where: { projectId } }),
  ]);
  const pipState = await db.pipState.findUnique({ where: { projectId } });
  // A PIP inventory can be current even when it has no requirements yet.
  const { fingerprint } = await loadPipMaterial(db, projectId);
  const currentParties = pipState?.inventoryFingerprint === fingerprint ? parties : [];
  const sourceIds = new Set(m.sources.map((s) => s.id));
  const branchFingerprints = (roState?.branchFingerprints ?? {}) as Record<string, string>;
  const roCurrent = Object.entries(branchFingerprints).every(
    ([key, value]) => m.branches[key as keyof typeof m.branches] === value,
  );
  return scopeFactsSchema.parse({
    projectName: m.project.name,
    organizationName: m.project.organization.name,
    standard: m.project.standardCode,
    language: m.language,
    projectActivities: m.project.activities.map((a) => a.name),
    profile: fields
      .filter((f) => f.value !== null)
      .map((f) => ({
        key: f.key,
        value: typeof f.value === "string" ? f.value : JSON.stringify(f.value),
      })),
    issues: m.sources
      .filter((s) => s.branch === "context_issue")
      .map((s) => ({ id: s.id, title: s.title })),
    parties: currentParties.map((p) => ({
      id: p.id,
      name: pipPartyContentSchema.parse(p.effective).name,
    })),
    requirements: m.sources
      .filter((s) => s.branch === "pip_requirement")
      .map((s) => ({ id: s.id, partyName: s.partyName ?? "", text: s.description })),
    risks: roCurrent
      ? risks
          .filter((i) => !i.sourceId || sourceIds.has(i.sourceId))
          .map((i) => ({ id: i.id, title: roEffectiveSchema.parse(i.effective).content.title }))
      : [],
  });
}
