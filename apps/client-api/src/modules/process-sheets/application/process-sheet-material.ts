import type { DatabaseClient, Prisma } from "@qhse/database";
import {
  planningDocumentSchema,
  processSheetSourcesSchema,
  processSheetMaterialSchema,
  type ProcessSheetSources,
} from "@qhse/contracts";
import { smqPlanning } from "@qhse/domain";
import {
  loadPlanningSources,
  planningFingerprint as hash,
} from "../../planning/application/planning-material.js";
export async function loadSheetSources(
  db: DatabaseClient | Prisma.TransactionClient,
  projectId: string,
) {
  const base = await loadPlanningSources(db, projectId),
    fp = hash(base);
  const [map, policy, objectives] = await Promise.all(
    ["processes", "policy", "objectives"].map((kind) =>
      db.planningVersion.findFirst({ where: { projectId, kind }, orderBy: { version: "desc" } }),
    ),
  );
  const mapDocument = map ? planningDocumentSchema.parse(map.document) : null;
  const policyDocument = policy ? planningDocumentSchema.parse(policy.document) : null;
  const objectivesDocument = objectives ? planningDocumentSchema.parse(objectives.document) : null;
  const policyCurrent = Boolean(policy && policy.fingerprint === fp && base.scope?.current);
  const objectivesCurrent = Boolean(
    policyCurrent &&
    objectives?.fingerprint === fp &&
    objectivesDocument?.policyVersionId === policy?.id &&
    policyDocument &&
    objectivesDocument &&
    hash(smqPlanning.policyBasis(policyDocument)) ===
      hash(smqPlanning.policyBasis(objectivesDocument)),
  );
  return processSheetSourcesSchema.parse({
    facts: base.facts,
    map:
      map && mapDocument
        ? {
            id: map.id,
            version: map.version,
            current: map.fingerprint === fp && Boolean(base.scope?.current),
            processes: mapDocument.processes.filter((p) => p.decision === "retained"),
            interactions: mapDocument.interactions.filter((i) => i.decision === "retained"),
          }
        : null,
    policy:
      policyCurrent && policy
        ? { id: policy.id, version: policy.version, statement: policyDocument?.statement }
        : null,
    objectivesVersionId: objectivesCurrent ? objectives?.id : null,
    objectivesVersion: objectivesCurrent ? objectives?.version : null,
    objectives: objectivesCurrent
      ? objectivesDocument?.objectives.filter((o) => o.decision === "retained")
      : [],
  });
}
export function sheetMaterial(sources: ProcessSheetSources, processId: string) {
  return processSheetMaterialSchema.parse({ sources, processId });
}
export { hash as sheetFingerprint };
