import { useEffect, useState } from "react";
import type { PromptCatalogView, PromptDetailView, PromptSourceView } from "@qhse/contracts";
import { Button } from "@qhse/ui/components/button";
import { Badge } from "@qhse/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@qhse/ui/components/card";
import { Textarea } from "@qhse/ui/components/textarea";
import { Input } from "@qhse/ui/components/input";
import { Label } from "@qhse/ui/components/label";
import { Switch } from "@qhse/ui/components/switch";
import { adminApi, formatDate } from "../../lib/admin-api.js";

export function AiPromptsTab({ role }: { role: string | null | undefined }) {
  const canEdit = ["super_admin", "platform_admin", "content_manager"].includes(role ?? "");
  const canPublish = ["super_admin", "platform_admin"].includes(role ?? "");
  const [catalog, setCatalog] = useState<PromptCatalogView[]>([]);
  const [source, setSource] = useState<PromptSourceView | null>(null);
  const [key, setKey] = useState("");
  const [detail, setDetail] = useState<PromptDetailView | null>(null);
  const [revisionId, setRevisionId] = useState("");
  const [template, setTemplate] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [language, setLanguage] = useState<"fr" | "en" | "ar">("fr");
  const [context, setContext] = useState("");
  const [countries, setCountries] = useState("MA");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    void Promise.all([
      adminApi<PromptCatalogView[]>("/v1/ai-prompts"),
      adminApi<PromptSourceView>("/v1/ai-prompts/source"),
    ])
      .then(([items, settings]) => {
        if (!disposed) {
          setCatalog(items);
          setSource(settings);
          setKey(items.find((item) => !item.legacy)?.key ?? "");
        }
      })
      .catch((reason: unknown) => {
        if (!disposed)
          setError(reason instanceof Error ? reason.message : "Unable to load prompts");
      });
    return () => {
      disposed = true;
    };
  }, []);

  function apply(next: PromptDetailView, selectedId?: string) {
    setDetail(next);
    setCatalog((items) =>
      items.map((item) => (item.key === next.definition.key ? next.definition : item)),
    );
    const selected = next.revisions.find(
      (item) => item.id === (selectedId ?? next.definition.activeRevisionId),
    );
    setRevisionId(selected?.id ?? "");
    setTemplate(selected?.template ?? next.definition.template);
    setChangeNote("");
    setActionNote("");
  }

  useEffect(() => {
    if (!key) return;
    let disposed = false;
    setDetail(null);
    setError(null);
    setNotice(null);
    setContext("");
    void adminApi<PromptDetailView>(`/v1/ai-prompts/${encodeURIComponent(key)}`)
      .then((next) => {
        if (!disposed) apply(next);
      })
      .catch((reason: unknown) => {
        if (!disposed) setError(reason instanceof Error ? reason.message : "Unable to load prompt");
      });
    return () => {
      disposed = true;
    };
  }, [key]);

  const revision = detail?.revisions.find((item) => item.id === revisionId);
  const dirty = template !== (revision?.template ?? detail?.definition.template);
  const compatible = !revision || revision.baseVersion === detail?.definition.version;
  const ready = Boolean(revision && !dirty && compatible);

  async function switchSource() {
    if (!source) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await adminApi<PromptSourceView>("/v1/ai-prompts/source", {
        method: "POST",
        body: JSON.stringify({
          source: source.source === "DATABASE" ? "CODE" : "DATABASE",
          expectedGeneration: source.generation,
        }),
      });
      setSource(next);
      setNotice(
        `${next.source === "CODE" ? "Code prompts" : "Published database prompts"} selected. Future runs pick up the change within 30 seconds; running jobs keep their original prompts.`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to change prompt source");
    } finally {
      setBusy(false);
    }
  }

  async function mutate(path: string, body: unknown, selectCreated = false) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await adminApi<PromptDetailView>(
        `/v1/ai-prompts/${encodeURIComponent(key)}${path}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      apply(next, selectCreated ? next.createdRevisionId : revisionId);
      setNotice(
        selectCreated
          ? "Draft saved. Test and validate this revision before publication."
          : path === "/publish"
            ? source?.source === "CODE"
              ? "Published. Code prompts remain active until you enable database prompts."
              : "Published. Future runs pick up the change within 30 seconds; running jobs keep their original prompts."
            : "Saved.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Prompt operation failed");
    } finally {
      setBusy(false);
    }
  }

  const pages = [...new Set(catalog.map((item) => item.page))];
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Edit business instructions by page and section. Drafts do not affect clients. The prompt
        source applies across all organizations.
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border bg-slate-50 p-3 text-sm">
          {notice}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Prompt source</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Switch
              id="database-prompts"
              checked={source?.source === "DATABASE"}
              disabled={!canPublish || busy || !source}
              onCheckedChange={() => void switchSource()}
            />
            <Label htmlFor="database-prompts">Use database prompts</Label>
            {source && (
              <Badge variant="outline">
                {source.source === "DATABASE" ? "Database prompts" : "Code prompts"}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            On: use published, validated database revisions, with code defaults for prompts without
            a compatible revision. Off: use the prompts bundled in code for every new run. Published
            revisions are kept when switching off, so you can switch back at any time. Changes take
            effect within 30 seconds; running jobs keep their original prompts.
          </p>
          {!canPublish && (
            <p className="text-xs text-muted-foreground">
              Only a platform administrator can change the prompt source.
            </p>
          )}
        </CardContent>
      </Card>
      <div className="space-y-2">
        <Label htmlFor="prompt-section">Page and section</Label>
        <select
          id="prompt-section"
          className="w-full rounded-md border bg-background p-2 text-sm"
          disabled={busy}
          value={key}
          onChange={(event) => setKey(event.target.value)}
        >
          {pages.map((page) => (
            <optgroup key={page} label={page}>
              {catalog
                .filter((item) => item.page === page)
                .map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.section}
                    {item.legacy ? " (legacy)" : ""}
                    {item.activeRevisionId ? " · customized" : ""}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      {!detail ? (
        <p>Loading prompt…</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                {detail.definition.page} · {detail.definition.section}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Default v{detail.definition.version}</Badge>
                <Badge>
                  {source?.source === "CODE"
                    ? "Code default active"
                    : detail.definition.activeRevisionId && detail.definition.activeCompatible
                      ? "Published database revision active"
                      : "Bundled default active"}
                </Badge>
              </div>
              {detail.definition.legacy && (
                <p className="text-sm text-amber-800">
                  This is a legacy definition. Editing it affects only code paths that still use
                  this prompt.
                </p>
              )}
              {!detail.definition.activeCompatible && (
                <p role="alert" className="text-sm text-amber-800">
                  The published revision targets an older application version. The bundled default
                  is used until a compatible revision is published.
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="prompt-revision">Revision to review or copy</Label>
                <select
                  id="prompt-revision"
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  disabled={busy}
                  value={revisionId}
                  onChange={(event) => {
                    const selected = detail.revisions.find(
                      (item) => item.id === event.target.value,
                    );
                    setRevisionId(selected?.id ?? "");
                    setTemplate(selected?.template ?? detail.definition.template);
                    setChangeNote("");
                    setActionNote("");
                    setNotice(null);
                  }}
                >
                  <option value="">Bundled default</option>
                  {detail.revisions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {formatDate(item.createdAt)} · {item.status.toLowerCase()} · {item.changeNote}
                      {item.id === detail.definition.activeRevisionId ? " · published" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prompt-template">Business instructions</Label>
                <Textarea
                  id="prompt-template"
                  className="h-80 min-h-80 max-h-96 resize-y overflow-y-auto font-mono text-sm"
                  value={template}
                  maxLength={30000}
                  readOnly={!canEdit || busy}
                  onChange={(event) => setTemplate(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Editing creates a new immutable revision. Keep these runtime placeholders:{" "}
                  {detail.definition.variables.map((name) => `{{${name}}}`).join(", ") || "none"}.
                  Project facts, output schemas and tools are controlled by the application.
                </p>
              </div>
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Protected platform rules
                </summary>
                <pre className="mt-3 whitespace-pre-wrap text-xs">{detail.protectedRules}</pre>
                <p className="mt-2 text-xs">
                  Language, source and policy placeholders are also reasserted after the edited
                  instructions.
                </p>
              </details>
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Compare with bundled default
                </summary>
                <pre className="mt-3 whitespace-pre-wrap text-xs">{detail.definition.template}</pre>
              </details>
              {canEdit && (
                <div className="space-y-2">
                  <Label htmlFor="prompt-change-note">What changed?</Label>
                  <Input
                    id="prompt-change-note"
                    value={changeNote}
                    maxLength={1000}
                    disabled={busy}
                    onChange={(event) => setChangeNote(event.target.value)}
                  />
                  <Button
                    disabled={busy || changeNote.trim().length < 3 || !template.trim()}
                    onClick={() => void mutate("/revisions", { template, changeNote }, true)}
                  >
                    Save new draft
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Preview and validation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Use synthetic examples. Previews use the feature’s configured model and consume
                tokens. They do not execute application tools or web search, and do not certify
                production schema or domain validation. Review the behavior before validating,
                including French, English and Arabic where needed.
              </p>
              {dirty && (
                <p className="text-sm text-amber-800">
                  Save your edits as a new draft before testing or publishing.
                </p>
              )}
              {!compatible && (
                <p className="text-sm text-amber-800">
                  Create a new draft against the current default before testing or publishing this
                  older revision.
                </p>
              )}
              {canEdit && (
                <>
                  <div className="flex flex-wrap gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="prompt-language">Example language</Label>
                      <select
                        id="prompt-language"
                        className="rounded-md border bg-background p-2 text-sm"
                        value={language}
                        disabled={busy}
                        onChange={(event) => setLanguage(event.target.value as typeof language)}
                      >
                        <option value="fr">French</option>
                        <option value="en">English</option>
                        <option value="ar">Arabic</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prompt-countries">Example country codes</Label>
                      <Input
                        id="prompt-countries"
                        value={countries}
                        disabled={busy}
                        onChange={(event) => setCountries(event.target.value)}
                        placeholder="MA, FR"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prompt-context">Synthetic example input</Label>
                    <Textarea
                      id="prompt-context"
                      className="min-h-36 max-h-64 overflow-y-auto font-mono"
                      value={context}
                      maxLength={40000}
                      disabled={busy}
                      onChange={(event) => setContext(event.target.value)}
                      placeholder="Paste a synthetic profile, stage material or document excerpt…"
                    />
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy || !ready || !context.trim()}
                    onClick={() =>
                      void mutate(`/revisions/${revisionId}/test`, { language, context, countries })
                    }
                  >
                    {busy ? "Working…" : "Run preview"}
                  </Button>
                </>
              )}
              {revision?.tests.map((test) => (
                <details key={test.id} className="rounded-md border p-3" open>
                  <summary className="cursor-pointer text-sm">
                    {test.language.toUpperCase()} · {test.provider} / {test.model} ·{" "}
                    {formatDate(test.createdAt)}
                  </summary>
                  <pre
                    dir="auto"
                    className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-sm"
                  >
                    {test.output}
                  </pre>
                </details>
              ))}
              {revision?.status === "VALIDATED" && (
                <p className="text-sm">
                  Validated by {revision.validatedById} · {revision.validationNote}
                </p>
              )}
              {(canEdit || canPublish) && (
                <div className="space-y-3 border-t pt-4">
                  <Label htmlFor="prompt-action-note">Validation or publication note</Label>
                  <Textarea
                    id="prompt-action-note"
                    value={actionNote}
                    maxLength={1000}
                    disabled={busy}
                    onChange={(event) => setActionNote(event.target.value)}
                    placeholder="Describe what you reviewed and why this version should be used."
                  />
                  <div className="flex flex-wrap gap-2">
                    {canEdit && (
                      <Button
                        variant="outline"
                        disabled={
                          busy ||
                          !ready ||
                          revision?.status !== "DRAFT" ||
                          !revision.tests.length ||
                          actionNote.trim().length < 8
                        }
                        onClick={() =>
                          void mutate(`/revisions/${revisionId}/validate`, { note: actionNote })
                        }
                      >
                        Validate revision
                      </Button>
                    )}
                    {canPublish && (
                      <>
                        <Button
                          disabled={
                            busy ||
                            !ready ||
                            revision?.status !== "VALIDATED" ||
                            revisionId === detail.definition.activeRevisionId ||
                            actionNote.trim().length < 3
                          }
                          onClick={() =>
                            void mutate("/publish", {
                              revisionId,
                              expectedGeneration: detail.definition.generation,
                              action: detail.publications.some(
                                (event) => event.revisionId === revisionId,
                              )
                                ? "ROLLBACK"
                                : "PUBLISH",
                              note: actionNote,
                            })
                          }
                        >
                          {detail.publications.some((event) => event.revisionId === revisionId)
                            ? revisionId === detail.definition.activeRevisionId
                              ? "Published version selected"
                              : "Roll back to this revision"
                            : "Publish for all organizations"}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={
                            busy ||
                            !detail.definition.activeRevisionId ||
                            actionNote.trim().length < 3
                          }
                          onClick={() =>
                            void mutate("/publish", {
                              revisionId: null,
                              expectedGeneration: detail.definition.generation,
                              action: "RESET",
                              note: actionNote,
                            })
                          }
                        >
                          Restore bundled default
                        </Button>
                      </>
                    )}
                  </div>
                  {!canPublish && (
                    <p className="text-xs text-muted-foreground">
                      A platform administrator must publish validated revisions.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Publication history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.publications.length ? (
                detail.publications.map((event) => (
                  <div className="rounded-md border p-3 text-sm" key={event.id}>
                    <p>
                      {event.action.toLowerCase()} · {formatDate(event.createdAt)} · {event.actorId}
                    </p>
                    <p className="mt-1 text-muted-foreground">{event.note}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No publication yet. The bundled default is active.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
