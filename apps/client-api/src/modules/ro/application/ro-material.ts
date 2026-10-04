import { createHash } from "node:crypto";
import type { DatabaseClient, Prisma } from "@qhse/database";
import { pipPartyContentSchema, pipRequirementContentSchema, type RoSource } from "@qhse/contracts";
import { loadPipMaterial } from "../../pip/application/pip-material.js";
export const roFingerprint = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export async function loadRoMaterial(
  db: DatabaseClient | Prisma.TransactionClient,
  projectId: string,
) {
  const { project, material, fingerprint } = await loadPipMaterial(db, projectId);
  const [parties, pipState, issues] = await Promise.all([
    db.pipParty.findMany({
      where: { projectId, reviewStatus: { in: ["VALIDATED", "MODIFIED"] } },
      include: {
        requirements: {
          where: { reviewStatus: { in: ["VALIDATED", "MODIFIED"] } },
          orderBy: { id: "asc" },
        },
      },
      orderBy: { id: "asc" },
    }),
    db.pipState.findUnique({ where: { projectId } }),
    db.contextIssue.findMany({
      where: { id: { in: material.issues.map((i) => i.id) } },
      orderBy: { id: "asc" },
    }),
  ]);
  const sources: RoSource[] = issues.map((i) => ({
    id: i.id,
    branch: "context_issue",
    title: i.title ?? i.aiTitle,
    description: i.description ?? i.aiDescription ?? "",
    partyId: null,
    partyName: null,
    kind: i.nature ?? i.aiNature,
    fingerprint: "",
  }));
  if (pipState?.inventoryFingerprint === fingerprint)
    for (const p of parties) {
      const party = pipPartyContentSchema.parse(p.effective);
      if (["not_relevant", "insufficient_information"].includes(party.relevance)) continue;
      for (const r of p.requirements) {
        const requirement = pipRequirementContentSchema.parse(r.effective);
        sources.push({
          id: r.id,
          branch: "pip_requirement",
          title: requirement.text.slice(0, 300),
          description: requirement.text,
          partyId: p.id,
          partyName: party.name,
          kind: requirement.kind,
          fingerprint: "",
        });
      }
    }
  for (const s of sources) s.fingerprint = roFingerprint({ ...s, fingerprint: undefined });
  const branches = {
    context_issue: roFingerprint({
      digest: material.digest,
      sources: sources.filter((s) => s.branch === "context_issue"),
    }),
    pip_requirement: roFingerprint({
      digest: material.digest,
      sources: sources.filter((s) => s.branch === "pip_requirement"),
    }),
  };
  return { project, language: material.language, digest: material.digest, sources, branches };
}
