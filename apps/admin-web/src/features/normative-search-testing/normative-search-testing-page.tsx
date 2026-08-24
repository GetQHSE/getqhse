import type { AdminNormativeSearchResponse } from "@qhse/contracts";
import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@qhse/ui/components/card";
import { Input } from "@qhse/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@qhse/ui/components/native-select";
import { Skeleton } from "@qhse/ui/components/skeleton";
import { cn } from "@qhse/ui/lib/utils";
import { LoaderCircleIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

import { adminApi } from "../../lib/admin-api.js";

const languageOptions = [
  { value: "fr", label: "Français" },
  { value: "ar", label: "Arabe" },
] as const;

type Language = (typeof languageOptions)[number]["value"];

function scoreLabel(value: number | null): string {
  return value === null ? "—" : value.toFixed(3);
}

export function NormativeSearchTestingPage() {
  const [query, setQuery] = useState("");
  const [languages, setLanguages] = useState<Language[]>(["fr", "ar"]);
  const [documentFamily, setDocumentFamily] = useState<"any" | "standard" | "regulation">("any");
  const [limit, setLimit] = useState(10);
  const [response, setResponse] = useState<AdminNormativeSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleLanguage(language: Language) {
    setLanguages((current) =>
      current.includes(language)
        ? current.filter((value) => value !== language)
        : [...current, language],
    );
  }

  async function runSearch() {
    if (query.trim().length < 3 || languages.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi<AdminNormativeSearchResponse>(
        "/v1/normative-search-testing/search",
        {
          method: "POST",
          body: JSON.stringify({
            query: query.trim(),
            languages,
            limit,
            ...(documentFamily === "any" ? {} : { documentFamilies: [documentFamily] }),
          }),
        },
      );
      setResponse(result);
    } catch (reason) {
      setResponse(null);
      setError(reason instanceof Error ? reason.message : "The search could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-6">
      <header>
        <p className="text-sm font-medium text-violet-700">Administration</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Search testing</h1>
        <p className="mt-2 text-sm text-slate-600">
          Run the same hybrid retrieval the AI uses, and see the full chunk content it actually gets
          back — no summarization, no paraphrasing, just what is embedded.
        </p>
      </header>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="Ex.: obligations de l’employeur en matière de sécurité"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void runSearch();
              }}
              className="flex-1"
            />
            <Button disabled={loading || query.trim().length < 3} onClick={() => void runSearch()}>
              {loading ? <LoaderCircleIcon className="animate-spin" /> : <SearchIcon />}
              {loading ? "Recherche…" : "Rechercher"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Langues</span>
              {languageOptions.map((option) => {
                const active = languages.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleLanguage(option.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition",
                      active
                        ? "border-violet-300 bg-violet-50 text-violet-800"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Corpus</span>
              <NativeSelect
                size="sm"
                value={documentFamily}
                onChange={(event) => setDocumentFamily(event.target.value as typeof documentFamily)}
              >
                <NativeSelectOption value="any">Tous</NativeSelectOption>
                <NativeSelectOption value="regulation">Réglementation</NativeSelectOption>
                <NativeSelectOption value="standard">Normes</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Résultats</span>
              <NativeSelect
                size="sm"
                value={String(limit)}
                onChange={(event) => setLimit(Number(event.target.value))}
              >
                {[5, 10, 15, 20].map((value) => (
                  <NativeSelectOption key={value} value={String(value)}>
                    {value}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          {languages.length === 0 ? (
            <p className="text-xs text-amber-700">Sélectionnez au moins une langue.</p>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : response ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Badge variant="outline">{response.results.length} résultat(s)</Badge>
            <Badge variant="outline">
              Profil : {response.embeddingProfile.key} · {response.embeddingProfile.model}
            </Badge>
            <Badge variant="outline">Au {response.asOf}</Badge>
          </div>
          {response.results.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
              Aucun extrait retrouvé pour cette requête.
            </p>
          ) : (
            response.results.map((result) => (
              <Card key={result.chunkId}>
                <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle className="text-sm">{result.citationLabel}</CardTitle>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="outline">{result.documentFamily}</Badge>
                      <Badge variant="outline">{result.provisionType}</Badge>
                      <Badge variant="outline">{result.language}</Badge>
                      {result.headingPath.map((heading) => (
                        <Badge key={heading} variant="secondary">
                          {heading}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-3 text-xs text-slate-500">
                    <span>Mots-clés : {scoreLabel(result.scores.keyword)}</span>
                    <span>Sémantique : {scoreLabel(result.scores.semantic)}</span>
                    <span className="font-semibold text-violet-700">
                      Fusion : {scoreLabel(result.scores.fusion)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                    {result.content}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
