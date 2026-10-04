import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@qhse/ui/components/button";
import { Toaster } from "@qhse/ui/components/toast";
import { smqProcessSheets } from "@qhse/domain";
import type { ProcessSheetContent, ProcessSheetWrite, ProcessSheetVersion } from "@qhse/contracts";
import { clientApi } from "../../app/client-api.js";
import { useModuleStep } from "../../hooks/use-module-step.js";
import { notify } from "../context/context-ui.js";
import { exportProcessSheet, processSheetExportSections } from "./export.js";
import "../pip/pip.css";
import "../planning/planning.css";
import "./process-sheets.css";
export function ProcessSheetsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return projectId ? (
    <Toaster>
      <Sheets key={projectId} projectId={projectId} />
    </Toaster>
  ) : null;
}
function Sheets({ projectId }: { projectId: string }) {
  const { t } = useTranslation(["sheets", "planning"]),
    cache = useQueryClient(),
    key = ["process-sheets", projectId];
  const { step, setStep } = useModuleStep(2),
    [params, setParams] = useSearchParams(),
    selected = params.get("process");
  const [edit, setEdit] = useState<{ sheetId: string; content: ProcessSheetContent } | null>(null),
    [preview, setPreview] = useState<ProcessSheetVersion | null>(null),
    [exporting, setExporting] = useState(false);
  const query = useQuery({
    queryKey: key,
    queryFn: () => clientApi.processSheets(projectId),
    refetchInterval: (q) =>
      q.state.data?.runs.some((r) => ["DRAFT", "RUNNING"].includes(r.status)) ? 2500 : false,
  });
  const write = useMutation({
    mutationFn: ({ sheetId, input }: { sheetId: string; input: ProcessSheetWrite }) =>
      clientApi.writeProcessSheet(projectId, sheetId, input),
    onSuccess: (data) => {
      cache.setQueryData(key, data);
      setEdit(null);
      notify.success(t("planning:saved"));
    },
    onError: () => {
      notify.error(t("planning:failed"));
      void cache.invalidateQueries({ queryKey: key });
    },
  });
  const prepare = useMutation({
    mutationFn: (processId: string) => clientApi.prepareProcessSheet(projectId, processId),
    onSuccess: (data, processId) => {
      cache.setQueryData(key, data);
      choose(processId);
    },
    onError: () => notify.error(t("planning:failed")),
  });
  const launch = useMutation({
    mutationFn: ({ sheetId, revision }: { sheetId: string; revision: number }) =>
      clientApi.launchProcessSheet(projectId, sheetId, revision),
    onSuccess: (data) => cache.setQueryData(key, data),
    onError: () => notify.error(t("planning:failed")),
  });
  const choose = (processId: string | null) => {
    const next = new URLSearchParams(params);
    if (processId) next.set("process", processId);
    else next.delete("process");
    next.set("step", "1");
    setEdit(null);
    setPreview(null);
    setParams(next);
  };
  const download = async (v: ProcessSheetVersion, format: "docx" | "pdf") => {
    setExporting(true);
    try {
      const frozen = await clientApi.exportProcessSheet(projectId, v.id);
      await exportProcessSheet(frozen, format);
    } catch {
      notify.error(t("planning:failed"));
    } finally {
      setExporting(false);
    }
  };
  const data = query.data,
    busy = write.isPending || prepare.isPending || launch.isPending;
  if (query.isLoading)
    return (
      <main className="pip-app" aria-busy="true">
        {t("planning:loading")}
      </main>
    );
  if (!data || query.isError)
    return (
      <main className="pip-app" role="alert">
        {t("planning:failed")}
        <Button onClick={() => void query.refetch()}>{t("planning:retry")}</Button>
      </main>
    );
  const sheet = data.sheets.find((s) => s.processId === selected),
    snapshot = sheet?.sourceSnapshot.sources;
  const process =
    snapshot?.map?.processes.find((p) => p.id === selected) ??
    data.sources.map?.processes.find((p) => p.id === selected);
  const d = sheet ? (edit?.sheetId === sheet.id ? edit.content : sheet.content) : null;
  const dirty = Boolean(sheet && d && JSON.stringify(d) !== JSON.stringify(sheet.content)),
    steps = t("steps", { returnObjects: true });
  const set = (content: ProcessSheetContent) =>
    !busy && sheet && setEdit({ sheetId: sheet.id, content });
  const act = (input: ProcessSheetWrite) => sheet && write.mutate({ sheetId: sheet.id, input });
  const text = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    area = false,
    type = "text",
    limit = 2000,
  ) => (
    <label className="planning-field" key={label}>
      {label}
      {area ? (
        <textarea
          disabled={busy}
          value={value}
          maxLength={limit}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          disabled={busy}
          value={value}
          type={type}
          maxLength={limit}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
  const exports = (v: ProcessSheetVersion) => (
    <div className="planning-actions">
      <Button variant="outline" disabled={exporting} onClick={() => void download(v, "docx")}>
        {t("planning:word")}
      </Button>
      <Button
        variant="outline"
        disabled={exporting || v.sourceSnapshot.sources.facts.language === "ar"}
        onClick={() => void download(v, "pdf")}
      >
        {t("planning:pdf")}
      </Button>
    </div>
  );
  const missing =
    d && snapshot
      ? smqProcessSheets.missingItems(d, {
          objectives: snapshot.objectives,
          risks: snapshot.facts.risks,
          requirements: snapshot.facts.requirements,
        })
      : [];
  const missingLabels: Record<string, string> = {
    purpose: t("planning:purpose"),
    description: t("description"),
    inputs: t("planning:inputs"),
    outputs: t("planning:outputs"),
    authorName: t("authorName"),
    approverName: t("approverName"),
    date: t("date"),
    activitiesReview: t("activitiesReview"),
    activitiesFields: t("activitiesFields"),
    kpiLinks: t("kpiLinks"),
    riskIds: t("risks"),
    requirementIds: t("requirements"),
    referencesReviewed: t("referencesReviewed"),
    duplicateIds: t("duplicateIds"),
  };
  const latest = sheet ? data.runs.find((r) => r.sheetId === sheet.id) : undefined,
    active = Boolean(latest && ["DRAFT", "RUNNING"].includes(latest.status)),
    proposal = latest?.status === "COMPLETED" && !latest.applied ? latest : null,
    expired = Boolean(proposal && sheet && proposal.revision !== sheet.revision);
  const refs = (
    kind: "riskIds" | "requirementIds",
    label: string,
    items: { id: string; text: string }[],
  ) =>
    d ? (
      <section className="sheet-reference">
        <h3>{label}</h3>
        {items.length ? (
          items.map((r) => (
            <label className="sheet-check" key={r.id}>
              <input
                type="checkbox"
                checked={d[kind].includes(r.id)}
                onChange={(e) =>
                  set({
                    ...d,
                    [kind]: e.target.checked
                      ? [...d[kind], r.id]
                      : d[kind].filter((id) => id !== r.id),
                    referencesReviewed: false,
                  })
                }
              />
              {r.text}
            </label>
          ))
        ) : (
          <p>{t("noReferences")}</p>
        )}
        {d[kind]
          .filter((id) => !items.some((i) => i.id === id))
          .map((id) => (
            <div key={id} className="planning-notice">
              {t("oldReference")}
              <Button
                variant="outline"
                onClick={() =>
                  set({ ...d, [kind]: d[kind].filter((x) => x !== id), referencesReviewed: false })
                }
              >
                {t("remove")}
              </Button>
            </div>
          ))}
      </section>
    ) : null;
  return (
    <main className="pip-app">
      <header className="pip-head">
        <small>{t("module")}</small>
        <h1>{t("title")}</h1>
        <p>{t("intro")}</p>
      </header>
      <nav className="pip-steps" aria-label={t("title")}>
        {steps.map((label, i) => (
          <button
            key={label}
            className={`pip-step ${step === i + 1 ? "active" : ""}`}
            aria-current={step === i + 1 ? "step" : undefined}
            disabled={busy}
            onClick={() => {
              setStep(i + 1);
              setPreview(null);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {!data.sources.map?.current ? (
        <div className="planning-notice">
          <p>{t(data.sources.map ? "mapStale" : "noMap")}</p>
          <Link to={`/projects/${projectId}/processes`}>{t("goMap")}</Link>
        </div>
      ) : null}
      {step === 1 && !selected ? (
        <section className="pip-card">
          <h2>{steps[0]}</h2>
          <div className="planning-grid">
            {data.sources.map?.processes.map((p) => {
              const s = data.sheets.find((s) => s.processId === p.id),
                version = s ? data.versions.find((v) => v.sheetId === s.id) : undefined;
              return (
                <article className="sheet-process" key={p.id}>
                  <h3>{p.title}</h3>
                  <p>
                    {t(`planning:${p.family}`)} · {p.pilotName} · {p.pilotRole}
                  </p>
                  <span className="sheet-status">
                    {version ? `${t("validated")} ${version.version}` : t("draft")}
                  </span>
                  {s && !s.current ? <p>{t("stale")}</p> : null}
                  <div className="planning-actions">
                    <Button
                      disabled={busy || (!s && !data.sources.map?.current)}
                      onClick={() => (s ? choose(p.id) : prepare.mutate(p.id))}
                    >
                      {s ? t("open") : t("prepare")}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
      {step === 1 && selected && (!sheet || !d || !snapshot || !process) ? (
        <section className="pip-card">
          <Button variant="outline" onClick={() => choose(null)}>
            {t("back")}
          </Button>
          {process ? (
            <>
              <h2>{process.title}</h2>
              <Button
                disabled={busy || !data.sources.map?.current}
                onClick={() => prepare.mutate(process.id)}
              >
                {t("prepare")}
              </Button>
            </>
          ) : (
            <p>{t("unavailable")}</p>
          )}
        </section>
      ) : null}
      {step === 1 && sheet && d && snapshot && process ? (
        <>
          <div className="planning-actions">
            <Button variant="outline" disabled={busy} onClick={() => choose(null)}>
              {t("back")}
            </Button>
            <span>
              {snapshot.facts.organizationName} · {t("processVersion")} {snapshot.map?.version}
            </span>
          </div>
          {!sheet.available ? (
            <div className="planning-notice">{t("unavailable")}</div>
          ) : !sheet.current ? (
            <div className="planning-notice">
              <p>{t("stale")}</p>
              <p>{t("refreshHelp")}</p>
              <Button
                disabled={dirty || busy || !data.sources.map?.current}
                onClick={() => act({ kind: "refresh_sources", revision: sheet.revision })}
              >
                {t("refresh")}
              </Button>
            </div>
          ) : null}
          {dirty ? <div className="planning-notice">{t("dirty")}</div> : null}
          <section className="pip-card">
            <div className="pip-card-head">
              <div>
                <h2>{process.title}</h2>
                <p>
                  {t(`planning:${process.family}`)} · {t("planning:pilotName")}: {process.pilotName}{" "}
                  · {process.pilotRole}
                </p>
              </div>
              <span className="sheet-status">{t("draft")}</span>
            </div>
            <div className="planning-notice">
              <b>{t("code")}</b>
              <p>{t("codePending")}</p>
            </div>
            <div className="planning-grid">
              {(["date", "authorName", "approverName"] as const).map((k) =>
                text(
                  t(k),
                  d[k],
                  (v) => set({ ...d, [k]: v }),
                  false,
                  k === "date" ? "date" : "text",
                  300,
                ),
              )}
            </div>
            {text(t("planning:purpose"), d.purpose, (v) => set({ ...d, purpose: v }), true)}
            <div className="planning-grid">
              {text(t("planning:inputs"), d.inputs, (v) => set({ ...d, inputs: v }), true)}
              {text(t("planning:outputs"), d.outputs, (v) => set({ ...d, outputs: v }), true)}
            </div>
          </section>
          <section className="pip-card">
            <h2>{t("description")}</h2>
            <p>{t("descriptionHelp")}</p>
            {text(
              t("description"),
              d.description,
              (v) => set({ ...d, description: v }),
              true,
              "text",
              6000,
            )}
            <div className="planning-actions">
              <Button
                disabled={
                  busy ||
                  dirty ||
                  !sheet.current ||
                  active ||
                  sheet.content.description.trim().length < 20
                }
                onClick={() => launch.mutate({ sheetId: sheet.id, revision: sheet.revision })}
              >
                {active ? t("planning:running") : t("generate")}
              </Button>
              {proposal ? (
                <>
                  <span>{t(expired ? "expired" : "ready")}</span>
                  <Button
                    variant="outline"
                    disabled={busy || dirty || !sheet.current || expired}
                    onClick={() =>
                      act({ kind: "apply", revision: sheet.revision, runId: proposal.id })
                    }
                  >
                    {t("apply")}
                  </Button>
                </>
              ) : null}
              {latest?.status === "FAILED" ? (
                <span role="alert">{t("planning:failed")}</span>
              ) : null}
            </div>
          </section>
          <section className="pip-card">
            <h2>{t("activities")}</h2>
            <p>{t("activitiesHelp")}</p>
            {!d.activities.length ? (
              <p>{t("noActivities")}</p>
            ) : (
              d.activities.map((a, i) => (
                <article className="sheet-activity" key={a.id}>
                  <h3>
                    {i + 1}. {a.activity}
                  </h3>
                  <div className="planning-grid">
                    {(["activity", "input", "output"] as const).map((k) =>
                      text(
                        t(
                          k === "input"
                            ? "activityInput"
                            : k === "output"
                              ? "activityOutput"
                              : "activity",
                        ),
                        a[k],
                        (v) =>
                          set({
                            ...d,
                            activities: d.activities.map((x) =>
                              x.id === a.id ? { ...x, [k]: v } : x,
                            ),
                          }),
                        true,
                      ),
                    )}
                    <label className="planning-field">
                      {t("planning:decision")}
                      <select
                        value={a.decision}
                        onChange={(e) =>
                          set({
                            ...d,
                            activities: d.activities.map((x) =>
                              x.id === a.id
                                ? { ...x, decision: e.target.value as typeof a.decision }
                                : x,
                            ),
                          })
                        }
                      >
                        {(["pending", "retained", "rejected"] as const).map((value) => (
                          <option key={value} value={value}>
                            {t(`planning:${value}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      set({ ...d, activities: d.activities.filter((x) => x.id !== a.id) })
                    }
                  >
                    {t("remove")}
                  </Button>
                </article>
              ))
            )}
            <Button
              variant="outline"
              onClick={() =>
                set({
                  ...d,
                  activities: [
                    ...d.activities,
                    {
                      id: crypto.randomUUID(),
                      activity: "",
                      input: "",
                      output: "",
                      decision: "pending",
                    },
                  ],
                })
              }
            >
              {t("addActivity")}
            </Button>
          </section>
          <section className="pip-card">
            <h2>{t("interactions")}</h2>
            {smqProcessSheets
              .relatedInteractions(snapshot.map?.interactions ?? [], process.id)
              .map((i) => {
                const names = new Map(snapshot.map?.processes.map((p) => [p.id, p.title]));
                return (
                  <div className="sheet-flow" key={i.id}>
                    <small>{t(i.to === process.id ? "incoming" : "outgoing")}</small>
                    <div>
                      <b>{names.get(i.from)}</b>
                      <span>→</span>
                      <p>{i.flow}</p>
                      <span>→</span>
                      <b>{names.get(i.to)}</b>
                    </div>
                  </div>
                );
              })}
          </section>
          <section className="pip-card">
            <h2>{t("kpiLinks")}</h2>
            <p>{t("kpiHelp")}</p>
            {d.kpiLinks.map((k) => (
              <article className="sheet-activity" key={k.id}>
                <div className="planning-grid">
                  <label className="planning-field">
                    {t("strategic")}
                    <select
                      value={k.objectiveId ?? ""}
                      onChange={(e) =>
                        set({
                          ...d,
                          referencesReviewed: false,
                          kpiLinks: d.kpiLinks.map((x) =>
                            x.id === k.id ? { ...x, objectiveId: e.target.value || null } : x,
                          ),
                        })
                      }
                    >
                      <option value="">{t("manualStrategic")}</option>
                      {snapshot.objectives.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.title}
                        </option>
                      ))}
                      {k.objectiveId && !snapshot.objectives.some((o) => o.id === k.objectiveId) ? (
                        <option value={k.objectiveId}>{t("oldReference")}</option>
                      ) : null}
                    </select>
                  </label>
                  {!k.objectiveId
                    ? text(t("manualStrategic"), k.strategicLabel, (v) =>
                        set({
                          ...d,
                          referencesReviewed: false,
                          kpiLinks: d.kpiLinks.map((x) =>
                            x.id === k.id ? { ...x, strategicLabel: v } : x,
                          ),
                        }),
                      )
                    : null}
                  {(["operational", "kpi"] as const).map((f) =>
                    text(t(f), k[f], (v) =>
                      set({
                        ...d,
                        referencesReviewed: false,
                        kpiLinks: d.kpiLinks.map((x) => (x.id === k.id ? { ...x, [f]: v } : x)),
                      }),
                    ),
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    set({
                      ...d,
                      referencesReviewed: false,
                      kpiLinks: d.kpiLinks.filter((x) => x.id !== k.id),
                    })
                  }
                >
                  {t("remove")}
                </Button>
              </article>
            ))}
            <Button
              variant="outline"
              onClick={() =>
                set({
                  ...d,
                  referencesReviewed: false,
                  kpiLinks: [
                    ...d.kpiLinks,
                    {
                      id: crypto.randomUUID(),
                      objectiveId: null,
                      strategicLabel: "",
                      operational: "",
                      kpi: "",
                    },
                  ],
                })
              }
            >
              {t("addKpi")}
            </Button>
          </section>
          <section className="pip-card">
            <p>{t("referencesHelp")}</p>
            {refs(
              "riskIds",
              t("risks"),
              snapshot.facts.risks.map((r) => ({ id: r.id, text: r.title })),
            )}
            {refs(
              "requirementIds",
              t("requirements"),
              snapshot.facts.requirements.map((r) => ({
                id: r.id,
                text: r.partyName + ": " + r.text,
              })),
            )}
            <label className="sheet-check">
              <input
                type="checkbox"
                checked={d.referencesReviewed}
                onChange={(e) => set({ ...d, referencesReviewed: e.target.checked })}
              />
              {t("referencesReviewed")}
            </label>
          </section>
          <section className="pip-card">
            {text(t("notes"), d.notes, (v) => set({ ...d, notes: v }), true)}
            <p>{t("validationHelp")}</p>
            {missing.length ? (
              <div className="planning-notice">
                <b>{t("missing")}</b>
                <ul>
                  {missing.map((m) => (
                    <li key={m}>{missingLabels[m] ?? m}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="planning-actions">
              <Button
                variant="outline"
                disabled={busy || !dirty}
                onClick={() => act({ kind: "save", revision: sheet.revision, content: d })}
              >
                {t("planning:save")}
              </Button>
              {edit ? (
                <Button variant="outline" disabled={busy} onClick={() => setEdit(null)}>
                  {t("planning:cancel")}
                </Button>
              ) : null}
              <Button
                disabled={busy || dirty || !sheet.current || !sheet.available || missing.length > 0}
                onClick={() => act({ kind: "validate", revision: sheet.revision })}
              >
                {t("validate")}
              </Button>
            </div>
          </section>
        </>
      ) : null}
      {step === 2 ? (
        <section className="pip-card">
          <h2>{steps[1]}</h2>
          {!data.versions.length ? (
            <p>{t("noVersions")}</p>
          ) : (
            data.versions.map((v) => {
              const p = v.sourceSnapshot.sources.map?.processes.find((p) => p.id === v.processId);
              return (
                <article className="sheet-version" key={v.id}>
                  <div>
                    <h3>{p?.title}</h3>
                    <p>
                      {t("planning:version")} {v.version} · {v.content.date} ·{" "}
                      {v.content.authorName} · {v.content.approverName}
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => setPreview(v)}>
                    {t("open")}
                  </Button>
                  {exports(v)}
                </article>
              );
            })
          )}
        </section>
      ) : null}
      {preview && step === 2 ? (
        <section className="pip-card">
          <h2>
            {t("historic")} · {t("planning:version")} {preview.version}
          </h2>
          <Button variant="outline" onClick={() => setPreview(null)}>
            {t("planning:cancel")}
          </Button>
          {processSheetExportSections(preview).sections.map((s) => (
            <section key={s.title} className="sheet-preview">
              <h3>{s.title}</h3>
              {s.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {s.headers ? (
                <div className="sheet-table">
                  <table className="planning-table">
                    <thead>
                      <tr>
                        {s.headers.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.rows.map((r, i) => (
                        <tr key={i}>
                          {r.map((c, j) => (
                            <td key={j}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ))}
        </section>
      ) : null}
      {data.sources.facts.language === "ar" ? <p>{t("planning:arabicPdf")}</p> : null}
    </main>
  );
}
