import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@qhse/ui/components/button";
import { Toaster } from "@qhse/ui/components/toast";
import { smqScope } from "@qhse/domain";
import {
  scopeWriteSchema,
  type ScopeWrite,
  type ScopeDeclaration,
  type ScopeRegister,
  type ScopeVerificationInput,
} from "@qhse/contracts";
import { clientApi } from "../../app/client-api.js";
import { useModuleStep } from "../../hooks/use-module-step.js";
import { notify } from "../context/context-ui.js";
import { exportScope } from "./export.js";
import "../pip/pip.css";
import "./scope.css";
export function ScopePage() {
  const { projectId } = useParams<{ projectId: string }>();
  return projectId ? (
    <Toaster>
      <ScopeAnalysis key={projectId} projectId={projectId} />
    </Toaster>
  ) : null;
}
function ScopeAnalysis({ projectId }: { projectId: string }) {
  const { t } = useTranslation("scope");
  const cache = useQueryClient();
  const key = ["scope-register", projectId];
  const { step, setStep } = useModuleStep(3);
  const [draft, setDraft] = useState<ScopeDeclaration | null>(null);
  const [decision, setDecision] = useState<ScopeVerificationInput | null>(null);
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const query = useQuery({
    queryKey: key,
    queryFn: () => clientApi.scopeRegister(projectId),
    refetchInterval: (q) =>
      q.state.data?.runs.some((r) => ["DRAFT", "RUNNING"].includes(r.status)) ? 2500 : false,
  });
  const write = useMutation({
    mutationFn: (v: ScopeWrite) => clientApi.writeScope(projectId, scopeWriteSchema.parse(v)),
    onSuccess: (data) => {
      cache.setQueryData(key, data);
      setDraft(null);
      setEdit(null);
      setDecision(null);
      notify.success(t("saved"));
    },
    onError: () => notify.error(t("failed")),
  });
  const launch = useMutation({
    mutationFn: () =>
      clientApi.launchScope(projectId, {
        revision: query.data!.revision,
        fingerprint: query.data!.fingerprint,
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: key });
    },
    onError: () => notify.error(t("failed")),
  });
  const data = query.data;
  if (query.isLoading)
    return (
      <main className="pip-app" aria-busy="true">
        {t("loading")}
      </main>
    );
  if (!data || query.isError)
    return (
      <main className="pip-app" role="alert">
        {t("failed")}
        <Button onClick={() => void query.refetch()}>{t("retry")}</Button>
      </main>
    );
  const d = draft ?? data.declaration;
  const dirty = draft !== null && JSON.stringify(d) !== JSON.stringify(data.declaration);
  const v =
    decision ??
    (data.verificationCurrent && data.verification
      ? {
          applicability: data.verification.applicability,
          justification: data.verification.justification,
          acknowledgedFindings: data.verification.acknowledgedFindings,
        }
      : { applicability: "applicable" as const, justification: "", acknowledgedFindings: [] });
  const findings = smqScope.findings(data.declaration, data.facts);
  const active = launch.isPending || data.runs.some((r) => ["DRAFT", "RUNNING"].includes(r.status));
  const currentDraft = data.statements
    .filter((s) => s.status === "DRAFT")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const statementText =
    edit && edit.id === currentDraft?.id ? edit.text : (currentDraft?.statement ?? "");
  const statementDirty = currentDraft ? statementText !== currentDraft.statement : false;
  const canUseDraft =
    data.verificationCurrent &&
    currentDraft?.fingerprint === data.fingerprint &&
    currentDraft?.verificationId === data.verification?.id;
  const setField = <K extends keyof ScopeDeclaration>(field: K, value: ScopeDeclaration[K]) =>
    setDraft({ ...d, [field]: value });
  type TextField =
    | "activities"
    | "excludedActivities"
    | "activitiesReason"
    | "products"
    | "excludedProducts"
    | "productsReason"
    | "designDetails"
    | "thirdPartyPropertyDetails"
    | "notes";
  const textField = (field: TextField) => (
    <label className="scope-field" key={field}>
      {t(field)}
      <textarea
        value={d[field]}
        maxLength={4000}
        onChange={(e) => setField(field, e.target.value)}
      />
    </label>
  );
  const selectField = (
    field:
      | "activitiesInclusion"
      | "sitesCoverage"
      | "productsInclusion"
      | "designDeclaration"
      | "thirdPartyProperty",
    options: string[],
  ) => (
    <label className="scope-field">
      {t(field)}
      <select
        value={d[field] ?? ""}
        onChange={(e) =>
          setField(field, (e.target.value || null) as ScopeDeclaration[typeof field])
        }
      >
        <option value="">{t("choose")}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {t(o as "all")}
          </option>
        ))}
      </select>
    </label>
  );
  const send = (input: ScopeWrite) => write.mutate(input);
  return (
    <main className="pip-app scope-app">
      <header className="pip-head">
        <h1>{t("title")}</h1>
        <p>{t("subtitle")}</p>
      </header>
      <nav className="pip-steps" aria-label={t("title")}>
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            className={`pip-step ${step === n ? "active" : ""}`}
            aria-current={step === n ? "step" : undefined}
            onClick={() => setStep(n)}
          >
            {n}. {t("steps", { returnObjects: true })[n - 1]}
          </button>
        ))}
      </nav>
      {dirty && (
        <p role="status" className="scope-notice">
          {t("dirty")}
        </p>
      )}
      {data.verification && !data.verificationCurrent && (
        <p role="status" className="scope-notice">
          {t("stale")}
        </p>
      )}
      <KnownFacts data={data} />
      {step === 1 && (
        <section className="pip-panel">
          <h2>{t("steps", { returnObjects: true })[0]}</h2>
          <p>{t("declarationsHint")}</p>
          <fieldset disabled={write.isPending}>
            {selectField("activitiesInclusion", ["all", "exclude_some"])}
            {textField("activities")}
            {(d.activitiesInclusion === "exclude_some" ||
              d.excludedActivities ||
              d.activitiesReason) && (
              <>
                {textField("excludedActivities")}
                {textField("activitiesReason")}
              </>
            )}
            {selectField("sitesCoverage", ["all", "specific"])}
            <h3>{t("sites")}</h3>
            {d.sites.map((site, i) => (
              <div className="scope-site" key={i}>
                {(["name", "type", "address"] as const).map((field) => (
                  <label className="scope-field" key={field}>
                    {t(
                      field === "name" ? "siteName" : field === "type" ? "siteType" : "siteAddress",
                    )}
                    <input
                      value={site[field]}
                      maxLength={field === "address" ? 1000 : 300}
                      onChange={(e) =>
                        setField(
                          "sites",
                          d.sites.map((s, j) => (j === i ? { ...s, [field]: e.target.value } : s)),
                        )
                      }
                    />
                  </label>
                ))}
                <Button
                  variant="outline"
                  onClick={() =>
                    setField(
                      "sites",
                      d.sites.filter((_, j) => j !== i),
                    )
                  }
                >
                  {t("removeSite")}
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              disabled={d.sites.length >= 50}
              onClick={() => setField("sites", [...d.sites, { name: "", type: "", address: "" }])}
            >
              {t("addSite")}
            </Button>
            {selectField("productsInclusion", ["all", "exclude_some"])}
            {textField("products")}
            {(d.productsInclusion === "exclude_some" || d.excludedProducts || d.productsReason) && (
              <>
                {textField("excludedProducts")}
                {textField("productsReason")}
              </>
            )}
            {selectField("designDeclaration", ["designs_own", "customer_specifications"])}
            {textField("designDetails")}
            {selectField("thirdPartyProperty", ["yes", "no"])}
            {d.thirdPartyProperty === "yes" && textField("thirdPartyPropertyDetails")}
            {textField("notes")}
          </fieldset>
          <p>{t(smqScope.missingDeclarations(d).length ? "incomplete" : "complete")}</p>
          <Button
            disabled={write.isPending || !dirty}
            onClick={() => send({ kind: "declaration", revision: data.revision, declaration: d })}
          >
            {t("save")}
          </Button>
        </section>
      )}
      {step === 2 && (
        <section className="pip-panel">
          <h2>{t("steps", { returnObjects: true })[1]}</h2>
          <p>{t("verificationHint")}</p>
          {data.facts.standard !== "ISO_9001" && <p role="alert">{t("unsupported")}</p>}
          <p>{t(`proposals.${smqScope.designProposal(data.declaration)}`)}</p>
          {findings.map((f) => (
            <div className={`scope-finding ${f.severity}`} key={f.key}>
              <p>{t(`findings.${f.key}` as "findings.activities")}</p>
              {f.evidence && <blockquote>{f.evidence}</blockquote>}
              {f.severity === "attention" && (
                <label>
                  <input
                    type="checkbox"
                    checked={v.acknowledgedFindings.includes(f.key)}
                    onChange={(e) =>
                      setDecision({
                        ...v,
                        acknowledgedFindings: e.target.checked
                          ? [...v.acknowledgedFindings, f.key]
                          : v.acknowledgedFindings.filter((k) => k !== f.key),
                      })
                    }
                  />{" "}
                  {t("acknowledge")}
                </label>
              )}
            </div>
          ))}
          <label className="scope-field">
            {t("applicability")}
            <select
              value={v.applicability}
              onChange={(e) =>
                setDecision({
                  ...v,
                  applicability: e.target.value as ScopeVerificationInput["applicability"],
                })
              }
            >
              <option value="applicable">{t("applicable")}</option>
              <option value="not_applicable">{t("not_applicable")}</option>
            </select>
          </label>
          <label className="scope-field">
            {t("justification")}
            <textarea
              minLength={20}
              maxLength={2000}
              value={v.justification}
              onChange={(e) => setDecision({ ...v, justification: e.target.value })}
            />
          </label>
          {data.verificationCurrent && <p>{t("verified")}</p>}
          <Button
            disabled={
              dirty ||
              write.isPending ||
              v.justification.trim().length < 20 ||
              !smqScope.canVerify(data.declaration, data.facts, v.acknowledgedFindings) ||
              data.facts.standard !== "ISO_9001"
            }
            onClick={() =>
              send({
                kind: "verification",
                revision: data.revision,
                fingerprint: data.fingerprint,
                verification: v,
              })
            }
          >
            {t("verify")}
          </Button>
        </section>
      )}
      {step === 3 && (
        <>
          <section className="pip-panel">
            <h2>{t("steps", { returnObjects: true })[2]}</h2>
            <p>{t("proposal")}</p>
            <Button
              disabled={dirty || active || write.isPending || !data.verificationCurrent}
              onClick={() => launch.mutate()}
            >
              {t(active ? "generating" : "generate")}
            </Button>
            {!currentDraft ? (
              <p>{t("noStatement")}</p>
            ) : (
              <>
                <label className="scope-field">
                  {t("statement")}
                  <textarea
                    className="scope-statement"
                    value={statementText}
                    maxLength={1500}
                    disabled={!canUseDraft || write.isPending}
                    onChange={(e) => setEdit({ id: currentDraft.id, text: e.target.value })}
                  />
                </label>
                <small>
                  {statementText.length} / 1500 · {currentDraft.model} · scope-v1
                </small>
                {!canUseDraft && <p role="status">{t("stale")}</p>}
                <div className="scope-actions">
                  <Button
                    variant="outline"
                    disabled={
                      dirty ||
                      !canUseDraft ||
                      !statementDirty ||
                      write.isPending ||
                      statementText.trim().length < 80
                    }
                    onClick={() =>
                      send({
                        kind: "statement",
                        revision: data.revision,
                        statementId: currentDraft.id,
                        statement: statementText,
                      })
                    }
                  >
                    {t("saveStatement")}
                  </Button>
                  <Button
                    disabled={dirty || !canUseDraft || statementDirty || write.isPending || active}
                    onClick={() =>
                      send({
                        kind: "validate",
                        revision: data.revision,
                        statementId: currentDraft.id,
                      })
                    }
                  >
                    {t("validate")}
                  </Button>
                </div>
              </>
            )}
          </section>
          <section className="pip-panel">
            <h2>{t("versions")}</h2>
            {!data.statements.some((s) => s.status === "VALIDATED") && <p>{t("noVersions")}</p>}
            {data.statements
              .filter((s) => s.status === "VALIDATED")
              .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))
              .map((s) => (
                <article className="scope-version" key={s.id}>
                  <h3>{t("version", { version: s.version })}</h3>
                  <small>
                    {s.validatedAt} · {s.model} · scope-v1
                  </small>
                  <p>{s.statement}</p>
                  {s.fingerprint !== data.fingerprint && <p>{t("historical")}</p>}
                  <div className="scope-actions">
                    {(["docx", "pdf"] as const).map((format) => (
                      <Button
                        key={format}
                        variant="outline"
                        disabled={exporting || (format === "pdf" && data.facts.language === "ar")}
                        onClick={() => {
                          void (async () => {
                            setExporting(true);
                            try {
                              const version = await clientApi.exportScopeVersion(projectId, s.id);
                              await exportScope(version, format);
                            } catch {
                              notify.error(t("failed"));
                            } finally {
                              setExporting(false);
                            }
                          })();
                        }}
                      >
                        {t(format === "docx" ? "exportWord" : "exportPdf")}
                      </Button>
                    ))}
                  </div>
                </article>
              ))}
            {data.facts.language === "ar" && <p>{t("pdfArabic")}</p>}
          </section>
        </>
      )}
      <details className="pip-panel">
        <summary>{t("runHistory")}</summary>
        {data.runs.map((run) => (
          <p key={run.id}>
            {run.createdAt} ·{" "}
            {t(
              ["DRAFT", "RUNNING"].includes(run.status)
                ? "generating"
                : run.status === "FAILED"
                  ? "generationFailed"
                  : "generated",
            )}{" "}
            · {run.model}
          </p>
        ))}
      </details>
      <footer className="scope-actions">
        {step > 1 && (
          <Button variant="outline" onClick={() => setStep(step - 1)}>
            {t("back")}
          </Button>
        )}
        {step < 3 && <Button onClick={() => setStep(step + 1)}>{t("next")}</Button>}
      </footer>
    </main>
  );
}
function KnownFacts({ data }: { data: ScopeRegister }) {
  const { t } = useTranslation("scope");
  const f = data.facts;
  return (
    <details className="pip-panel" open>
      <summary>{t("known")}</summary>
      <p>
        {f.organizationName} · {f.projectName} · {f.standard}
      </p>
      <h3>{t("projectActivities")}</h3>
      <p>{f.projectActivities.join(" · ") || "—"}</p>
      <div className="scope-facts">
        {[
          { key: "profile", rows: f.profile.map((p) => `${p.key}: ${p.value}`) },
          { key: "issues", rows: f.issues.map((i) => i.title) },
          { key: "parties", rows: f.parties.map((p) => p.name) },
          { key: "requirements", rows: f.requirements.map((r) => `${r.partyName}: ${r.text}`) },
          { key: "risks", rows: f.risks.map((i) => i.title) },
        ].map((group) => (
          <section key={group.key}>
            <h3>{t(group.key as "profile")}</h3>
            {group.rows.length ? group.rows.map((row, i) => <p key={i}>{row}</p>) : <p>—</p>}
          </section>
        ))}
      </div>
    </details>
  );
}
