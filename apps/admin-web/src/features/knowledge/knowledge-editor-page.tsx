import { createAiKnowledgeExampleSchema, type AiKnowledgeFeature } from "@qhse/contracts";
import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@qhse/ui/components/card";
import { Input } from "@qhse/ui/components/input";
import { Label } from "@qhse/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@qhse/ui/components/native-select";
import { Textarea } from "@qhse/ui/components/textarea";
import { ArrowLeftIcon, CheckCircle2Icon, RefreshCwIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAdminAuth } from "../../auth.js";
import { adminApi } from "../../lib/admin-api.js";
import { featurePath, featureTitle, type KnowledgeExample } from "./knowledge-types.js";

type FormState = {
  title: string;
  scenarioSummary: string;
  guidance: string;
  jurisdiction: string;
  language: "fr" | "ar";
  tags: string;
  rating: string;
  includedLaws: string;
  excludedLaws: string;
  expectedResult: "CONFORMING" | "PARTIAL" | "NON_CONFORMING";
  evaluationSignal: "CORRECTION" | "COMMENT";
  lawReference: string;
  lawTitle: string;
  requirementSummary: string;
  rationale: string;
  remediationGuidance: string;
};

const emptyForm: FormState = {
  title: "",
  scenarioSummary: "",
  guidance: "",
  jurisdiction: "MA",
  language: "fr",
  tags: "",
  rating: "",
  includedLaws: "",
  excludedLaws: "",
  expectedResult: "PARTIAL",
  evaluationSignal: "CORRECTION",
  lawReference: "",
  lawTitle: "",
  requirementSummary: "",
  rationale: "",
  remediationGuidance: "",
};

