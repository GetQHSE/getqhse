import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@qhse/ui/components/card";
import { NativeSelect, NativeSelectOption } from "@qhse/ui/components/native-select";
import { Skeleton } from "@qhse/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@qhse/ui/components/tabs";
import {
  ArchiveIcon,
  CheckIcon,
  DownloadIcon,
  GitCompareIcon,
  PlayIcon,
  UploadIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAdminAuth } from "../../auth.js";
import { adminApi, formatDate } from "../../lib/admin-api.js";
import { DocumentStatusBadge } from "./document-status-badge.js";

type Version = {
  id: string;
  versionLabel: string;
  revisionDate: string | null;
  effectiveDate: string | null;
  status: string;
  changeType: string;
  changeSummary: string | null;
  processingStatus: string;
  processingError: string | null;
  ocrUsed: boolean;
  ocrConfidence: number | null;
  publishedAt: string | null;
  createdAt: string;
  createdBy: { name: string };
  validatedBy: { name: string } | null;
  files: Array<{ id: string; originalFileName: string; fileRole: string; fileSize: string }>;
  processingJobs: Array<{
    id: string;
    jobType: string;
    status: string;
    attemptCount: number;
    errorMessage: string | null;
  }>;
  metadataSuggestions: Array<{
    id: string;
    fieldName: string;
    suggestedValue: unknown;
    confidenceScore: number;
    decision: string;
    sourcePage: number | null;
    sourceText: string | null;
  }>;
  reviewIssues: Array<{
    id: string;
    issueType: string;
    severity: string;
    status: string;
    title: string;
    description: string;
  }>;
  _count: { sections: number; chunks: number };
};
type Detail = {
  id: string;
  title: string;
  referenceNumber: string | null;
  status: string;
  issuingAuthority: string | null;
  language: string;
  effectiveDate: string | null;
  description: string | null;
  currentVersionId: string | null;
  versions: Version[];
  taxonomyTerms: Array<{
    id: string;
    source: string;
    confidenceScore: number | null;
    isValidated: boolean;
    term: { label: string; taxonomy: { name: string } };
  }>;
  sourceRelationships: Array<{
    id: string;
    relationshipType: string;
    targetDocument: { title: string; referenceNumber: string | null };
  }>;
  activity: Array<{
    id: string;
    action: string;
    createdAt: string;
    actor: { name: string } | null;
  }>;
};
type Taxonomy = { id: string; name: string; terms: Array<{ id: string; label: string }> };

