import { Badge } from "@qhse/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@qhse/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@qhse/ui/components/tabs";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { adminApi } from "../../lib/admin-api.js";

type Comparison = {
  versions: { before: { label: string }; after: { label: string } };
  metadata: Array<{ field: string; before: unknown; after: unknown }>;
  content: { added: string[]; removed: string[] };
  structure: { before: unknown[]; after: unknown[] };
  references: { before: unknown[]; after: unknown[] };
};

export function VersionComparisonPage() {
  const { documentId, beforeId, afterId } = useParams();
  const [data, setData] = useState<Comparison | null>(null);
  useEffect(() => {
    void adminApi<Comparison>(
      `/v1/documents/${documentId}/versions/${beforeId}/compare/${afterId}`,
    ).then(setData);
  }, [documentId, beforeId, afterId]);
  if (!data) return <p className="text-sm text-muted-foreground">Preparing comparison…</p>;
  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-6">
      <div>
        <p className="text-sm font-medium text-violet-700">Documents / Version comparison</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {data.versions.before.label} → {data.versions.after.label}
        </h1>
        <p className="mt-2 text-sm text-slate-600">Comparison never changes publication state.</p>
      </div>
      <Tabs defaultValue="all">
        <TabsList className="max-w-full overflow-x-auto rounded-xl bg-slate-200/70">
          {["all", "metadata", "content", "structure", "references", "classification"].map(
            (value) => (
              <TabsTrigger key={value} value={value} className="capitalize">
                {value}
              </TabsTrigger>
            ),
          )}
        </TabsList>
        <TabsContent value="all">
          <div className="grid gap-4 lg:grid-cols-2">
            <Diff title="Removed paragraphs" items={data.content.removed} tone="removed" />
            <Diff title="Added paragraphs" items={data.content.added} tone="added" />
          </div>
        </TabsContent>
        <TabsContent value="metadata">
          <Card>
            <CardHeader>
              <CardTitle>Metadata changes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.metadata.map((row) => (
                <div key={row.field} className="grid gap-2 rounded-xl border p-3 md:grid-cols-3">
                  <b>{row.field}</b>
                  <span className="text-red-700">{display(row.before)}</span>
                  <span className="text-emerald-700">{display(row.after)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="content">
          <div className="grid gap-4 lg:grid-cols-2">
            <Diff title="Removed" items={data.content.removed} tone="removed" />
            <Diff title="Added" items={data.content.added} tone="added" />
          </div>
        </TabsContent>
        {["structure", "references", "classification"].map((value) => (
          <TabsContent key={value} value={value}>
            <Card>
              <CardHeader>
                <CardTitle className="capitalize">{value} changes</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="outline">Reviewer inspection required</Badge>
                <pre className="mt-4 overflow-auto whitespace-pre-wrap text-xs">
                  {JSON.stringify(
                    value === "structure"
                      ? data.structure
                      : value === "references"
                        ? data.references
                        : {},
                    null,
                    2,
                  )}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

function Diff({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "added" | "removed";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length ? (
          items.map((item, index) => (
            <p
              key={index}
              className={`rounded-xl p-3 text-sm ${tone === "added" ? "bg-emerald-50 text-emerald-950" : "bg-red-50 text-red-950"}`}
            >
              {tone === "added" ? "+" : "−"} {item}
            </p>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No {tone} paragraphs.</p>
        )}
      </CardContent>
    </Card>
  );
}

function display(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint")
    return value.toString();
  if (typeof value === "symbol") return value.description ?? "symbol";
  return "[function]";
}
