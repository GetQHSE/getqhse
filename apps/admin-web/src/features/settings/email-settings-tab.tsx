import type { EmailSettingsView, EmailType } from "@qhse/contracts";
import { emailTypes } from "@qhse/contracts";
import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@qhse/ui/components/card";
import { Input } from "@qhse/ui/components/input";
import { CheckIcon, ClipboardIcon, MailCheckIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { adminApi } from "../../lib/admin-api.js";

const labels: Record<EmailType, string> = {
  ORGANIZATION_INVITATION: "Organization invitation",
  REGULATORY_CLARIFICATION_REQUIRED: "Clarification required",
  REGULATORY_REVIEW_READY: "Regulatory review ready",
  REGULATORY_IMPACT: "New regulatory impact",
  REGULATORY_ANALYSIS_FAILED: "Regulatory analysis failed",
  REGULATORY_ACTION_DUE_SOON: "Regulatory action due soon",
  REGULATORY_ACTION_OVERDUE: "Regulatory action overdue",
};

export function EmailSettingsTab({ canManage }: { canManage: boolean }) {
  const [view, setView] = useState<EmailSettingsView | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [templateIds, setTemplateIds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await adminApi<EmailSettingsView>("/v1/email-settings");
    setView(next);
    setTemplateIds(
      Object.fromEntries(
        emailTypes.map((type) => [type, next.templates[type].templateId?.toString() ?? ""]),
      ),
    );
    setApiKey("");
  }, []);

  useEffect(() => {
    void load().catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : "Unable to load email settings"),
    );
  }, [load]);

  async function save() {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const templates = Object.fromEntries(
        emailTypes.map((type) => {
          const value = templateIds[type]?.trim() ?? "";
          return [type, value ? Number(value) : null];
        }),
      );
      const next = await adminApi<EmailSettingsView>("/v1/email-settings", {
        method: "PUT",
        body: JSON.stringify({ ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), templates }),
      });
      setView(next);
      setApiKey("");
      setNotice("Email settings saved and configured templates validated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save email settings");
    } finally {
      setBusy(null);
    }
  }

  async function action(type: EmailType, operation: "validate" | "test") {
    setBusy(`${operation}-${type}`);
    setError(null);
    setNotice(null);
    try {
      await adminApi(`/v1/email-settings/templates/${type}/${operation}`, { method: "POST" });
      await load();
      setNotice(
        operation === "test"
          ? `Test email sent to the signed-in administrator.`
          : `${labels[type]} validated.`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Unable to ${operation} template`);
    } finally {
      setBusy(null);
    }
  }

  if (!view) return <p className="text-sm text-muted-foreground">Loading email settings…</p>;

  return (
    <div className="space-y-5">
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Brevo connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={view.credential.configured ? "secondary" : "destructive"}>
              {view.credential.configured ? "API key configured" : "API key missing"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {view.credential.preview ?? "No key"} · source: {view.credential.source}
            </span>
          </div>
          {canManage ? (
            <label className="block max-w-xl space-y-2 text-sm font-medium">
              Replace Brevo API key
              <Input
                type="password"
                autoComplete="new-password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Leave blank to keep the current key"
              />
            </label>
          ) : null}
        </CardContent>
      </Card>

      {emailTypes.map((type) => {
        const setting = view.templates[type];
        const configured = setting.templateId !== null;
        return (
          <Card key={type}>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>{labels[type]}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{type}</p>
              </div>
              <Badge variant={configured ? "secondary" : "outline"}>
                {configured ? `Template #${setting.templateId}` : "Not configured"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="block max-w-xs space-y-2 text-sm font-medium">
                Brevo template ID
                <Input
                  type="number"
                  min={1}
                  disabled={!canManage}
                  value={templateIds[type] ?? ""}
                  onChange={(event) =>
                    setTemplateIds((current) => ({ ...current, [type]: event.target.value }))
                  }
                  placeholder="e.g. 42"
                />
              </label>
              {setting.metadata ? (
                <div className="rounded-xl bg-slate-50 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckIcon className="size-4 text-emerald-600" />
                    {setting.metadata.name}
                    <Badge variant={setting.metadata.active ? "secondary" : "destructive"}>
                      {setting.metadata.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">{setting.metadata.subject}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Validated {new Date(setting.metadata.validatedAt).toLocaleString()}
                  </p>
                </div>
              ) : null}
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">Required template parameters</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void navigator.clipboard.writeText(JSON.stringify(setting.example, null, 2))
                    }
                  >
                    <ClipboardIcon /> Copy example
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {setting.requiredParameters.map((parameter) => (
                    <code key={parameter} className="rounded bg-slate-100 px-2 py-1 text-xs">
                      {parameter}
                    </code>
                  ))}
                </div>
              </div>
              {canManage && configured ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => void action(type, "validate")}
                  >
                    <RefreshCwIcon /> Validate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => void action(type, "test")}
                  >
                    <MailCheckIcon /> Send test
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
      {canManage ? (
        <Button disabled={busy !== null} onClick={() => void save()}>
          {busy === "save" ? "Saving…" : "Save email settings"}
        </Button>
      ) : null}
    </div>
  );
}