export function DocumentDetailPage() {
  const { documentId = "" } = useParams();
  const { user } = useAdminAuth();
  const [document, setDocument] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([]);
  const [selectedTerm, setSelectedTerm] = useState("");
  const load = useCallback(() => {
    void adminApi<Detail>(`/v1/documents/${documentId}`)
      .then(setDocument)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unable to load document"),
      );
  }, [documentId]);
  useEffect(load, [load]);
  useEffect(() => {
    void adminApi<Taxonomy[]>("/v1/documents/taxonomies/all").then(setTaxonomies);
  }, []);
  async function action(label: string, path: string, body = {}) {
    setBusy(label);
    setError(null);
    try {
      await adminApi(path, { method: "POST", body: JSON.stringify(body) });
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }
  if (error && !document)
    return (
      <Card>
        <CardContent className="p-8 text-destructive">{error}</CardContent>
      </Card>
    );
  if (!document)
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  const latest = document.versions[0];
  const canMutate = user?.platformRole !== "support";
  const canStartProcessing =
    latest !== undefined &&
    ["UPLOADED", "PROCESSING_FAILED", "REVIEW_REQUIRED"].includes(latest.status);
  const isProcessing = latest?.status === "PROCESSING";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Documents / {document.referenceNumber ?? "Unnumbered"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{document.title}</h1>
            <DocumentStatusBadge status={document.status} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {[
              document.issuingAuthority,
              document.language.toUpperCase(),
              formatDate(document.effectiveDate),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            render={<Link to={`/documents/upload?document=${document.id}`} />}
          >
            <UploadIcon /> New version
          </Button>
          {latest && (canStartProcessing || isProcessing) ? (
            <Button
              variant="outline"
              disabled={!canMutate || busy !== null || isProcessing}
              onClick={() =>
                void action(
                  "process",
                  `/v1/documents/${document.id}/versions/${latest.id}/process`,
                  { force: latest.processingStatus === "FAILED" },
                )
              }
            >
              <PlayIcon /> {isProcessing ? "Processing…" : "Process"}
            </Button>
          ) : null}
          {latest?.status === "VALIDATED" ? (
            <Button
              disabled={!canMutate || busy !== null}
              onClick={() => {
                if (window.confirm("Publish this validated version to downstream QHSE services?"))
                  void action(
                    "publish",
                    `/v1/documents/${document.id}/versions/${latest.id}/publish`,
                    { confirmed: true },
                  );
              }}
            >
              <CheckIcon /> Publish
            </Button>
          ) : null}
          {latest?.status === "REVIEW_REQUIRED" ? (
            <Button
              disabled={!canMutate || busy !== null}
              onClick={() => {
                if (window.confirm("Confirm the relationship review and validate this version?"))
                  void action(
                    "validate",
                    `/v1/documents/${document.id}/versions/${latest.id}/validate`,
                    { relationshipConfirmed: true },
                  );
              }}
            >
              <CheckIcon /> Validate
            </Button>
          ) : null}
          <Button
            variant="outline"
            disabled={!canMutate || busy !== null}
            onClick={() => {
              if (
                window.confirm("Archive this document? It will remain available in admin history.")
              )
                void action("archive", `/v1/documents/${document.id}/archive`);
            }}
          >
            <ArchiveIcon /> Archive
          </Button>
        </div>
      </div>
      {error ? (
        <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [
            "Current version",
            document.versions.find((version) => version.id === document.currentVersionId)
              ?.versionLabel ?? "Not published",
          ],
          ["Versions", String(document.versions.length)],
          ["Processing", latest?.processingStatus.replaceAll("_", " ") ?? "Not started"],
          [
            "Review issues",
            String(
              document.versions.reduce(
                (sum, version) =>
                  sum + version.reviewIssues.filter((issue) => issue.status === "OPEN").length,
                0,
              ),
            ),
          ],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-2 text-lg font-semibold capitalize">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Tabs defaultValue="overview">
        <TabsList variant="line" className="max-w-full overflow-x-auto">
          {[
            "overview",
            "versions",
            "files",
            "extracted",
            "structure",
            "classification",
            "relationships",
            "processing",
            "issues",
            "activity",
          ].map((tab) => (
            <TabsTrigger key={tab} value={tab} className="capitalize">
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">
                {document.description ?? "No description has been added."}
              </p>
              {latest?.metadataSuggestions.some(({ decision }) => decision === "pending") ? (
                <div>
                  <h2 className="mb-3 font-medium">Detected metadata requiring review</h2>
                  <div className="space-y-3">
                    {latest.metadataSuggestions
                      .filter(({ decision }) => decision === "pending")
                      .map((suggestion) => (
                        <div
                          key={suggestion.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                        >
                          <div>
                            <p className="text-sm font-medium capitalize">
                              {suggestion.fieldName.replaceAll("_", " ")}:{" "}
                              {JSON.stringify(suggestion.suggestedValue)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {Math.round(suggestion.confidenceScore * 100)}% confidence
                              {suggestion.sourcePage ? ` · page ${suggestion.sourcePage}` : ""}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canMutate || busy !== null}
                              onClick={() =>
                                void action(
                                  `reject-${suggestion.id}`,
                                  `/v1/documents/${document.id}/versions/${latest.id}/metadata/${suggestion.id}`,
                                  { decision: "rejected" },
                                )
                              }
                            >
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              disabled={!canMutate || busy !== null}
                              onClick={() =>
                                void action(
                                  `accept-${suggestion.id}`,
                                  `/v1/documents/${document.id}/versions/${latest.id}/metadata/${suggestion.id}`,
                                  { decision: "accepted" },
                                )
                              }
                            >
                              Accept
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="versions">
          <Card>
            <CardHeader>
              <CardTitle>Version timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              {document.versions.map((version, index) => (
                <div
                  key={version.id}
                  className="relative grid gap-3 border-l-2 pb-8 pl-6 last:pb-0 md:grid-cols-[180px_1fr_auto]"
                >
                  <span className="absolute -left-[7px] top-1 size-3 rounded-full border-2 border-background bg-primary" />
                  <div>
                    <p className="font-semibold">{version.versionLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(version.revisionDate ?? version.createdAt)}
                    </p>
                  </div>
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <DocumentStatusBadge status={version.status} />
                      <DocumentStatusBadge status={version.processingStatus} />
                      <Badge variant="outline">
                        {version.changeType.toLowerCase().replaceAll("_", " ")}
                      </Badge>
                      {version.ocrUsed ? (
                        <Badge
                          variant={
                            (version.ocrConfidence ?? 0) < 0.75 ? "destructive" : "secondary"
                          }
                        >
                          OCR {Math.round((version.ocrConfidence ?? 0) * 100)}%
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm">{version.changeSummary ?? "No change summary"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Uploaded by {version.createdBy.name}
                      {version.validatedBy ? ` · Validated by ${version.validatedBy.name}` : ""}
                      {version.publishedAt ? ` · Published ${formatDate(version.publishedAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {index < document.versions.length - 1 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        render={
                          <Link
                            to={`/documents/${document.id}/compare/${document.versions[index + 1]!.id}/${version.id}`}
                          />
                        }
                      >
                        <GitCompareIcon /> Compare
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="files">
          <Card>
            <CardHeader>
              <CardTitle>Files</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {document.versions.flatMap((version) =>
                version.files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between rounded-xl border p-4"
                  >
                    <div>
                      <p className="font-medium">{file.originalFileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.fileRole} · version {version.versionLabel}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void adminApi<{ url: string }>(
                          `/v1/documents/${document.id}/files/${file.id}/download`,
                        ).then(({ url }) => window.open(url, "_blank", "noopener"))
                      }
                    >
                      <DownloadIcon /> Download
                    </Button>
                  </div>
                )),
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="extracted">
          <EmptySection
            title="Extracted content"
            text={
              latest
                ? `${latest._count.chunks} traceable chunks generated. Text remains in protected object storage.`
                : "No version uploaded."
            }
          />
        </TabsContent>
        <TabsContent value="structure">
          <EmptySection
            title="Detected structure"
            text={
              latest
                ? `${latest._count.sections} sections detected for the latest version.`
                : "No structure available."
            }
          />
        </TabsContent>
        <TabsContent value="classification">
          <Card>
            <CardHeader>
              <CardTitle>Classification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {canMutate ? (
                <div className="flex flex-wrap gap-2 rounded-xl border bg-muted/20 p-3">
                  <NativeSelect
                    className="min-w-64 flex-1"
                    value={selectedTerm}
                    onChange={(event) => setSelectedTerm(event.target.value)}
                  >
                    <NativeSelectOption value="">Select a taxonomy term</NativeSelectOption>
                    {taxonomies.flatMap((taxonomy) =>
                      taxonomy.terms.map((term) => (
                        <NativeSelectOption key={term.id} value={term.id}>
                          {taxonomy.name} · {term.label}
                        </NativeSelectOption>
                      )),
                    )}
                  </NativeSelect>
                  <Button
                    size="sm"
                    disabled={!selectedTerm || busy !== null}
                    onClick={() =>
                      void action("classify", `/v1/documents/${document.id}/classifications`, {
                        taxonomyTermIds: [selectedTerm],
                        source: "manual",
                        validated: true,
                      }).then(() => setSelectedTerm(""))
                    }
                  >
                    Add approved term
                  </Button>
                </div>
              ) : null}
              {document.taxonomyTerms.length ? (
                document.taxonomyTerms.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border p-3"
                  >
                    <div>
                      <p className="font-medium">{item.term.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.term.taxonomy.name} · {item.source}
                      </p>
                    </div>
                    <Badge variant={item.isValidated ? "default" : "secondary"}>
                      {item.isValidated
                        ? "Approved"
                        : `${Math.round((item.confidenceScore ?? 0) * 100)}% suggestion`}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No classifications yet. Suggested terms remain unapproved until a manager
                  validates them.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="relationships">
          <Card>
            <CardHeader>
              <CardTitle>Relationships and references</CardTitle>
            </CardHeader>
            <CardContent>
              {document.sourceRelationships.length ? (
                document.sourceRelationships.map((relation) => (
                  <div key={relation.id} className="rounded-xl border p-3">
                    <Badge variant="outline">{relation.relationshipType}</Badge>
                    <span className="ml-3 font-medium">{relation.targetDocument.title}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No related documents have been linked.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="processing">
          <Card>
            <CardHeader>
              <CardTitle>Processing history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {latest?.processingJobs.map((job) => (
                <div
                  key={job.id}
                  className="grid grid-cols-[1fr_auto] items-center rounded-xl border p-3"
                >
                  <div>
                    <p className="font-medium capitalize">{job.jobType.replaceAll("_", " ")}</p>
                    <p className="text-xs text-muted-foreground">
                      Attempt {job.attemptCount}
                      {job.errorMessage ? ` · ${job.errorMessage}` : ""}
                    </p>
                  </div>
                  <DocumentStatusBadge status={job.status} />
                </div>
              )) ?? <p>No processing jobs.</p>}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="issues">
          <Card>
            <CardHeader>
              <CardTitle>Review issues</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {latest?.reviewIssues.length ? (
                latest.reviewIssues.map((issue) => (
                  <div key={issue.id} className="rounded-xl border p-4">
                    <div className="flex gap-2">
                      <Badge variant={issue.severity === "BLOCKING" ? "destructive" : "secondary"}>
                        {issue.severity.toLowerCase()}
                      </Badge>
                      <DocumentStatusBadge status={issue.status} />
                    </div>
                    <p className="mt-2 font-medium">{issue.title}</p>
                    <p className="text-sm text-muted-foreground">{issue.description}</p>
                    {issue.status === "OPEN" ? (
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="outline"
                        disabled={!canMutate || busy !== null}
                        onClick={() =>
                          void action(
                            `resolve-${issue.id}`,
                            `/v1/documents/${document.id}/versions/${latest.id}/issues/${issue.id}/resolve`,
                          )
                        }
                      >
                        Resolve issue
                      </Button>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No review issues.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Activity log</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {document.activity.map((item) => (
                <div key={item.id} className="flex justify-between border-b pb-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {item.action.replaceAll(".", " · ").replaceAll("_", " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.actor?.name ?? "System worker"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(item.createdAt)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptySection({ title, text }: { title: string; text: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}
