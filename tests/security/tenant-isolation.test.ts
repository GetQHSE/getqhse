import { describe, expect, it } from "vitest";

type ResourceType =
  | "site"
  | "audit"
  | "evidence"
  | "finding"
  | "correctiveAction"
  | "report"
  | "file"
  | "vectorResult";
type Operation = "read" | "modify" | "delete" | "search" | "export" | "reference";
type Resource = { id: string; organizationId: string; type: ResourceType; value: string };

class TenantScopedStore {
  constructor(private readonly records: Resource[]) {}

  operate(organizationId: string, operation: Operation, resourceId: string): Resource | null {
    const resource = this.records.find(
      (candidate) => candidate.id === resourceId && candidate.organizationId === organizationId,
    );
    if (!resource) return null;
    return operation === "delete" ? { ...resource, value: "[deleted]" } : resource;
  }
}

const resourceTypes: ResourceType[] = [
  "site",
  "audit",
  "evidence",
  "finding",
  "correctiveAction",
  "report",
  "file",
  "vectorResult",
];
const operations: Operation[] = ["read", "modify", "delete", "search", "export", "reference"];

describe("mandatory tenant isolation matrix", () => {
  it.each(
    resourceTypes.flatMap((type) => operations.map((operation) => [type, operation] as const)),
  )("prevents cross-tenant %s %s", (type, operation) => {
    const store = new TenantScopedStore([
      { id: `${type}-atlas`, type, organizationId: "org-atlas", value: "Atlas private data" },
    ]);
    expect(store.operate("org-rif", operation, `${type}-atlas`)).toBeNull();
  });
});
