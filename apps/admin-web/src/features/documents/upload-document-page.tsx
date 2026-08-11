import { Button } from "@qhse/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@qhse/ui/components/card";
import { Input } from "@qhse/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@qhse/ui/components/native-select";
import { Progress } from "@qhse/ui/components/progress";
import { Textarea } from "@qhse/ui/components/textarea";
import { FileUpIcon, Loader2Icon } from "lucide-react";
import { type DragEvent, type FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { adminApi, sha256 } from "../../lib/admin-api.js";

const steps = ["Select files", "Detected metadata", "Classification", "Rights & source"];
const accepted = ".pdf,.docx,.txt,.md,.markdown,.csv,.xlsx,.png,.jpg,.jpeg,.tif,.tiff";

export function UploadDocumentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const existingDocumentId = searchParams.get("document");
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    referenceNumber: "",
    issuingAuthority: "",
    description: "",
    documentType: "standard",
    sourceType: "official",
    language: "fr",
    countryCode: "MA",
    sourceEdition: "",
    effectiveDate: "",
    sourceUrl: "",
    changeSummary: "",
  });
  const [rights, setRights] = useState({
    storage: false,
    extraction: false,
    embedding: false,
    aiProcessing: false,
    externalProviderProcessing: false,
    excerptDisplay: false,
    export: false,
  });
  const allRightsConfirmed = Object.values(rights).every(Boolean);
  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const choose = (files: FileList | null) => {
    const next = files?.[0] ?? null;
    setFile(next);
    if (next && !form.title) set("title", next.name.replace(/\.[^.]+$/, ""));
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    choose(event.dataTransfer.files);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return setError("Select a supported file first.");
    setBusy(true);
    setError(null);
    try {
      const checksum = await sha256(file);
      const document = existingDocumentId
        ? { id: existingDocumentId }
        : await adminApi<{ id: string }>("/v1/documents", {
            method: "POST",
            body: JSON.stringify({
              title: form.title,
              referenceNumber: form.referenceNumber || undefined,
              issuingAuthority: form.issuingAuthority || undefined,
              description: form.description || undefined,
              documentType: form.documentType,
              sourceType: form.sourceType,
              language: form.language,
              countryCode: form.countryCode,
              visibility:
                form.sourceType === "licensed" ? "organization_available" : "public_reference",
            }),
          });
      const version = await adminApi<{ id: string }>(`/v1/documents/${document.id}/versions`, {
        method: "POST",
        body: JSON.stringify({
          sourceEdition: form.sourceEdition || undefined,
          effectiveDate: form.effectiveDate || undefined,
          sourceUrl: form.sourceUrl || undefined,
          changeSummary: form.changeSummary || undefined,
          originalFileName: file.name,
          mimeType: file.type || mimeFor(file.name),
          fileSize: file.size,
          fileHash: checksum,
          rights,
          allowDuplicate: false,
        }),
      });
      const signed = await adminApi<{ url: string; fileId: string }>(
        `/v1/documents/${document.id}/versions/${version.id}/upload-url`,
        {
          method: "POST",
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || mimeFor(file.name),
            fileSize: file.size,
            checksum,
          }),
        },
      );
      const upload = await fetch(signed.url, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type || mimeFor(file.name) },
      });
      if (!upload.ok) throw new Error("Object storage rejected the upload.");
      await adminApi(`/v1/documents/${document.id}/versions/${version.id}/confirm-upload`, {
        method: "POST",
        body: "{}",
      });
      await adminApi(`/v1/documents/${document.id}/versions/${version.id}/process`, {
        method: "POST",
        body: JSON.stringify({ force: false }),
      });
      void navigate(`/documents/${document.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mx-auto w-full max-w-5xl space-y-6" onSubmit={(event) => void submit(event)}>
      <div>
        <p className="text-sm font-medium text-violet-700">Knowledge sources / Upload</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {existingDocumentId ? "Replace document" : "Upload document"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          The document remains unavailable downstream until validation and publication.
        </p>
      </div>
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {steps.map((label, index) => (
          <li
            key={label}
            className={`rounded-2xl border p-3 text-xs transition ${index <= step ? "border-violet-200 bg-violet-50 text-violet-950" : "border-slate-200 bg-white text-slate-400"}`}
          >
            <span className="mb-1 block font-semibold">{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <Progress value={((step + 1) / steps.length) * 100} />
      <Card className="rounded-3xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>{steps[step]}</CardTitle>
          <CardDescription>
            {step === 0
              ? "Files are checked for type, size and SHA-256 duplicates before processing."
              : "Review detected values; automatic suggestions are never approved implicitly."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 0 ? (
            <div className="space-y-4">
              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={drop}
                className="grid min-h-56 place-items-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center transition hover:border-violet-300 hover:bg-violet-50/30"
              >
                <div>
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-violet-100 text-violet-700">
                    <FileUpIcon className="size-6" />
                  </span>
                  <p className="mt-3 font-medium">Drop a file here</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    PDF, Office, text, spreadsheet or image · up to 50 MB
                  </p>
                  <Input
                    className="mt-4"
                    type="file"
                    accept={accepted}
                    onChange={(event) => choose(event.target.files)}
                  />
                  {file ? (
                    <p className="mt-3 text-sm font-medium">
                      {file.name} · {(file.size / 1_048_576).toFixed(2)} MB
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          {step === 1 ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Title">
                <Input
                  required
                  value={form.title}
                  onChange={(event) => set("title", event.target.value)}
                />
              </Field>
              <Field label="Reference number">
                <Input
                  value={form.referenceNumber}
                  onChange={(event) => set("referenceNumber", event.target.value)}
                />
              </Field>
              <Field label="Issuing authority">
                <Input
                  value={form.issuingAuthority}
                  onChange={(event) => set("issuingAuthority", event.target.value)}
                />
              </Field>
              <Field label="Language">
                <Input
                  value={form.language}
                  onChange={(event) => set("language", event.target.value)}
                />
              </Field>
              <Field label="Description" wide>
                <Textarea
                  value={form.description}
                  onChange={(event) => set("description", event.target.value)}
                />
              </Field>
            </div>
          ) : null}
          {step === 2 ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Document type">
                <NativeSelect
                  className="w-full"
                  value={form.documentType}
                  onChange={(event) => set("documentType", event.target.value)}
                >
                  {[
                    "standard",
                    "law",
                    "dahir",
                    "decree",
                    "order",
                    "circular",
                    "regulation",
                    "guideline",
                    "procedure",
                    "manual",
                    "checklist",
                    "template",
                    "methodology",
                    "technical_reference",
                    "knowledge",
                    "other",
                  ].map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Source type">
                <NativeSelect
                  className="w-full"
                  value={form.sourceType}
                  onChange={(event) => set("sourceType", event.target.value)}
                >
                  {[
                    "official",
                    "licensed",
                    "internal",
                    "customer_provided",
                    "public_reference",
                    "other",
                  ].map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Country">
                <Input
                  maxLength={2}
                  value={form.countryCode}
                  onChange={(event) => set("countryCode", event.target.value.toUpperCase())}
                />
              </Field>
              <div className="md:col-span-3 rounded-xl border bg-amber-50 p-4 text-sm text-amber-900">
                Classification is a reviewer decision. Worker suggestions will appear separately
                after processing.
              </div>
            </div>
          ) : null}
          {step === 3 ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Official edition">
                <Input
                  value={form.sourceEdition}
                  onChange={(event) => set("sourceEdition", event.target.value)}
                  placeholder="e.g. ISO 9001:2015"
                />
              </Field>
              <Field label="Effective date">
                <Input
                  type="date"
                  value={form.effectiveDate}
                  onChange={(event) => set("effectiveDate", event.target.value)}
                />
              </Field>
              <Field label="Official source URL" wide>
                <Input
                  type="url"
                  value={form.sourceUrl}
                  onChange={(event) => set("sourceUrl", event.target.value)}
                  placeholder="https://…"
                />
              </Field>
              <Field label="Change summary" wide>
                <Textarea
                  value={form.changeSummary}
                  onChange={(event) => set("changeSummary", event.target.value)}
                  placeholder={
                    existingDocumentId
                      ? "What changed in this replacement?"
                      : "Optional source notes"
                  }
                />
              </Field>
              <div className="md:col-span-2 space-y-3 rounded-xl border p-4 text-sm">
                <div>
                  <p className="font-medium">Rights confirmation</p>
                  <p className="text-muted-foreground">
                    Confirm each permitted use for this source. Nothing is enabled by default.
                  </p>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {(
                    [
                      ["storage", "Store the immutable source"],
                      ["extraction", "Extract and structure its text"],
                      ["embedding", "Create search embeddings"],
                      ["aiProcessing", "Process it with AI"],
                      ["externalProviderProcessing", "Send derived text to OpenAI"],
                      ["excerptDisplay", "Display bounded source excerpts"],
                      ["export", "Export source requirements to registers"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-start gap-2 rounded-lg border p-3">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4"
                        checked={rights[key]}
                        onChange={(event) =>
                          setRights((current) => ({ ...current, [key]: event.target.checked }))
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-muted-foreground">
                  The platform assigns the internal revision automatically. Replacements never
                  overwrite a published source or its citations.
                </p>
              </div>
            </div>
          ) : null}
          {error ? (
            <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-between border-t pt-5">
            <Button
              type="button"
              variant="outline"
              disabled={step === 0 || busy}
              onClick={() => setStep((value) => value - 1)}
            >
              Back
            </Button>
            {step < 3 ? (
              <Button
                type="button"
                disabled={step === 0 && !file}
                onClick={() => setStep((value) => value + 1)}
              >
                Continue
              </Button>
            ) : (
              <Button
                className="rounded-xl bg-violet-600 text-white hover:bg-violet-500"
                type="submit"
                disabled={busy || !file || !allRightsConfirmed}
              >
                {busy ? <Loader2Icon className="animate-spin" /> : <FileUpIcon />} Upload and
                process
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`space-y-1.5 text-sm ${wide ? "md:col-span-2" : ""}`}>
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function mimeFor(fileName: string) {
  const ext = fileName.split(".").at(-1)?.toLowerCase();
  return (
    (
      {
        pdf: "application/pdf",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        txt: "text/plain",
        md: "text/markdown",
        markdown: "text/markdown",
        csv: "text/csv",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        tif: "image/tiff",
        tiff: "image/tiff",
      } as Record<string, string>
    )[ext ?? ""] ?? "application/octet-stream"
  );
}
