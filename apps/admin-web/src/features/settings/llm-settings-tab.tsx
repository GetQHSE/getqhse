import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@qhse/ui/components/card";
import { Input } from "@qhse/ui/components/input";
import { Label } from "@qhse/ui/components/label";
import { NativeSelect } from "@qhse/ui/components/native-select";
import { Skeleton } from "@qhse/ui/components/skeleton";
import { Switch } from "@qhse/ui/components/switch";
import {
  llmPromptCacheRetentions,
  llmReasoningEfforts,
  llmServiceTiers,
  llmTextVerbosities,
} from "@qhse/config";
import { useCallback, useEffect, useState } from "react";

import { adminApi } from "../../lib/admin-api.js";

type LlmSettingsValues = Record<string, string | number | boolean | null>;

type LlmSettingsView = {
  effective: LlmSettingsValues;
  overrides: LlmSettingsValues;
  environmentDefaults: LlmSettingsValues;
  environmentKeys: Record<string, string>;
  apiKey: {
    configured: boolean;
    source: "database" | "environment" | "none";
    preview: string | null;
  };
  updatedAt: string | null;
  updatedBy: { id: string; name: string } | null;
};

type Field =
  | { key: string; label: string; hint?: string; type: "text" | "boolean" }
  | { key: string; label: string; hint?: string; type: "number"; nullable?: boolean }
  | { key: string; label: string; hint?: string; type: "select"; options: readonly string[] };

type Group = { title: string; description: string; fields: Field[] };

const groups: Group[] = [
  {
    title: "Models",
    description: "Which model answers each kind of request.",
    fields: [
      { key: "regulatoryModel", label: "Regulatory drafting", type: "text" },
      { key: "regulatoryTriageModel", label: "Regulatory triage", type: "text" },
      { key: "regulatoryVerificationModel", label: "Requirement verification", type: "text" },
      { key: "profileModel", label: "Profile chat", type: "text" },
      { key: "transcriptionModel", label: "Voice note transcription", type: "text" },
    ],
  },
  {
    title: "Request shape",
    description: "How each regulatory call is sent to the provider.",
    fields: [
      {
        key: "regulatoryServiceTier",
        label: "Service tier",
        type: "select",
        options: llmServiceTiers,
        hint: "flex trades latency for roughly half the standard rate.",
      },
      {
        key: "regulatoryReasoningEffort",
        label: "Reasoning effort",
        type: "select",
        options: llmReasoningEfforts,
      },
      {
        key: "regulatoryTextVerbosity",
        label: "Text verbosity",
        type: "select",
        options: llmTextVerbosities,
      },
      {
        key: "regulatoryPromptCacheRetention",
        label: "Prompt cache retention",
        type: "select",
        options: llmPromptCacheRetentions,
      },
      { key: "regulatoryTimeoutMs", label: "Call timeout (ms)", type: "number" },
      {
        key: "regulatoryDraftMaxOutputTokens",
        label: "Drafting max output tokens",
        type: "number",
      },
      {
        key: "regulatoryVerificationMaxOutputTokens",
        label: "Verification max output tokens",
        type: "number",
      },
      { key: "regulatoryTriageMaxOutputTokens", label: "Triage max output tokens", type: "number" },
    ],
  },
  {
    title: "Cost control",
    description:
      "The run budget is a hard ceiling. Leave the per-token rates blank to bill at the published rate for the configured model.",
    fields: [
      {
        key: "regulatoryRunBudgetUsd",
        label: "Analysis run budget (USD)",
        type: "number",
        hint: "Hard ceiling for one regulatory analysis run.",
      },
      {
        key: "regulatoryEvaluationBudgetUsd",
        label: "Evaluation budget (USD)",
        type: "number",
        hint: "Cumulative ceiling per baseline, covering re-runs and job retries.",
      },
      {
        key: "regulatoryInputUsdPerMTok",
        label: "Input USD / Mtok",
        type: "number",
        nullable: true,
      },
      {
        key: "regulatoryCachedInputUsdPerMTok",
        label: "Cached input USD / Mtok",
        type: "number",
        nullable: true,
      },
      {
        key: "regulatoryOutputUsdPerMTok",
        label: "Output USD / Mtok",
        type: "number",
        nullable: true,
      },
      { key: "regulatoryFlexRateMultiplier", label: "Flex rate multiplier", type: "number" },
      {
        key: "conservativeBytesPerToken",
        label: "Conservative bytes per token",
        type: "number",
        hint: "Used to reserve budget before a call. Lowering it over-reserves; raising it risks overspend.",
      },
    ],
  },
  {
    title: "Pipeline",
    description: "Behaviour switches that change what the pipeline attempts.",
    fields: [
      {
        key: "ragEnabled",
        label: "Retrieval-augmented search enabled",
        type: "boolean",
        hint: "Off disables normative search, document indexing and every regulatory analysis.",
      },
      {
        key: "triageIncludeUnsure",
        label: "Keep UNSURE provisions after triage",
        type: "boolean",
        hint: "Off drops anything triage is not confident about, which is cheaper and less thorough.",
      },
    ],
  },
];

const allFields = groups.flatMap((group) => group.fields);

function toInput(value: string | number | boolean | null | undefined): string | boolean {
  if (typeof value === "boolean") return value;
  return value === null || value === undefined ? "" : String(value);
}

