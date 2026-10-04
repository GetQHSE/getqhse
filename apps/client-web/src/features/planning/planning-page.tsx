import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@qhse/ui/components/button";
import { Toaster } from "@qhse/ui/components/toast";
import { smqPlanning } from "@qhse/domain";
import {
  planningWriteSchema,
  type PlanningModule,
  type PlanningDocument,
  type PlanningWrite,
  type PlanningLaunch,
  type PlanningVersion,
} from "@qhse/contracts";
import { clientApi } from "../../app/client-api.js";
import { useModuleStep } from "../../hooks/use-module-step.js";
import { notify } from "../context/context-ui.js";
import { ProcessMap } from "./process-map.js";
import { exportPlanning } from "./export.js";
import "../pip/pip.css";
import "./planning.css";
const priorityKeys = [
  "growth",
  "customer_satisfaction",
  "nonconformities",
  "profitability",
  "innovation",
  "international",
  "operational_performance",
  "digitalization",
  "skills",
  "other",
] as const;
type ListKey = "axes" | "objectives" | "processes" | "interactions";
export function PlanningPage({ module }: { module: PlanningModule }) {
  const { projectId } = useParams<{ projectId: string }>();
  return projectId ? (
    <Toaster>
      <PlanningAnalysis key={projectId + module} projectId={projectId} module={module} />
    </Toaster>
  ) : null;
}
function PlanningAnalysis({ projectId, module }: { projectId: string; module: PlanningModule }) {
  const { t } = useTranslation("planning"),
    cache = useQueryClient(),
    key = ["planning", projectId, module];
  const { step, setStep } = useModuleStep(4);
  const [draft, setDraft] = useState<PlanningDocument | null>(null),
    [exporting, setExporting] = useState(false);
  const query = useQuery({
    queryKey: key,
    queryFn: () => clientApi.planningRegister(projectId, module),
    refetchInterval: (q) =>
      q.state.data?.runs.some((r) => ["DRAFT", "RUNNING"].includes(r.status)) ? 2500 : false,
  });
  const write = useMutation({
    mutationFn: (v: PlanningWrite) =>
      clientApi.writePlanning(projectId, module, planningWriteSchema.parse(v)),
    onSuccess: (data) => {
      cache.setQueryData(key, data);
      setDraft(null);
      notify.success(t("saved"));
    },
    onError: () => {
      notify.error(t("failed"));
      void cache.invalidateQueries({ queryKey: key });
    },
  });
  const launch = useMutation({
    mutationFn: (stage: PlanningLaunch["stage"]) =>
      clientApi.launchPlanning(projectId, module, { revision: query.data!.revision, stage }),
    onSuccess: (data) => cache.setQueryData(key, data),
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
  const d = draft ?? data.document,
    dirty = JSON.stringify(d) !== JSON.stringify(data.document),
    policy = module === "policy";
  const active = data.runs.some((r) => ["DRAFT", "RUNNING"].includes(r.status)),
    busy = write.isPending || launch.isPending,
    ready = data.current && Boolean(data.sources.scope?.current);
  const basis = (v: PlanningVersion) => JSON.stringify(smqPlanning.policyBasis(v.document));
  const validatedPolicy = data.versions.find(
    (v) =>
      v.kind === "policy" &&
      v.id === data.document.policyVersionId &&
      v.fingerprint === data.fingerprint &&
      basis(v) === JSON.stringify(smqPlanning.policyBasis(data.document)),
  );
  const gates = policy
    ? [
        true,
        smqPlanning.directionsComplete(data.document),
        smqPlanning.axesComplete(data.document),
        Boolean(validatedPolicy),
      ]
    : [
        true,
        smqPlanning.processesComplete(data.document),
        smqPlanning.interactionsComplete(data.document),
        smqPlanning.pilotsComplete(data.document),
      ];
  const steps = t(policy ? "policySteps" : "processSteps", { returnObjects: true });
  const edit = (next: PlanningDocument) => setDraft(next);
  const change = (list: ListKey, id: string, field: string, value: string) =>
    edit({ ...d, [list]: d[list].map((x) => (x.id === id ? { ...x, [field]: value } : x)) });
  const save = () => write.mutate({ kind: "save", revision: data.revision, document: d });
  const validate = (target: "policy" | "objectives" | "processes") =>
    write.mutate({ kind: "validate", revision: data.revision, target });
  const field = (
    name: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    area = false,
    type = "text",
  ) => (
    <label className="planning-field" key={name}>
      {label}
      {area ? (
        <textarea
          className={name === "statement" ? "planning-statement" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={name === "statement" ? 6000 : 2000}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={600}
        />
      )}
    </label>
  );
  const choice = (
    name: string,
    label: string,
    value: string,
    options: { value: string; label: string }[],
    onChange: (v: string) => void,
  ) => (
    <label className="planning-field" key={name}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("choose")}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  const decision = (list: ListKey, id: string, value: string) =>
    choice(
      "decision",
      t("decision"),
      value,
      ["pending", "retained", "rejected"].map((value) => ({
        value,
        label: t(value as "pending" | "retained" | "rejected"),
      })),
      (v) => change(list, id, "decision", v),
    );
  const generation = (stage: PlanningLaunch["stage"], allowed: boolean) => {
    const latest = data.runs.find((r) => r.stage === stage);
    const proposal = latest?.status === "COMPLETED" && !latest.applied ? latest : undefined;
    const expired = proposal && proposal.revision !== data.revision;
    return (
      <div className="planning-actions">
        <Button
          disabled={!allowed || !ready || dirty || busy || active}
          onClick={() => launch.mutate(stage)}
        >
          {active ? t("running") : t("generate")}
        </Button>
        {proposal ? (
          <>
            <span>{expired ? t("expired") : t("proposal")}</span>
            <Button
              variant="outline"
              disabled={Boolean(expired) || dirty || busy || !ready}
              onClick={() =>
                write.mutate({ kind: "apply", revision: data.revision, runId: proposal.id })
              }
            >
              {t("apply")}
            </Button>
          </>
        ) : null}
        {data.runs[0]?.status === "FAILED" ? <span role="alert">{t("failed")}</span> : null}
      </div>
    );
  };
  const add = (list: ListKey) => {
    const id = crypto.randomUUID(),
      decision = "pending" as const;
    if (list === "axes")
      edit({ ...d, axes: [...d.axes, { id, decision, title: "", rationale: "" }] });
    if (list === "objectives")
      edit({
        ...d,
        objectives: [
          ...d.objectives,
          {
            id,
            decision,
            axisId: d.axes.find((x) => x.decision === "retained")?.id ?? "",
            title: "",
            indicator: "",
            method: "",
            unit: "",
            baseline: "",
            target: "",
            deadline: "",
            frequency: "",
            owner: "",
          },
        ],
      });
    if (list === "processes")
      edit({
        ...d,
        processes: [
          ...d.processes,
          {
            id,
            decision,
            title: "",
            purpose: "",
            inputs: "",
            outputs: "",
            family: "realization",
            pilotName: "",
            pilotRole: "",
          },
        ],
      });
    if (list === "interactions")
      edit({
        ...d,
        interactions: [
          ...d.interactions,
          {
            id,
            decision,
            from: d.processes.find((x) => x.decision === "retained")?.id ?? "",
            to: "",
            flow: "",
          },
        ],
      });
  };
  const download = async (v: PlanningVersion, format: "docx" | "pdf" | "xlsx") => {
    setExporting(true);
    try {
      await exportPlanning(projectId, module, v, format);
    } catch {
      notify.error(t("failed"));
    } finally {
      setExporting(false);
    }
  };
  const retainedProcesses = d.processes.filter((p) => p.decision === "retained");
  const mapLabels = {
    management: t("management"),
    realization: t("realization"),
    support: t("support"),
    globalInput: t("globalInput"),
    globalOutput: t("globalOutput"),
  };
  return (
    <main className="pip-app">
      <header className="pip-head">
        <h1>{t(policy ? "policyTitle" : "processesTitle")}</h1>
        <p>{t(policy ? "policyIntro" : "processIntro")}</p>
      </header>
      <nav className="pip-steps" aria-label={t(policy ? "policyTitle" : "processesTitle")}>
        {steps.map((label, i) => (
          <button
            key={label}
            className={`pip-step ${step === i + 1 ? "active" : ""}`}
            aria-current={step === i + 1 ? "step" : undefined}
            disabled={!gates[i]}
            onClick={() => setStep(i + 1)}
          >
            {i + 1}. {label}
          </button>
        ))}
      </nav>
      <details className="pip-card">
        <summary>
          {t("facts")} · {data.sources.facts.organizationName}
        </summary>
        <p>{data.sources.facts.projectActivities.join(" · ")}</p>
        <h3>{t("scope")}</h3>
        <p>{data.sources.scope?.statement ?? t("scopeRequired")}</p>
        <h3>{t("sources")}</h3>
        <ul>
          {[
            ...data.sources.facts.issues.map((x) => x.title),
            ...data.sources.facts.requirements.map((x) => x.partyName + ": " + x.text),
            ...data.sources.facts.risks.map((x) => x.title),
          ].map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </details>
      {!data.current ? (
        <div className="planning-notice" role="alert">
          <p>{t("stale")}</p>
          <Button
            disabled={busy || dirty}
            onClick={() => write.mutate({ kind: "review_sources", revision: data.revision })}
          >
            {t("reviewSources")}
          </Button>
        </div>
      ) : null}
      {!data.sources.scope?.current ? (
        <div className="planning-notice">{t("scopeRequired")}</div>
      ) : null}
      {dirty ? <div className="planning-notice">{t("dirty")}</div> : null}
      {!gates[step - 1] ? (
        <section className="pip-card">{t("locked")}</section>
      ) : (
        <>
          {policy && step === 1 ? (
            <section className="pip-card">
              <h2>{steps[0]}</h2>
              <h3>{t("priorities")}</h3>
              <div className="planning-priorities">
                {priorityKeys.map((p, i) => (
                  <label key={p}>
                    <input
                      type="checkbox"
                      checked={d.directions.priorities.includes(p)}
                      onChange={(e) =>
                        edit({
                          ...d,
                          directions: {
                            ...d.directions,
                            priorities: e.target.checked
                              ? [...d.directions.priorities, p]
                              : d.directions.priorities.filter((v) => v !== p),
                          },
                        })
                      }
                    />
                    {t("priorityLabels", { returnObjects: true })[i]}
                  </label>
                ))}
              </div>
              <div className="planning-grid">
                {d.directions.priorities.includes("other")
                  ? field("otherPriority", t("otherPriority"), d.directions.otherPriority, (v) =>
                      edit({ ...d, directions: { ...d.directions, otherPriority: v } }),
                    )
                  : null}
                {choice(
                  "style",
                  t("style"),
                  d.directions.style ?? "",
                  (["synthetique", "institutionnel", "engage"] as const).map((value, i) => ({
                    value,
                    label: t("styles", { returnObjects: true })[i] ?? value,
                  })),
                  (v) =>
                    edit({
                      ...d,
                      directions: {
                        ...d.directions,
                        style: (v || null) as PlanningDocument["directions"]["style"],
                      },
                    }),
                )}
                {field("signatoryRole", t("signatoryRole"), d.directions.signatoryRole, (v) =>
                  edit({ ...d, directions: { ...d.directions, signatoryRole: v } }),
                )}
                {field("signatoryName", t("signatoryName"), d.directions.signatoryName, (v) =>
                  edit({ ...d, directions: { ...d.directions, signatoryName: v } }),
                )}
              </div>
              {field(
                "internalNote",
                t("internalNote"),
                d.directions.internalNote,
                (v) => edit({ ...d, directions: { ...d.directions, internalNote: v } }),
                true,
              )}
            </section>
          ) : null}
          {policy && step === 2 ? (
            <>
              <section className="pip-card">
                <h2>{steps[1]}</h2>
                <p>{t("axesHelp")}</p>
                {generation("axes", smqPlanning.directionsComplete(data.document))}
                <Button variant="outline" disabled={busy} onClick={() => add("axes")}>
                  {t("addAxis")}
                </Button>
              </section>
              {!d.axes.length ? (
                <p>{t("noItems")}</p>
              ) : (
                d.axes.map((x) => (
                  <article className="pip-card" key={x.id}>
                    <div className="planning-grid">
                      {field("title", t("title"), x.title, (v) => change("axes", x.id, "title", v))}
                      {decision("axes", x.id, x.decision)}
                    </div>
                    {field(
                      "rationale",
                      t("rationale"),
                      x.rationale,
                      (v) => change("axes", x.id, "rationale", v),
                      true,
                    )}
                  </article>
                ))
              )}
            </>
          ) : null}
          {policy && step === 3 ? (
            <section className="pip-card">
              <h2>{steps[2]}</h2>
              <p>{t("statementHelp")}</p>
              {generation("statement", smqPlanning.axesComplete(data.document))}
              {field(
                "statement",
                t("policyTitle"),
                d.statement,
                (v) => edit({ ...d, statement: v }),
                true,
              )}
              <div className="planning-actions">
                <Button
                  disabled={
                    !ready || dirty || busy || !smqPlanning.statementComplete(data.document)
                  }
                  onClick={() => validate("policy")}
                >
                  {t("validatePolicy")}
                </Button>
              </div>
            </section>
          ) : null}
          {policy && step === 4 ? (
            <>
              <section className="pip-card">
                <h2>{steps[3]}</h2>
                <p>{t("objectiveHelp")}</p>
                {generation("objectives", Boolean(validatedPolicy))}
                <Button variant="outline" onClick={() => add("objectives")}>
                  {t("addObjective")}
                </Button>
              </section>
              {d.objectives.map((x) => (
                <article className="pip-card" key={x.id}>
                  <div className="planning-grid">
                    {choice(
                      "axis",
                      t("axis"),
                      x.axisId,
                      d.axes
                        .filter((a) => a.decision === "retained")
                        .map((a) => ({ value: a.id, label: a.title })),
                      (v) => change("objectives", x.id, "axisId", v),
                    )}
                    {field("title", t("title"), x.title, (v) =>
                      change("objectives", x.id, "title", v),
                    )}
                    {decision("objectives", x.id, x.decision)}
                    {(
                      [
                        "indicator",
                        "method",
                        "unit",
                        "baseline",
                        "target",
                        "deadline",
                        "frequency",
                        "owner",
                      ] as const
                    ).map((k) =>
                      field(
                        k,
                        t(k),
                        x[k],
                        (v) => change("objectives", x.id, k, v),
                        false,
                        k === "deadline" ? "date" : "text",
                      ),
                    )}
                  </div>
                </article>
              ))}
              <Button
                disabled={!ready || dirty || busy || !smqPlanning.objectivesComplete(data.document)}
                onClick={() => validate("objectives")}
              >
                {t("validateObjectives")}
              </Button>
            </>
          ) : null}
          {!policy && step === 1 ? (
            <>
              <section className="pip-card">
                <h2>{steps[0]}</h2>
                <p>{t("processHelp")}</p>
                {generation("processes", true)}
                <Button variant="outline" onClick={() => add("processes")}>
                  {t("addProcess")}
                </Button>
              </section>
              {d.processes.map((x) => (
                <article className="pip-card" key={x.id}>
                  <div className="planning-grid">
                    {field("title", t("title"), x.title, (v) =>
                      change("processes", x.id, "title", v),
                    )}
                    {choice(
                      "family",
                      t("family"),
                      x.family,
                      (["management", "realization", "support"] as const).map((value) => ({
                        value,
                        label: t(value),
                      })),
                      (v) => change("processes", x.id, "family", v),
                    )}
                    {decision("processes", x.id, x.decision)}
                    {(["purpose", "inputs", "outputs"] as const).map((k) =>
                      field(k, t(k), x[k], (v) => change("processes", x.id, k, v), true),
                    )}
                  </div>
                </article>
              ))}
            </>
          ) : null}
          {!policy && step === 2 ? (
            <>
              <section className="pip-card">
                <h2>{steps[1]}</h2>
                <p>{t("interactionHelp")}</p>
                {generation("interactions", smqPlanning.processesComplete(data.document))}
                <Button variant="outline" onClick={() => add("interactions")}>
                  {t("addInteraction")}
                </Button>
              </section>
              {d.interactions.map((x) => (
                <article className="pip-card" key={x.id}>
                  <div className="planning-grid">
                    {(["from", "to"] as const).map((k) =>
                      choice(
                        k,
                        t(k),
                        x[k],
                        retainedProcesses.map((p) => ({ value: p.id, label: p.title })),
                        (v) => change("interactions", x.id, k, v),
                      ),
                    )}
                    {field("flow", t("flow"), x.flow, (v) =>
                      change("interactions", x.id, "flow", v),
                    )}
                    {decision("interactions", x.id, x.decision)}
                  </div>
                </article>
              ))}
            </>
          ) : null}
          {!policy && step === 3 ? (
            <section className="pip-card">
              <h2>{steps[2]}</h2>
              <p>{t("pilotHelp")}</p>
              {retainedProcesses.map((x) => (
                <article key={x.id}>
                  <h3>{x.title}</h3>
                  <div className="planning-grid">
                    {(["pilotName", "pilotRole"] as const).map((k) =>
                      field(k, t(k), x[k], (v) => change("processes", x.id, k, v)),
                    )}
                  </div>
                </article>
              ))}
            </section>
          ) : null}
          {!policy && step === 4 ? (
            <section className="pip-card">
              <h2>{steps[3]}</h2>
              <ProcessMap document={d} labels={mapLabels} />
              <h3>{t("pilots")}</h3>
              <table className="planning-table">
                <thead>
                  <tr>
                    <th>{t("title")}</th>
                    <th>{t("pilotName")}</th>
                    <th>{t("pilotRole")}</th>
                  </tr>
                </thead>
                <tbody>
                  {retainedProcesses.map((p) => (
                    <tr key={p.id}>
                      <td>{p.title}</td>
                      <td>{p.pilotName}</td>
                      <td>{p.pilotRole}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="planning-actions">
                <Button
                  disabled={!ready || dirty || busy || !smqPlanning.pilotsComplete(data.document)}
                  onClick={() => validate("processes")}
                >
                  {t("validateMap")}
                </Button>
              </div>
            </section>
          ) : null}
          <div className="planning-actions">
            <Button variant="outline" disabled={!dirty || busy || !data.current} onClick={save}>
              {t("save")}
            </Button>
            {draft ? (
              <Button variant="outline" disabled={busy} onClick={() => setDraft(null)}>
                {t("cancel")}
              </Button>
            ) : null}
            {step > 1 ? (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                {t("previous")}
              </Button>
            ) : null}
            {step < 4 ? (
              <Button disabled={dirty || !gates[step]} onClick={() => setStep(step + 1)}>
                {t("next")}
              </Button>
            ) : null}
          </div>
        </>
      )}
      {data.versions.length ? (
        <section className="pip-card">
          <h2>{t("history")}</h2>
          {data.sources.facts.language === "ar" ? <p>{t("arabicPdf")}</p> : null}
          {data.versions.map((v) => (
            <div className="planning-actions" key={v.id}>
              <span>
                {v.kind === "objectives"
                  ? t("policySteps", { returnObjects: true })[3]
                  : t(v.kind === "policy" ? "policyTitle" : "processesTitle")}{" "}
                · {t("version")} {v.version} · {new Date(v.createdAt).toLocaleDateString()}
              </span>
              {(["docx", "pdf", "xlsx"] as const).map((format) => (
                <Button
                  key={format}
                  variant="outline"
                  disabled={exporting || (format === "pdf" && v.sources.facts.language === "ar")}
                  onClick={() => void download(v, format)}
                >
                  {t(format === "docx" ? "word" : format === "xlsx" ? "excel" : "pdf")}
                </Button>
              ))}
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}
