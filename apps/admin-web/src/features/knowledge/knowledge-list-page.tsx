import type { AiKnowledgeFeature } from "@qhse/contracts";
import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Card, CardContent, CardHeader } from "@qhse/ui/components/card";
import { Input } from "@qhse/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@qhse/ui/components/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@qhse/ui/components/table";
import { BrainCircuitIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAdminAuth } from "../../auth.js";
import { adminApi, formatDate } from "../../lib/admin-api.js";
import { featurePath, featureTitle, type KnowledgeListResponse } from "./knowledge-types.js";

export function KnowledgeListPage({ feature }: { feature: AiKnowledgeFeature }) {
  const { user } = useAdminAuth();
  const canManage = user?.platformRole !== "support";
  const [result, setResult] = useState<KnowledgeListResponse | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [language, setLanguage] = useState("");
  const [embeddingStatus, setEmbeddingStatus] = useState("");
  const [featureFilter, setFeatureFilter] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ feature, page: String(page), pageSize: "25" });
    if (search) query.set("search", search);
    if (status) query.set("status", status);
    if (source) query.set("source", source);
    if (language) query.set("language", language);
    if (embeddingStatus) query.set("embeddingStatus", embeddingStatus);
    if (featureFilter) {
      query.set(feature === "DISCOVERY" ? "rating" : "expectedResult", featureFilter);
    }
    try {
      setError(null);
      setResult(await adminApi<KnowledgeListResponse>(`/v1/knowledge/examples?${query}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load knowledge examples");
    }
  }, [embeddingStatus, feature, featureFilter, language, page, search, source, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => setPage(1), [search, status, source, language, embeddingStatus, featureFilter]);

  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-violet-700">Knowledge library</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{featureTitle(feature)}</h1>
          <p className="mt-2 text-sm text-slate-600">
            Review sanitized examples before they can influence this AI feature.
          </p>
        </div>
        {canManage ? (
          <Button render={<Link to={`/knowledge/${featurePath(feature)}/new`} />}>
            <PlusIcon /> Add example
          </Button>
        ) : null}
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <Card className="overflow-hidden rounded-3xl border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 p-5">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-64 flex-1">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Search title, scenario or guidance"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Filter
              value={status}
              onChange={setStatus}
              label="Status"
              options={["DRAFT", "ACTIVE"]}
            />
            <Filter
              value={source}
              onChange={setSource}
              label="Source"
              options={["ADMIN", "CUSTOMER_REVIEW", "HUMAN_CONFIRMATION"]}
            />
            <Filter
              value={language}
              onChange={setLanguage}
              label="Language"
              options={["fr", "ar"]}
            />
            <Filter
              value={embeddingStatus}
              onChange={setEmbeddingStatus}
              label="Embedding"
              options={["PENDING", "PROCESSING", "COMPLETED", "FAILED"]}
            />
            <Filter
              value={featureFilter}
              onChange={setFeatureFilter}
              label={feature === "DISCOVERY" ? "Rating" : "Result"}
              options={
                feature === "DISCOVERY"
                  ? ["0", "1", "2", "3", "4", "5"]
                  : ["CONFORMING", "PARTIAL", "NON_CONFORMING"]
              }
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Example</TableHead>
                <TableHead>
                  {feature === "DISCOVERY" ? "Rating / laws" : "Expected result"}
                </TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result?.items.map((example) => {
                const included = Array.isArray(example.payload["includedLaws"])
                  ? example.payload["includedLaws"].length
                  : 0;
                const excluded = Array.isArray(example.payload["excludedLaws"])
                  ? example.payload["excludedLaws"].length
                  : 0;
                return (
                  <TableRow key={example.id}>
                    <TableCell>
                      <Link
                        className="font-medium text-slate-950 hover:text-violet-700"
                        to={`/knowledge/${featurePath(feature)}/${example.id}`}
                      >
                        {example.title}
                      </Link>
                      <span className="mt-1 block max-w-xl truncate text-xs text-slate-500">
                        {example.scenarioSummary}
                      </span>
                      <div className="mt-2 flex gap-1">
                        {example.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="outline">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {feature === "DISCOVERY"
                        ? `${example.rating ?? "—"}/5 · ${included} in · ${excluded} out`
                        : (example.expectedResult ?? "—")}
                    </TableCell>
                    <TableCell>
                      <span>{example.source.replaceAll("_", " ")}</span>
                      <span className="block text-xs text-slate-500">
                        {example.sourceOrganization?.name ?? "Platform"}
                        {example.sourceProject ? ` · ${example.sourceProject.name}` : ""}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={example.status === "ACTIVE" ? "default" : "secondary"}>
                        {example.status}
                      </Badge>
                      <span className="mt-1 block text-xs text-slate-500">
                        {example.embeddingStatus}
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(example.updatedAt)}</TableCell>
                  </TableRow>
                );
              })}
              {result?.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-40 text-center text-slate-500">
                    <BrainCircuitIcon className="mx-auto mb-2 size-7" /> No examples match these
                    filters.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {result && result.pagination.pageCount > 1 ? (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {result.pagination.page} of {result.pagination.pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={page >= result.pagination.pageCount}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Filter({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <NativeSelect
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <NativeSelectOption value="">All {label.toLowerCase()}</NativeSelectOption>
      {options.map((option) => (
        <NativeSelectOption key={option} value={option}>
          {option.replaceAll("_", " ")}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
