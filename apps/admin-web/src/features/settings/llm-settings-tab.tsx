import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@qhse/ui/components/card";
import { Input } from "@qhse/ui/components/input";
import { Label } from "@qhse/ui/components/label";
import { NativeSelect } from "@qhse/ui/components/native-select";
import { Skeleton } from "@qhse/ui/components/skeleton";
import { Switch } from "@qhse/ui/components/switch";
import {
  anthropicEfforts,
  anthropicSpeeds,
  embeddingProviders,
  googleThinkingLevels,
  languageProviders,
  llmPromptCacheRetentions,
  llmReasoningEfforts,
  llmServiceTiers,
  llmTextVerbosities,
} from "@qhse/config";
import { useCallback, useEffect, useState } from "react";

import { adminApi } from "../../lib/admin-api.js";

type LlmSettingsValues = Record<string, string | number | boolean | null>;
type CustomModel = {
  provider: string;
  model: string;
  label: string;
  capabilities: {
    language: boolean;
    embedding: boolean;
    structuredOutput: boolean;
    tools: boolean;
    webSearch: boolean;
    fileInput: boolean;
  };
  rates: {
    inputUsdPerMTok: number;
    cachedInputUsdPerMTok: number;
    outputUsdPerMTok: number;
  } | null;
};

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
  credentials: Record<
    string,
    { configured: boolean; source: "database" | "environment" | "none"; preview: string | null }
  >;
  catalog: Array<{
    provider: string;
    model: string;
    label: string;
    capabilities: { language: boolean; embedding: boolean };
  }>;
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
      {
        key: "regulatoryProvider",
        label: "Regulatory drafting provider",
        type: "select",
        options: languageProviders,
      },
      { key: "regulatoryModel", label: "Regulatory drafting", type: "text" },
      {
        key: "regulatoryVerificationProvider",
        label: "Requirement verification provider",
        type: "select",
        options: languageProviders,
      },
      { key: "regulatoryVerificationModel", label: "Requirement verification", type: "text" },
      {
        key: "profileProvider",
        label: "Profile chat provider",
        type: "select",
        options: languageProviders,
      },
      { key: "profileModel", label: "Profile chat", type: "text" },
      {
        key: "embeddingProvider",
        label: "Embedding provider",
        type: "select",
        options: embeddingProviders,
      },
      { key: "embeddingModel", label: "Embedding model", type: "text" },
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
        key: "anthropicEffort",
        label: "Claude effort",
        type: "select",
        options: anthropicEfforts,
        hint: "Applied to Anthropic regulatory workloads.",
      },
      { key: "anthropicSpeed", label: "Claude speed", type: "select", options: anthropicSpeeds },
      {
        key: "googleThinkingLevel",
        label: "Gemini thinking level",
        type: "select",
        options: googleThinkingLevels,
      },
      {
        key: "googleThinkingBudget",
        label: "Gemini 2.5 thinking budget",
        type: "number",
        nullable: true,
        hint: "Leave blank to use the selected thinking level.",
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
    ],
  },
  {
    title: "Cost control",
    description:
      "Leave the per-token rates blank to bill at the published rate for the configured model.",
    fields: [
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
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [customModels, setCustomModels] = useState<CustomModel[]>([]);
  const [customDraft, setCustomDraft] = useState({
    provider: "openai",
    model: "",
    label: "",
    capability: "language",
    structuredOutput: true,
    tools: true,
    webSearch: true,
    inputRate: "",
    cachedRate: "",
    outputRate: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = useCallback((next: LlmSettingsView) => {
    setView(next);
    setValues(
      Object.fromEntries(allFields.map((field) => [field.key, toInput(next.effective[field.key])])),
    );
    setApiKeys({});
    setCustomModels((next.effective["customModels"] as unknown as CustomModel[]) ?? []);
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
      const changedKeys = Object.fromEntries(
        Object.entries(apiKeys)
          .filter(([, value]) => value.trim())
          .map(([provider, value]) => [provider, value.trim()]),
      );
      if (Object.keys(changedKeys).length) payload["apiKeys"] = changedKeys;
      if (JSON.stringify(customModels) !== JSON.stringify(view.effective["customModels"] ?? [])) {
        payload["customModels"] = customModels;
      }
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

  async function testProvider(
    provider: string,
    capability: "language" | "embedding",
    model: string,
  ) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await adminApi<{ ok: boolean; latencyMs: number; error: string | null }>(
        `/v1/llm-settings/providers/${provider}/test`,
        { method: "POST", body: JSON.stringify({ capability, model }) },
      );
      if (!result.ok) throw new Error(result.error ?? "Provider test failed");
      setNotice(`${provider} responded successfully in ${result.latencyMs} ms.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Provider test failed");
    } finally {
      setBusy(false);
    }
  }

  function addCustomModel() {
    const model = customDraft.model.trim();
    const label = customDraft.label.trim() || model;
    if (!model) {
      setError("A custom model ID is required.");
      return;
    }
    const rateValues = [customDraft.inputRate, customDraft.cachedRate, customDraft.outputRate];
    const hasRates = rateValues.some((value) => value !== "");
    if (
      hasRates &&
      (rateValues.some((value) => value === "" || !Number.isFinite(Number(value))) ||
        Number(customDraft.inputRate) <= 0 ||
        Number(customDraft.cachedRate) < 0 ||
        Number(customDraft.outputRate) <= 0)
    ) {
      setError(
        "Enter positive input/output rates and a non-negative cached rate, or leave all three blank.",
      );
      return;
    }
    const isLanguage = customDraft.capability === "language";
    setCustomModels((previous) => [
      ...previous.filter(
        (item) => !(item.provider === customDraft.provider && item.model === model),
      ),
      {
        provider: customDraft.provider,
        model,
        label,
        capabilities: {
          language: isLanguage,
          embedding: !isLanguage,
          structuredOutput: isLanguage && customDraft.structuredOutput,
          tools: isLanguage && customDraft.tools,
          webSearch: isLanguage && customDraft.webSearch,
          fileInput: isLanguage,
        },
        rates: hasRates
          ? {
              inputUsdPerMTok: Number(customDraft.inputRate),
              cachedInputUsdPerMTok: Number(customDraft.cachedRate),
              outputUsdPerMTok: Number(customDraft.outputRate),
            }
          : null,
      },
    ]);
    setCustomDraft((previous) => ({ ...previous, model: "", label: "" }));
    setError(null);
  }

  function fieldIsRelevant(field: Field): boolean {
    const selectedProviders = new Set(
      [
        values["profileProvider"],
        values["regulatoryProvider"],
        values["regulatoryVerificationProvider"],
      ].map(String),
    );
    if (field.key.startsWith("anthropic")) return selectedProviders.has("anthropic");
    if (field.key.startsWith("google")) return selectedProviders.has("google");
    if (
      [
        "regulatoryServiceTier",
        "regulatoryReasoningEffort",
        "regulatoryTextVerbosity",
        "regulatoryPromptCacheRetention",
      ].includes(field.key)
    ) {
      return selectedProviders.has("openai");
    }
    return true;
  }

  if (!view) return <Skeleton className="h-96 w-full" />;

  const configuredModels = [
    {
      label: "Profile chat",
      capability: "language" as const,
      provider: String(values["profileProvider"]),
      model: String(values["profileModel"]),
    },
    {
      label: "Regulatory drafting",
      capability: "language" as const,
      provider: String(values["regulatoryProvider"]),
      model: String(values["regulatoryModel"]),
    },
    {
      label: "Regulatory verification",
      capability: "language" as const,
      provider: String(values["regulatoryVerificationProvider"]),
      model: String(values["regulatoryVerificationModel"]),
    },
    {
      label: "Embeddings",
      capability: "embedding" as const,
      provider: String(values["embeddingProvider"]),
      model: String(values["embeddingModel"]),
    },
  ];

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
          {languageProviders.map((provider) => {
            const credential = view.credentials[provider]!;
            return (
              <div key={provider} className="space-y-2 rounded-xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium capitalize">{provider}</span>
                  <Badge variant={credential.configured ? "secondary" : "destructive"}>
                    {credential.configured ? "Configured" : "No API key"}
                  </Badge>
                  <Badge variant="outline">{credential.source}</Badge>
                  {credential.preview ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {credential.preview}
                    </span>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-64 flex-1 space-y-1.5">
                      <Label htmlFor={`llm-api-key-${provider}`}>{provider} API key</Label>
                      <Input
                        id={`llm-api-key-${provider}`}
                        type="password"
                        autoComplete="off"
                        placeholder="Leave blank to keep the current key"
                        value={apiKeys[provider] ?? ""}
                        onChange={(event) =>
                          setApiKeys((previous) => ({
                            ...previous,
                            [provider]: event.target.value,
                          }))
                        }
                      />
                    </div>
                    {credential.source === "database" ? (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            { apiKeys: { [provider]: "" } },
                            `Stored ${provider} key removed.`,
                          )
                        }
                      >
                        Remove stored key
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            The key is encrypted before it is stored and is never sent back to this page.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configured model tests</CardTitle>
          <p className="text-sm text-muted-foreground">
            Each workload is tested against exactly the provider and model selected below.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {configuredModels.map((selection) => (
            <div
              key={selection.label}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div>
                <p className="text-sm font-medium">{selection.label}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {selection.provider}:{selection.model}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={busy || !view.credentials[selection.provider]?.configured}
                onClick={() =>
                  void testProvider(selection.provider, selection.capability, selection.model)
                }
              >
                Test
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom model catalog</CardTitle>
          <p className="text-sm text-muted-foreground">
            Tested models are built in. Add a custom provider model here before selecting it;
            regulatory models require all three token rates.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {customModels.map((item) => (
            <div
              key={`${item.provider}:${item.model}`}
              className="flex items-center justify-between rounded-xl border p-3"
            >
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {item.provider}:{item.model}
                </p>
              </div>
              {canManage ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    setCustomModels((previous) => previous.filter((model) => model !== item))
                  }
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
          {canManage ? (
            <div className="grid gap-3 rounded-xl border p-4 md:grid-cols-3">
              <NativeSelect
                value={customDraft.provider}
                onChange={(event) =>
                  setCustomDraft((previous) => ({ ...previous, provider: event.target.value }))
                }
              >
                {(customDraft.capability === "embedding"
                  ? embeddingProviders
                  : languageProviders
                ).map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                value={customDraft.capability}
                onChange={(event) =>
                  setCustomDraft((previous) => ({
                    ...previous,
                    capability: event.target.value,
                    provider:
                      event.target.value === "embedding" && previous.provider === "anthropic"
                        ? "openai"
                        : previous.provider,
                  }))
                }
              >
                <option value="language">Language</option>
                <option value="embedding">Embedding</option>
              </NativeSelect>
              <Input
                placeholder="Model ID"
                value={customDraft.model}
                onChange={(event) =>
                  setCustomDraft((previous) => ({ ...previous, model: event.target.value }))
                }
              />
              {customDraft.capability === "language" ? (
                <div className="col-span-full flex flex-wrap gap-5 text-sm">
                  {(["structuredOutput", "tools", "webSearch"] as const).map((capability) => (
                    <label key={capability} className="flex items-center gap-2">
                      <Switch
                        checked={customDraft[capability]}
                        onCheckedChange={(checked: boolean) =>
                          setCustomDraft((previous) => ({ ...previous, [capability]: checked }))
                        }
                      />
                      {capability}
                    </label>
                  ))}
                </div>
              ) : null}
              <Input
                placeholder="Display label"
                value={customDraft.label}
                onChange={(event) =>
                  setCustomDraft((previous) => ({ ...previous, label: event.target.value }))
                }
              />
              <Input
                type="number"
                step="any"
                placeholder="Input USD / Mtok"
                value={customDraft.inputRate}
                onChange={(event) =>
                  setCustomDraft((previous) => ({ ...previous, inputRate: event.target.value }))
                }
              />
              <Input
                type="number"
                step="any"
                placeholder="Cached input USD / Mtok"
                value={customDraft.cachedRate}
                onChange={(event) =>
                  setCustomDraft((previous) => ({ ...previous, cachedRate: event.target.value }))
                }
              />
              <Input
                type="number"
                step="any"
                placeholder="Output USD / Mtok"
                value={customDraft.outputRate}
                onChange={(event) =>
                  setCustomDraft((previous) => ({ ...previous, outputRate: event.target.value }))
                }
              />
              <Button type="button" variant="outline" onClick={addCustomModel}>
                Add custom model
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {groups.map((group) => (
        <Card key={group.title}>
          <CardHeader>
            <CardTitle>{group.title}</CardTitle>
            <p className="text-sm text-muted-foreground">{group.description}</p>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            {group.fields.filter(fieldIsRelevant).map((field) => {
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
                    <>
                      <Input
                        id={`llm-${field.key}`}
                        type={field.type === "number" ? "number" : "text"}
                        step="any"
                        list={
                          field.key.toLowerCase().includes("model") &&
                          field.key !== "transcriptionModel"
                            ? `catalog-${field.key}`
                            : undefined
                        }
                        value={String(values[field.key] ?? "")}
                        disabled={!canManage || busy}
                        placeholder={
                          field.type === "number" && "nullable" in field && field.nullable
                            ? "published rate"
                            : undefined
                        }
                        onChange={(event) =>
                          setValues((previous) => ({
                            ...previous,
                            [field.key]: event.target.value,
                          }))
                        }
                      />
                      {field.key.toLowerCase().includes("model") &&
                      field.key !== "transcriptionModel" ? (
                        <datalist id={`catalog-${field.key}`}>
                          {view.catalog
                            .filter((entry) =>
                              field.key === "embeddingModel"
                                ? entry.capabilities.embedding
                                : entry.capabilities.language,
                            )
                            .map((entry) => (
                              <option key={`${entry.provider}:${entry.model}`} value={entry.model}>
                                {entry.label} · {entry.provider}
                              </option>
                            ))}
                        </datalist>
                      ) : null}
                    </>
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
