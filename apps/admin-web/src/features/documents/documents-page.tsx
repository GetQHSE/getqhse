import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Card, CardContent, CardHeader } from "@qhse/ui/components/card";
import { Input } from "@qhse/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@qhse/ui/components/native-select";
import { Skeleton } from "@qhse/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@qhse/ui/components/table";
import { Grid2X2Icon, ListIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAdminAuth } from "../../auth.js";
import { adminApi, formatDate } from "../../lib/admin-api.js";
import { DocumentStatusBadge } from "./document-status-badge.js";

type DocumentItem = {
  id: string;
  title: string;
  referenceNumber: string | null;
  documentType: string;
  issuingAuthority: string | null;
  publicationDate: string | null;
  effectiveDate: string | null;
  status: string;
  updatedAt: string;
  currentVersion: { versionLabel: string; processingStatus: string; ocrUsed: boolean } | null;
  updatedBy: { name: string };
  _count: { versions: number };
};

export function DocumentsPage() {
  const { user } = useAdminAuth();
  const [data, setData] = useState<DocumentItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [view, setView] = useState<"table" | "cards">("table");

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    const timer = window.setTimeout(() => {
      setError(null);
      void adminApi<{ data: DocumentItem[] }>(`/v1/documents?${params}`)
        .then((result) => setData(result.data))
        .catch((reason: unknown) =>
          setError(reason instanceof Error ? reason.message : "Unable to load documents"),
        );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, status]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Knowledge sources</p>
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload, review, replace and publish controlled QHSE reference content.
          </p>
        </div>
        {user?.platformRole !== "support" ? (
          <Button render={<Link to="/documents/upload" />}>
            <PlusIcon /> Upload document
          </Button>
        ) : null}
      </div>
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-64 flex-1">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search title, reference or authority"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <NativeSelect value={status} onChange={(event) => setStatus(event.target.value)}>
              <NativeSelectOption value="">All statuses</NativeSelectOption>
              {[
                "draft",
                "uploaded",
                "processing",
                "review_required",
                "validated",
                "published",
                "processing_failed",
                "archived",
              ].map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <div className="flex rounded-full bg-muted p-1">
              <Button
                size="icon-sm"
                variant={view === "table" ? "secondary" : "ghost"}
                aria-label="Table view"
                onClick={() => setView("table")}
              >
                <ListIcon />
              </Button>
              <Button
                size="icon-sm"
                variant={view === "cards" ? "secondary" : "ghost"}
                aria-label="Card view"
                onClick={() => setView("cards")}
              >
                <Grid2X2Icon />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-8 text-center">
              <p className="font-medium">Unable to load documents</p>
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : !data ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3].map((row) => (
                <Skeleton key={row} className="h-12 w-full" />
              ))}
            </div>
          ) : data.length === 0 ? (
            <div className="grid place-items-center px-6 py-16 text-center">
              <div>
                <p className="font-medium">No documents match this view</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upload a knowledge source or adjust the filters.
                </p>
              </div>
            </div>
          ) : view === "cards" ? (
            <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
              {data.map((document) => (
                <Link
                  key={document.id}
                  to={`/documents/${document.id}`}
                  className="rounded-2xl border p-5 transition-colors hover:bg-muted/40"
                >
                  <div className="flex justify-between gap-3">
                    <DocumentStatusBadge status={document.status} />
                    <Badge variant="outline">{document.documentType.replaceAll("_", " ")}</Badge>
                  </div>
                  <h2 className="mt-4 font-semibold leading-snug">{document.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {document.referenceNumber ?? "No reference number"}
                  </p>
                  <div className="mt-5 flex justify-between text-xs text-muted-foreground">
                    <span>
                      {document.currentVersion?.versionLabel ??
                        `${document._count.versions} revision(s)`}
                    </span>
                    <span>{formatDate(document.updatedAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Authority</TableHead>
                  <TableHead>Revision</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Processing</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell>
                      <Link
                        className="font-medium hover:underline"
                        to={`/documents/${document.id}`}
                      >
                        {document.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {document.referenceNumber ?? "No reference"}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">
                      {document.documentType.replaceAll("_", " ")}
                    </TableCell>
                    <TableCell>{document.issuingAuthority ?? "—"}</TableCell>
                    <TableCell>{document.currentVersion?.versionLabel ?? "—"}</TableCell>
                    <TableCell>
                      <DocumentStatusBadge status={document.status} />
                    </TableCell>
                    <TableCell>
                      {document.currentVersion ? (
                        <DocumentStatusBadge status={document.currentVersion.processingStatus} />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{formatDate(document.effectiveDate)}</TableCell>
                    <TableCell>
                      <span>{formatDate(document.updatedAt)}</span>
                      <div className="text-xs text-muted-foreground">{document.updatedBy.name}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
