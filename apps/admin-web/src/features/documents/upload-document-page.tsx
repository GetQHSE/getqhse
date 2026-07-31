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
import { CheckCircle2Icon, FileUpIcon, Loader2Icon } from "lucide-react";
import { type DragEvent, type FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { adminApi, sha256 } from "../../lib/admin-api.js";

const steps = [
  "Select files",
  "Detected metadata",
  "Classification",
  "Version",
  "Processing",
  "Review content",
  "Validate & publish",
];
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
    versionLabel: "1",
    changeType: "initial",
  });
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
              visibility: "platform_internal",
            }),
          });
      const version = await adminApi<{ id: string }>(`/v1/documents/${document.id}/versions`, {
        method: "POST",
        body: JSON.stringify({
          versionLabel: form.versionLabel,
          changeType: form.changeType,
          originalFileName: file.name,
          mimeType: file.type || mimeFor(file.name),
          fileSize: file.size,
          fileHash: checksum,
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
        headers: { "content-type": file.type || mimeFor(file.name), "x-amz-meta-sha256": checksum },
      });
      if (!upload.ok) throw new Error("Object storage rejected the upload.");
      await adminApi(`/v1/documents/${document.id}/versions/${version.id}/confirm-upload`, {
        method: "POST",
        body: "{}",
      });
      setStep(4);
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
    <form className="space-y-6" onSubmit={(event) => void submit(event)}>
      <div>
        <p className="text-sm text-muted-foreground">Knowledge sources / Upload</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {existingDocumentId ? "Upload a new version" : "Ingest a document"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The document remains unavailable downstream until validation and publication.
        </p>
      </div>
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-7">
        {steps.map((label, index) => (
          <li
            key={label}
            className={`rounded-xl border p-3 text-xs ${index <= step ? "border-primary/40 bg-primary/5 text-foreground" : "text-muted-foreground"}`}
          >
            <span className="mb-1 block font-semibold">{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <Progress value={((step + 1) / steps.length) * 100} />
      <Card>
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
                className="grid min-h-56 place-items-center rounded-2xl border-2 border-dashed bg-muted/20 p-8 text-center"
              >
                <div>
                  <FileUpIcon className="mx-auto size-9 text-muted-foreground" />
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
              <Field label="Version label">
                <Input
                  required
                  value={form.versionLabel}
                  onChange={(event) => set("versionLabel", event.target.value)}
                />
              </Field>
              <Field label="Change type">
                <NativeSelect
                  className="w-full"
                  value={form.changeType}
                  onChange={(event) => set("changeType", event.target.value)}
                >
                  {[
                    "initial",
                    "minor_revision",
                    "major_revision",
                    "amendment",
                    "correction",
                    "replacement",
                    "translation",
                  ].map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <div className="md:col-span-2 rounded-xl border p-4 text-sm">
                <p className="font-medium">Immutable source</p>
                <p className="text-muted-foreground">
                  Publishing locks this version. Content or legal-meaning changes require a new
                  version.
                </p>
              </div>
            </div>
          ) : null}
          {step >= 4 ? (
            <div className="grid min-h-48 place-items-center text-center">
              <div>
                {busy ? (
                  <Loader2Icon className="mx-auto size-10 animate-spin text-primary" />
                ) : (
                  <CheckCircle2Icon className="mx-auto size-10 text-primary" />
                )}
                <p className="mt-3 font-medium">
                  {busy ? "Uploading and creating processing jobs…" : "Processing queued"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Security validation runs before extraction, OCR and classification.
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
              <Button type="submit" disabled={busy || !file}>
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