export function LlmSettingsTab({ canManage }: { canManage: boolean }) {
  const [view, setView] = useState<LlmSettingsView | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = useCallback((next: LlmSettingsView) => {
    setView(next);
    setValues(
      Object.fromEntries(allFields.map((field) => [field.key, toInput(next.effective[field.key])])),
    );
    setApiKey("");
  }, []);

  const load = useCallback(() => {
    void adminApi<LlmSettingsView>("/v1/llm-settings")
      .then(apply)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unable to load the LLM settings"),
      );
  }, [apply]);
  useEffect(load, [load]);

  async function save() {
    if (!view) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const field of allFields) {
        const current = values[field.key];
        if (current === undefined) continue;
        const parsed = parseValue(field, current);
        // Only changed fields are sent, so a field the administrator never touched stays on the
        // environment instead of being frozen into an override by the act of saving.
        if (!sameValue(parsed, view.effective[field.key] ?? null)) payload[field.key] = parsed;
      }
      if (apiKey.trim()) payload["apiKey"] = apiKey.trim();
      if (!Object.keys(payload).length) {
        setNotice("Nothing to save.");
        return;
      }
      apply(
        await adminApi<LlmSettingsView>("/v1/llm-settings", {
          method: "PUT",
          body: JSON.stringify(payload),
        }),
      );
      setNotice("Saved. Running services pick the change up within a minute.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save the LLM settings");
    } finally {
      setBusy(false);
    }
  }

  async function mutate(body: Record<string, unknown>, message: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      apply(
        await adminApi<LlmSettingsView>("/v1/llm-settings", {
          method: "PUT",
          body: JSON.stringify(body),
        }),
      );
      setNotice(message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save the LLM settings");
    } finally {
      setBusy(false);
    }
  }

  async function resetAll() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      apply(await adminApi<LlmSettingsView>("/v1/llm-settings", { method: "DELETE" }));
      setNotice("All overrides cleared. Every value now comes from the environment.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to reset the LLM settings");
    } finally {
      setBusy(false);
    }
  }

  if (!view) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Provider credentials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={view.apiKey.configured ? "secondary" : "destructive"}>
              {view.apiKey.configured ? "API key configured" : "No API key"}
            </Badge>
            <Badge variant="outline">
              {view.apiKey.source === "database"
                ? "Stored here"
                : view.apiKey.source === "environment"
                  ? "From the environment"
                  : "Not set"}
            </Badge>
            {view.apiKey.preview ? (
              <span className="font-mono text-xs text-muted-foreground">{view.apiKey.preview}</span>
            ) : null}
          </div>
          {canManage ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-64 flex-1 space-y-1.5">
                <Label htmlFor="llm-api-key">OpenAI API key</Label>
                <Input
                  id="llm-api-key"
                  type="password"
                  autoComplete="off"
                  placeholder="sk-…  (leave blank to keep the current key)"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </div>
              {view.apiKey.source === "database" ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      { apiKey: "" },
                      "Stored key removed. The environment key is in use again.",
                    )
                  }
                >
                  Remove stored key
                </Button>
              ) : null}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            The key is encrypted before it is stored and is never sent back to this page.
          </p>
        </CardContent>
      </Card>

      {groups.map((group) => (
        <Card key={group.title}>
          <CardHeader>
            <CardTitle>{group.title}</CardTitle>
            <p className="text-sm text-muted-foreground">{group.description}</p>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            {group.fields.map((field) => {
              const overridden = view.overrides[field.key] !== undefined;
              const environmentValue = view.environmentDefaults[field.key];
              return (
                <div key={field.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`llm-${field.key}`}>{field.label}</Label>
                    {overridden ? (
                      <button
                        type="button"
                        className="text-xs text-violet-700 underline-offset-2 hover:underline disabled:opacity-50"
                        disabled={!canManage || busy}
                        onClick={() =>
                          void mutate(
                            { [field.key]: null },
                            `${field.label} now follows ${view.environmentKeys[field.key]}.`,
                          )
                        }
                      >
                        Use environment value
                      </button>
                    ) : null}
                  </div>
                  {field.type === "boolean" ? (
                    <div className="flex h-9 items-center">
                      <Switch
                        id={`llm-${field.key}`}
                        checked={values[field.key] === true}
                        disabled={!canManage || busy}
                        onCheckedChange={(checked: boolean) =>
                          setValues((previous) => ({ ...previous, [field.key]: checked }))
                        }
                      />
                    </div>
                  ) : field.type === "select" ? (
                    <NativeSelect
                      id={`llm-${field.key}`}
                      className="w-full"
                      value={String(values[field.key] ?? "")}
                      disabled={!canManage || busy}
                      onChange={(event) =>
                        setValues((previous) => ({ ...previous, [field.key]: event.target.value }))
                      }
                    >
                      {field.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <Input
                      id={`llm-${field.key}`}
                      type={field.type === "number" ? "number" : "text"}
                      step="any"
                      value={String(values[field.key] ?? "")}
                      disabled={!canManage || busy}
                      placeholder={
                        field.type === "number" && "nullable" in field && field.nullable
                          ? "published rate"
                          : undefined
                      }
                      onChange={(event) =>
                        setValues((previous) => ({ ...previous, [field.key]: event.target.value }))
                      }
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    {field.hint ? `${field.hint} ` : ""}
                    <span className="font-mono">{view.environmentKeys[field.key]}</span>
                    {environmentValue === null || environmentValue === undefined
                      ? " is unset"
                      : ` resolves to ${String(environmentValue)}`}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {canManage ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {view.updatedAt
              ? `Last changed ${new Date(view.updatedAt).toLocaleString()}${
                  view.updatedBy ? ` by ${view.updatedBy.name}` : ""
                }.`
              : "No override has been saved yet."}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy} onClick={() => void resetAll()}>
              Reset everything to the environment
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function parseValue(field: Field, raw: string | boolean): string | number | boolean | null {
  if (field.type === "boolean") return raw === true;
  const value = String(raw).trim();
  if (field.type !== "number") return value;
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sameValue(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null);
}
