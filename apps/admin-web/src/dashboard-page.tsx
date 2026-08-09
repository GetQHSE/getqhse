import { Badge } from "@qhse/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@qhse/ui/components/card";
import { AlertTriangleIcon, BookCheckIcon, FilesIcon, ScanTextIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi, formatDate } from "./lib/admin-api.js";

type Dashboard = {
  totals: Record<string, number>;
  queues: Record<string, number>;
  recentlyPublished: Array<{
    id: string;
    versionLabel: string;
    publishedAt: string;
    document: { id: string; title: string };
  }>;
};

export function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  useEffect(() => {
    void adminApi<Dashboard>("/v1/documents/dashboard").then(setData);
  }, []);
  const metrics = [
    ["Total documents", data?.totals["total"] ?? "—", FilesIcon],
    ["Published", data?.totals["published"] ?? "—", BookCheckIcon],
    ["Processing", data?.totals["processing"] ?? "—", ScanTextIcon],
    ["Failed jobs", data?.totals["failedJobs"] ?? "—", AlertTriangleIcon],
  ] as const;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Knowledge operations</p>
        <h1 className="text-2xl font-semibold tracking-tight">Document processing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review ingestion health and move trusted revisions through controlled publication.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, Icon]) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-3xl font-semibold">{value}</p>
              </div>
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <Icon className="size-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Review queues</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {Object.entries(data?.queues ?? {}).map(([queue, count]) => (
              <Link
                key={queue}
                to="/documents"
                className="flex items-center justify-between rounded-xl border p-4 hover:bg-muted/40"
              >
                <span className="text-sm capitalize">{queue.replace(/([A-Z])/g, " $1")}</span>
                <Badge variant={count > 0 ? "secondary" : "outline"}>{count}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recently published</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data?.recentlyPublished.length ? (
              data.recentlyPublished.map((version) => (
                <Link
                  key={version.id}
                  to={`/documents/${version.document.id}`}
                  className="block border-b pb-3 last:border-0"
                >
                  <p className="truncate text-sm font-medium">{version.document.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {version.versionLabel} · {formatDate(version.publishedAt)}
                  </p>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No revisions have been published yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