export function KnowledgeEditorPage({ feature }: { feature: AiKnowledgeFeature }) {
  const { id } = useParams();
  const isNew = id === undefined || id === "new";
  const { user } = useAdminAuth();
  const canManage = user?.platformRole !== "support";
  const navigate = useNavigate();
  const [example, setExample] = useState<KnowledgeExample | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew || !id) return;
    void adminApi<KnowledgeExample>(`/v1/knowledge/examples/${id}`)
      .then((loaded) => {
        if (loaded.feature !== feature)
          throw new Error("Knowledge feature does not match this page");
        setExample(loaded);
        setForm(fromExample(loaded));
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Unable to load example"),
      );
  }, [feature, id, isNew]);

  const set = (key: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function save() {
    if (!canManage) return;
    setBusy(true);
    setError(null);
    try {
      const full = buildInput(feature, form);
      const parsed = createAiKnowledgeExampleSchema.parse(full);
      const body = isNew ? parsed : knowledgeUpdate(parsed);
      const saved = await adminApi<KnowledgeExample>(
        isNew ? "/v1/knowledge/examples" : `/v1/knowledge/examples/${id}`,
        { method: isNew ? "POST" : "PATCH", body: JSON.stringify(body) },
      );
      setExample(saved);
      if (isNew) void navigate(`/knowledge/${featurePath(feature)}/${saved.id}`, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save example");
    } finally {
      setBusy(false);
    }
  }

  async function action(path: "approve" | "retry-embedding") {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      setExample(
        await adminApi<KnowledgeExample>(`/v1/knowledge/examples/${id}/${path}`, {
          method: "POST",
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update example");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!id || !window.confirm("Permanently delete this knowledge example? This cannot be undone."))
      return;
    setBusy(true);
    try {
      await adminApi(`/v1/knowledge/examples/${id}`, { method: "DELETE" });
      void navigate(`/knowledge/${featurePath(feature)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete example");
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"
            to={`/knowledge/${featurePath(feature)}`}
          >
            <ArrowLeftIcon className="size-4" /> {featureTitle(feature)}
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {isNew ? "Add knowledge example" : (example?.title ?? "Knowledge example")}
          </h1>
          {!isNew && example ? (
            <div className="mt-2 flex gap-2">
              <Badge>{example.status}</Badge>
              <Badge variant="outline">Embedding: {example.embeddingStatus}</Badge>
              <Badge variant="outline">{example.source.replaceAll("_", " ")}</Badge>
            </div>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {example?.embeddingError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {example.embeddingError}
        </div>
      ) : null}

      <Card className="rounded-3xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Sanitized AI-visible content</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <Field label="Title">
            <Input
              value={form.title}
              disabled={!canManage}
              onChange={(event) => set("title", event.target.value)}
            />
          </Field>
          <Field label="Tags (comma separated)">
            <Input
              value={form.tags}
              disabled={!canManage}
              onChange={(event) => set("tags", event.target.value)}
            />
          </Field>
          <Field label="Jurisdiction">
            <Input
              value={form.jurisdiction}
              maxLength={2}
              disabled={!canManage}
              onChange={(event) => set("jurisdiction", event.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Language">
            <NativeSelect
              value={form.language}
              disabled={!canManage}
              onChange={(event) => set("language", event.target.value)}
            >
              <NativeSelectOption value="fr">French</NativeSelectOption>
              <NativeSelectOption value="ar">Arabic</NativeSelectOption>
            </NativeSelect>
          </Field>
          <div className="md:col-span-2">
            <Field label="Scenario summary">
              <Textarea
                rows={4}
                value={form.scenarioSummary}
                disabled={!canManage}
                onChange={(event) => set("scenarioSummary", event.target.value)}
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Curated guidance">
              <Textarea
                rows={4}
                value={form.guidance}
                disabled={!canManage}
                onChange={(event) => set("guidance", event.target.value)}
              />
            </Field>
          </div>
          {feature === "DISCOVERY" ? (
            <DiscoveryFields form={form} set={set} disabled={!canManage} />
          ) : (
            <EvaluationFields form={form} set={set} disabled={!canManage} />
          )}
        </CardContent>
      </Card>

      {!isNew && example?.sourceOrganization ? (
        <Card className="rounded-3xl border-slate-200">
          <CardHeader>
            <CardTitle>Internal provenance</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-700">
            <Link
              className="font-medium text-violet-700"
              to={`/organizations/${example.sourceOrganization.id}`}
            >
              {example.sourceOrganization.name}
            </Link>
            {example.sourceProject ? (
              <>
                {" "}
                ·{" "}
                <Link
                  className="font-medium text-violet-700"
                  to={`/organizations/${example.sourceOrganization.id}/projects/${example.sourceProject.id}`}
                >
                  {example.sourceProject.name}
                </Link>
              </>
            ) : null}
            {example.sourceAnalysisReview?.comment ? (
              <p className="mt-3 whitespace-pre-wrap">
                Customer feedback: {example.sourceAnalysisReview.comment}
              </p>
            ) : null}
            {example.sourceRegulatoryEvaluation?.comment ? (
              <p className="mt-3 whitespace-pre-wrap">
                Human comment: {example.sourceRegulatoryEvaluation.comment}
              </p>
            ) : null}
            <p className="mt-3 text-xs text-slate-500">
              Provenance is displayed to administrators only and is excluded from embeddings and AI
              prompts.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {canManage ? (
        <div className="flex flex-wrap justify-between gap-3">
          {!isNew ? (
            <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
              <Trash2Icon /> Permanently delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {!isNew && example?.embeddingStatus === "FAILED" ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void action("retry-embedding")}
              >
                <RefreshCwIcon /> Retry embedding
              </Button>
            ) : null}
            {!isNew && example?.status === "DRAFT" && example.embeddingStatus !== "PROCESSING" ? (
              <Button variant="outline" disabled={busy} onClick={() => void action("approve")}>
                <CheckCircle2Icon /> Approve & embed
              </Button>
            ) : null}
            <Button disabled={busy} onClick={() => void save()}>
              <SaveIcon /> {busy ? "Saving…" : "Save draft"}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function DiscoveryFields({
  form,
  set,
  disabled,
}: {
  form: FormState;
  set: (key: keyof FormState, value: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      <Field label="Rating">
        <NativeSelect
          value={form.rating}
          disabled={disabled}
          onChange={(event) => set("rating", event.target.value)}
        >
          <NativeSelectOption value="">No rating</NativeSelectOption>
          {[0, 1, 2, 3, 4, 5].map((value) => (
            <NativeSelectOption key={value} value={String(value)}>
              {value}/5
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <div className="md:col-span-2">
        <Field label="Included laws (reference | title | reason)">
          <Textarea
            rows={6}
            value={form.includedLaws}
            disabled={disabled}
            onChange={(event) => set("includedLaws", event.target.value)}
          />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field label="Excluded laws (reference | title | reason)">
          <Textarea
            rows={6}
            value={form.excludedLaws}
            disabled={disabled}
            onChange={(event) => set("excludedLaws", event.target.value)}
          />
        </Field>
      </div>
    </>
  );
}

function EvaluationFields({
  form,
  set,
  disabled,
}: {
  form: FormState;
  set: (key: keyof FormState, value: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      <Field label="Expected result">
        <NativeSelect
          value={form.expectedResult}
          disabled={disabled}
          onChange={(event) => set("expectedResult", event.target.value)}
        >
          {["CONFORMING", "PARTIAL", "NON_CONFORMING"].map((value) => (
            <NativeSelectOption key={value} value={value}>
              {value}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Signal">
        <NativeSelect
          value={form.evaluationSignal}
          disabled={disabled}
          onChange={(event) => set("evaluationSignal", event.target.value)}
        >
          <NativeSelectOption value="CORRECTION">Correction</NativeSelectOption>
          <NativeSelectOption value="COMMENT">Comment</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field label="Law reference">
        <Input
          value={form.lawReference}
          disabled={disabled}
          onChange={(event) => set("lawReference", event.target.value)}
        />
      </Field>
      <Field label="Law title">
        <Input
          value={form.lawTitle}
          disabled={disabled}
          onChange={(event) => set("lawTitle", event.target.value)}
        />
      </Field>
      <div className="md:col-span-2">
        <Field label="Requirement summary">
          <Textarea
            rows={4}
            value={form.requirementSummary}
            disabled={disabled}
            onChange={(event) => set("requirementSummary", event.target.value)}
          />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field label="Expected rationale">
          <Textarea
            rows={4}
            value={form.rationale}
            disabled={disabled}
            onChange={(event) => set("rationale", event.target.value)}
          />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field label="Remediation guidance">
          <Textarea
            rows={4}
            value={form.remediationGuidance}
            disabled={disabled}
            onChange={(event) => set("remediationGuidance", event.target.value)}
          />
        </Field>
      </div>
    </>
  );
}

function parseLaws(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [reference, title, reason] = line.split("|").map((part) => part.trim());
      if (!title || !reason) throw new Error("Each law must use: reference | title | reason");
      return { reference: reference || null, title, reason };
    });
}

function buildInput(feature: AiKnowledgeFeature, form: FormState) {
  const common = {
    feature,
    title: form.title,
    scenarioSummary: form.scenarioSummary,
    guidance: form.guidance.trim() || null,
    jurisdiction: form.jurisdiction,
    language: form.language,
    tags: form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
  return feature === "DISCOVERY"
    ? {
        ...common,
        rating: form.rating === "" ? null : Number(form.rating),
        payload: {
          includedLaws: parseLaws(form.includedLaws),
          excludedLaws: parseLaws(form.excludedLaws),
        },
      }
    : {
        ...common,
        expectedResult: form.expectedResult,
        evaluationSignal: form.evaluationSignal,
        payload: {
          lawReference: form.lawReference.trim() || null,
          lawTitle: form.lawTitle,
          requirementSummary: form.requirementSummary,
          rationale: form.rationale,
          remediationGuidance: form.remediationGuidance.trim() || null,
        },
      };
}

function fromExample(example: KnowledgeExample): FormState {
  const laws = (key: string) =>
    Array.isArray(example.payload[key])
      ? (example.payload[key] as Array<{ reference: string | null; title: string; reason: string }>)
          .map((law) => `${law.reference ?? ""} | ${law.title} | ${law.reason}`)
          .join("\n")
      : "";
  return {
    ...emptyForm,
    title: example.title,
    scenarioSummary: example.scenarioSummary,
    guidance: example.guidance ?? "",
    jurisdiction: example.jurisdiction,
    language: example.language,
    tags: example.tags.join(", "),
    rating: example.rating === null ? "" : String(example.rating),
    includedLaws: laws("includedLaws"),
    excludedLaws: laws("excludedLaws"),
    expectedResult: example.expectedResult ?? "PARTIAL",
    evaluationSignal: example.evaluationSignal ?? "CORRECTION",
    lawReference: payloadText(example.payload["lawReference"]),
    lawTitle: payloadText(example.payload["lawTitle"]),
    requirementSummary: payloadText(example.payload["requirementSummary"]),
    rationale: payloadText(example.payload["rationale"]),
    remediationGuidance: payloadText(example.payload["remediationGuidance"]),
  };
}

function knowledgeUpdate(input: ReturnType<typeof createAiKnowledgeExampleSchema.parse>) {
  const { feature, ...update } = input;
  void feature;
  return update;
}

function payloadText(value: unknown): string {
  return typeof value === "string" ? value : "";
}
