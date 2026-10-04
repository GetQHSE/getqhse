import type { DatabaseClient, Prisma } from "@qhse/database";
import { planningSourcesSchema, scopeDeclarationSchema } from "@qhse/contracts";
import { loadScopeFacts, scopeFingerprint } from "../../scope/application/scope-material.js";
export async function loadPlanningSources(
  db: DatabaseClient | Prisma.TransactionClient,
  projectId: string,
) {
  const facts = await loadScopeFacts(db, projectId);
  const [scope, state, verification] = await Promise.all([
    db.scopeStatement.findFirst({
      where: { projectId, status: "VALIDATED" },
      orderBy: { version: "desc" },
    }),
    db.scopeState.findUnique({ where: { projectId } }),
    db.scopeVerification.findFirst({ where: { projectId }, orderBy: { reviewedAt: "desc" } }),
  ]);
  return planningSourcesSchema.parse({
    facts,
    scope: scope
      ? {
          id: scope.id,
          version: scope.version,
          statement: scope.statement,
          current: Boolean(
            state &&
            verification?.id === scope.verificationId &&
            scope.fingerprint ===
              scopeFingerprint({
                facts,
                declaration: scopeDeclarationSchema.parse(state.declaration),
              }),
          ),
        }
      : null,
  });
}
export { scopeFingerprint as planningFingerprint };
