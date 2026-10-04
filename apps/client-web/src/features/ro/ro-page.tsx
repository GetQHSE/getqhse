import { useModuleStep } from "../../hooks/use-module-step.js";
import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@qhse/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@qhse/ui/components/dialog";
import { Toaster } from "@qhse/ui/components/toast";
import { smqRo } from "@qhse/domain";
import {
  toSupportedLanguage,
  roWriteSchema,
  type RoItem,
  type RoAction,
  type RoRegister,
  type RoLaunch,
  type RoWrite,
} from "@qhse/contracts";
import { clientApi } from "../../app/client-api.js";
import { notify } from "../context/context-ui.js";
import { exportRo } from "./export.js";
import "../pip/pip.css";
import "./ro.css";
type Editor = {
  kind: "item" | "rating" | "controls" | "action" | "progress" | "effectiveness";
  item?: RoItem;
  action?: RoAction;
};
export function RoPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return projectId ? (
    <Toaster>
      <RoAnalysis key={projectId} projectId={projectId} />
    </Toaster>
  ) : null;
}
function RoAnalysis({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation("ro");
  const uiLanguage = toSupportedLanguage(i18n.resolvedLanguage);
  const cache = useQueryClient();
  const key = ["ro-register", projectId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => clientApi.roRegister(projectId),
    refetchInterval: (q) =>
      q.state.data?.runs.some((r) => ["DRAFT", "RUNNING"].includes(r.status)) ? 2500 : false,
  });
  const { step, setStep, explicit } = useModuleStep(6);
  const [landed, setLanded] = useState(false),
    [editor, setEditor] = useState<Editor | null>(null),
    [filter, setFilter] = useState("all"),
    [exporting, setExporting] = useState(false);
  const data = query.data;
  const workflow = smqRo.computeRoWorkflow(data?.items ?? [], data?.outdated ?? false);
  useEffect(() => {
    if (!data || landed || explicit) return;
    const first = workflow.completion.findIndex((v) => !v);
    setStep(data.items.length ? (first === -1 ? 6 : first + 1) : 1);
    setLanded(true);
  }, [data, landed, workflow.completion, explicit, setStep]);
  const write = useMutation({
    mutationFn: (input: RoWrite) => clientApi.writeRo(projectId, input),
    onSuccess: (next) => {
      cache.setQueryData(key, next);
      setEditor(null);
      notify.success(t("saved"));
    },
    onError: () => notify.error(t("failed")),
  });
  const launch = useMutation({
    mutationFn: (input: RoLaunch) => clientApi.launchRo(projectId, input),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: key });
    },
    onError: () => notify.error(t("failed")),
  });
  const validate = useMutation({
    mutationFn: () => clientApi.validateRo(projectId),
    onSuccess: (next) => {
      cache.setQueryData(key, next);
      notify.success(t("saved"));
    },
    onError: () => notify.error(t("failed")),
  });
  if (query.isLoading)
    return (
      <main className="pip-app" aria-busy="true">
        {t("loading")}
      </main>
    );
  if (!data || query.isError)
    return (
      <main className="pip-app" role="alert">
        {t("failed")} <Button onClick={() => void query.refetch()}>{t("retry")}</Button>
      </main>
    );
  const busy =
    write.isPending ||
    launch.isPending ||
    validate.isPending ||
    data.runs.some((r) => ["DRAFT", "RUNNING"].includes(r.status));
  const retained = data.items.filter(smqRo.isRetainedRo);
  const labels = smqRo.RO_EXPORT_LABELS[data.language];
  const review = (item: RoItem, status: RoItem["reviewStatus"]) =>
    write.mutate({
      kind: "item",
      entityId: item.id,
      reviewStatus: status,
      reason: t("reviewReason"),
    });
  const actionReview = (action: RoAction, status: RoAction["reviewStatus"]) =>
    write.mutate({
      kind: "action",
      entityId: action.id,
      reviewStatus: status,
      reason: t("reviewReason"),
    });
  const exportFile = async (format: "xlsx" | "docx" | "pdf") => {
    setExporting(true);
    try {
      await exportRo(data, format);
    } catch {
      notify.error(t("exportFailed"));
    } finally {
      setExporting(false);
    }
  };
  const empty = <p className="pip-empty">{t("empty")}</p>;
  const itemHeader = (item: RoItem) => (
    <>
      <div className="pip-card-head">
        <h2>{item.effective.content.title}</h2>
        <span>{t(item.effective.content.type)}</span>
      </div>
      <p>
        {item.source
          ? `${t("source")} : ${item.source.partyName ?? ""} ${item.source.title}`
          : t("manual")}
      </p>
      <div className="pip-tags">
        <span>{t(`statuses.${item.reviewStatus}`)}</span>
        {item.effective.content.confidence !== null && (
          <span>
            {t("confidence")} {Math.round(item.effective.content.confidence * 100)} %
          </span>
        )}
      </div>
    </>
  );
  return (
    <main className="pip-app ro-app">
      <header className="pip-head">
        <h1>{t("title")}</h1>
        <p>{t("subtitle")}</p>
      </header>
      <nav className="pip-steps" aria-label={t("title")}>
        {([1, 2, 3, 4, 5, 6] as const).map((n) => (
          <button
            key={n}
            className={`pip-step ${step === n ? "active" : ""}`}
            aria-current={step === n ? "step" : undefined}
            onClick={() => setStep(n)}
          >
            {workflow.completion[n - 1] ? "✓ " : ""}
            {n}. {t("steps", { returnObjects: true })[n - 1]}
          </button>
        ))}
      </nav>
      {data.outdated && (
        <p role="status" className="pip-notice">
          {t("outdated")}
        </p>
      )}
      {busy && (
        <p role="status" className="pip-notice">
          {t("running")}
        </p>
      )}
      {data.runs[0]?.status === "FAILED" && (
        <p role="alert" className="pip-error">
          {t("failed")}
        </p>
      )}
      {step === 1 &&
        (["context_issue", "pip_requirement"] as const).map((branch) => (
          <section className="pip-card" key={branch}>
            <h2>{t(`branches.${branch}`)}</h2>
            <p>
              {data.sources.filter((s) => s.branch === branch).length} {t("source")}
            </p>
            {data.sources
              .filter((s) => s.branch === branch)
              .map((s) => (
                <article className="pip-item" key={s.id}>
                  <h3>{s.partyName ?? s.title}</h3>
                  <p>{s.description}</p>
                </article>
              ))}
            {!data.sources.some((s) => s.branch === branch) && <p>{t("noSources")}</p>}
            <Button
              disabled={
                busy ||
                (!data.sources.some((s) => s.branch === branch) &&
                  !data.runs.some((r) => r.branch === branch && r.status === "COMPLETED"))
              }
              onClick={() => launch.mutate({ stage: "GENERATION", branch })}
            >
              {t("generate")}
            </Button>
          </section>
        ))}
      {step === 2 && (
        <>
          <div className="pip-toolbar">
            <div className="pip-filters">
              {(["all", "retained", "pending"] as const).map((f) => (
                <button
                  key={f}
                  className={filter === f ? "selected" : ""}
                  onClick={() => setFilter(f)}
                >
                  {t(
                    f === "all"
                      ? "filterAll"
                      : f === "retained"
                        ? "filterRetained"
                        : "filterPending",
                  )}
                </button>
              ))}
            </div>
            <Button disabled={busy} onClick={() => setEditor({ kind: "item" })}>
              {t("addItem")}
            </Button>
          </div>
          {!data.items.length && empty}
          {data.items
            .filter(
              (i) =>
                filter === "all" ||
                (filter === "retained" && smqRo.isRetainedRo(i)) ||
                (filter === "pending" && i.reviewStatus === "PENDING"),
            )
            .map((item) => (
              <article className="pip-card" key={item.id}>
                {itemHeader(item)}
                <p>{item.effective.content.description}</p>
                <details>
                  <summary>{t("reasoning")}</summary>
                  <p>{item.effective.content.reasoning}</p>
                  <p>
                    {t("causes")} : {item.effective.content.causes}
                  </p>
                  <p>
                    {t("consequences")} : {item.effective.content.consequences}
                  </p>
                </details>
                <div className="pip-actions">
                  <Button disabled={busy} onClick={() => review(item, "VALIDATED")}>
                    {t("review")}
                  </Button>
                  <Button disabled={busy} onClick={() => setEditor({ kind: "item", item })}>
                    {t("edit")}
                  </Button>
                  <Button disabled={busy} onClick={() => review(item, "NOT_RETAINED")}>
                    {t("reject")}
                  </Button>
                  {item.reviewStatus !== "PENDING" && (
                    <Button disabled={busy} onClick={() => review(item, "PENDING")}>
                      {t("reopen")}
                    </Button>
                  )}
                </div>
              </article>
            ))}
        </>
      )}
      {step === 3 && (
        <>
          <p className="pip-notice">{t("method")}</p>
          {!retained.length && empty}
          {retained.map((item) => (
            <article key={item.id} className="pip-card">
              {itemHeader(item)}
              <p>
                {item.effective.content.type === "risk"
                  ? `${t("probability")} ${item.effective.rating?.probability ?? "—"} × ${t("impact")} ${item.effective.rating?.impact ?? "—"}`
                  : `${t("feasibility")} ${item.effective.rating?.feasibility ?? "—"} × ${t("benefit")} ${item.effective.rating?.benefit ?? "—"}`}{" "}
                = {smqRo.roScore(item) ?? "—"} /25 · {item.effective.rating?.priority ?? "—"}
              </p>
              <p>{item.effective.ratingReviewed ? t("ratingReviewed") : t("ratingPending")}</p>
              <Button disabled={busy} onClick={() => setEditor({ kind: "rating", item })}>
                {t("edit")} / {t("review")}
              </Button>
            </article>
          ))}
        </>
      )}
      {step === 4 && (
        <>
          {!retained.length && empty}
          {retained.map((item) => (
            <article className="pip-card" key={item.id}>
              {itemHeader(item)}
              <p>
                {t(
                  item.effective.controlsState === "existing"
                    ? "existing"
                    : item.effective.controlsState === "none"
                      ? "none"
                      : "undeclared",
                )}
              </p>
              {item.effective.controls.map((c) => (
                <p key={c}>{c}</p>
              ))}
              <Button
                disabled={busy || !item.effective.ratingReviewed}
                onClick={() => setEditor({ kind: "controls", item })}
              >
                {t("edit")} / {t("review")}
              </Button>
            </article>
          ))}
        </>
      )}
      {step === 5 && (
        <>
          <p className="pip-notice">{t("covered")}</p>
          <Button
            disabled={busy || !workflow.completion[3] || !retained.some(smqRo.roTreatmentEligible)}
            onClick={() => launch.mutate({ stage: "TREATMENT" })}
          >
            {t("generateActions")}
          </Button>
          {retained
            .filter((i) => i.effective.controlsState === "none")
            .map((item) => (
              <section className="pip-card" key={item.id}>
                {itemHeader(item)}
                {item.actions.map((action) => (
                  <article className="pip-item" key={action.id}>
                    <h3>{action.content.title}</h3>
                    <p>
                      {action.content.process} · {action.content.owner} ·{" "}
                      {action.content.plannedDate}
                    </p>
                    <p>{action.content.criterion}</p>
                    <p>{t(`statuses.${action.reviewStatus}`)}</p>
                    <small>{t("proposalNotice")}</small>
                    <div className="pip-actions">
                      <Button
                        disabled={busy}
                        onClick={() => setEditor({ kind: "action", item, action })}
                      >
                        {t("edit")}
                      </Button>
                      <Button disabled={busy} onClick={() => actionReview(action, "VALIDATED")}>
                        {t("review")}
                      </Button>
                      <Button disabled={busy} onClick={() => actionReview(action, "NOT_RETAINED")}>
                        {t("reject")}
                      </Button>
                    </div>
                  </article>
                ))}
                <Button
                  disabled={busy || !smqRo.roTreatmentEligible(item)}
                  onClick={() => setEditor({ kind: "action", item })}
                >
                  {t("addAction")}
                </Button>
              </section>
            ))}
        </>
      )}
      {step === 6 && (
        <>
          <div className="pip-kpis">
            <div>
              <b>{workflow.retained}</b>
              <span>{t("retained")}</span>
            </div>
            <div>
              <b>{workflow.unresolved}</b>
              <span>{t("unresolved")}</span>
            </div>
            <div>
              <b>{workflow.actionsNeeded}</b>
              <span>{t("actionsNeeded")}</span>
            </div>
          </div>
          <div className="pip-actions">
            <Button disabled={busy || !workflow.complete} onClick={() => validate.mutate()}>
              {data.validatedAt ? t("validated") : t("validate")}
            </Button>
            {(["xlsx", "docx", "pdf"] as const).map((format) => (
              <Button
                key={format}
                disabled={
                  busy ||
                  exporting ||
                  !data.validatedAt ||
                  !workflow.complete ||
                  (format === "pdf" && data.language === "ar")
                }
                onClick={() => void exportFile(format)}
              >
                {format === "xlsx" ? "Excel" : format === "docx" ? "Word" : "PDF"}
              </Button>
            ))}
          </div>
          {data.language === "ar" && <p>{t("arabicPdf")}</p>}
          {(["pip_requirement", "context_issue", "manual"] as const).map((branch) => {
            const items = retained.filter((i) => (i.source?.branch ?? "manual") === branch);
            if (!items.length) return null;
            return (
              <section className="pip-card" key={branch}>
                <h2>{branch === "manual" ? t("manual") : t(`branches.${branch}`)}</h2>
                <div className="pip-register">
                  <table>
                    <thead>
                      <tr>
                        {labels.headers.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {smqRo.roRegisterRows(items, data.language).map((row, i) => (
                        <tr key={i}>
                          {row.map((v, j) => (
                            <td key={j}>{v}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
          {retained.flatMap((item) =>
            item.actions.filter(smqRo.isRetainedRo).map((action) => (
              <article className="pip-card" key={action.id}>
                <h3>{action.content.title}</h3>
                <p>
                  {action.content.owner} · {action.content.plannedDate} ·{" "}
                  {smqRo.RO_EVENT_LABELS[uiLanguage][action.progress?.status ?? "todo"]}{" "}
                  {action.progress?.percent ?? 0}%{" "}
                  {smqRo.roOverdue(action, new Date().toISOString().slice(0, 10))
                    ? t("overdue")
                    : ""}
                </p>
                <p>
                  {action.content.criterion} · {action.content.effectivenessDate}
                </p>
                <div className="pip-actions">
                  <Button
                    disabled={busy}
                    onClick={() => setEditor({ kind: "progress", item, action })}
                  >
                    {t("progress")}
                  </Button>
                  <Button
                    disabled={busy || action.progress?.status !== "completed"}
                    onClick={() => setEditor({ kind: "effectiveness", item, action })}
                  >
                    {t("effectiveness")}
                  </Button>
                </div>
                {action.effectiveness.map((r, index) => (
                  <p key={index}>
                    {r.date} · {smqRo.RO_EVENT_LABELS[uiLanguage][r.result]} · {r.measuredValue} ·{" "}
                    {r.comment}
                  </p>
                ))}
              </article>
            )),
          )}
        </>
      )}
      <details className="pip-card">
        <summary>{t("history")}</summary>
        {data.runs.map((r) => (
          <p key={r.id}>
            {r.createdAt} · {r.branch ?? r.stage} · {r.status}
          </p>
        ))}
      </details>
      <div className="pip-nav-actions">
        {step > 1 && (
          <Button onClick={() => setStep(step - 1)}>
            ← {t("steps", { returnObjects: true })[step - 2]}
          </Button>
        )}
        {step < 6 && (
          <Button onClick={() => setStep(step + 1)}>
            {t("steps", { returnObjects: true })[step]} →
          </Button>
        )}
      </div>
      {editor && (
        <RoEditor
          editor={editor}
          register={data}
          busy={busy}
          onClose={() => setEditor(null)}
          onSave={(input) => write.mutate(input)}
        />
      )}
    </main>
  );
}
function RoEditor({
  editor,
  register,
  busy,
  onClose,
  onSave,
}: {
  editor: Editor;
  register: RoRegister;
  busy: boolean;
  onClose: () => void;
  onSave: (input: RoWrite) => void;
}) {
  const { t, i18n } = useTranslation("ro");
  const uiLanguage = toSupportedLanguage(i18n.resolvedLanguage);
  const c = editor.item?.effective.content,
    a = editor.action?.content,
    r = editor.item?.effective.rating;
  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState(c?.type ?? "risk");
  const [controlsState, setControlsState] = useState(
    editor.item?.effective.controlsState === "existing" ? "existing" : "none",
  );
  const field = (name: string, label: string, value = "", kind = "text", required = false) => (
    <label>
      {label}
      <input
        name={name}
        defaultValue={value}
        type={kind}
        required={required}
        {...(kind === "number" ? { min: 1, max: 5 } : {})}
      />
    </label>
  );
  const area = (name: string, label: string, value = "", required = false) => (
    <label>
      {label}
      <textarea name={name} defaultValue={value} required={required} />
    </label>
  );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const get = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" ? value.trim() : "";
    };
    const reason = get("reason");
    let input: unknown;
    if (editor.kind === "item") {
      const content = {
        type,
        title: get("title"),
        description: get("description"),
        causes: get("causes"),
        consequences: get("consequences"),
        reasoning: get("reasoning"),
        confidence: c?.confidence ?? null,
      };
      input = editor.item
        ? { kind: "item", entityId: editor.item.id, reviewStatus: "MODIFIED", content, reason }
        : { kind: "add_item", sourceId: get("sourceId") || null, content, reason };
    } else if (editor.kind === "rating") {
      const risk = editor.item?.effective.content.type === "risk";
      input = {
        kind: "rating",
        entityId: editor.item?.id,
        reason,
        rating: {
          probability: risk ? Number(get("probability")) : null,
          impact: risk ? Number(get("impact")) : null,
          feasibility: risk ? null : Number(get("feasibility")),
          benefit: risk ? null : Number(get("benefit")),
          priority: get("priority"),
          reasoning: get("reasoning"),
        },
      };
    } else if (editor.kind === "controls")
      input = {
        kind: "controls",
        entityId: editor.item?.id,
        reason,
        state: controlsState,
        controls:
          controlsState === "none"
            ? []
            : get("controls")
                .split("\n")
                .map((v) => v.trim())
                .filter(Boolean),
      };
    else if (editor.kind === "action") {
      const content = {
        title: get("title"),
        description: get("description"),
        process: get("process"),
        owner: get("owner"),
        objective: get("objective"),
        resources: get("resources"),
        budget: get("budget"),
        plannedDate: get("plannedDate"),
        criterion: get("criterion"),
        effectivenessDate: get("effectivenessDate"),
      };
      input = editor.action
        ? { kind: "action", entityId: editor.action.id, reviewStatus: "MODIFIED", content, reason }
        : { kind: "add_action", entityId: editor.item?.id, content, reason };
    } else if (editor.kind === "progress")
      input = {
        kind: "progress",
        entityId: editor.action?.id,
        reason,
        content: {
          status: get("status"),
          percent: Number(get("percent")),
          actualDate: get("actualDate") || null,
          comment: get("comment"),
        },
      };
    else
      input = {
        kind: "effectiveness",
        entityId: editor.action?.id,
        reason,
        content: {
          date: get("date"),
          result: get("result"),
          measuredValue: get("measuredValue"),
          comment: get("comment"),
        },
      };
    const parsed = roWriteSchema.safeParse(input);
    if (!parsed.success) {
      notify.error(t("failed"));
      return;
    }
    onSave(parsed.data);
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="pip-app pip-editor ro-editor">
        <DialogTitle>
          {t(
            editor.kind === "rating"
              ? "ratingPending"
              : editor.kind === "controls"
                ? "controls"
                : editor.kind === "progress"
                  ? "progress"
                  : editor.kind === "effectiveness"
                    ? "effectiveness"
                    : "edit",
          )}
        </DialogTitle>
        <form onSubmit={submit}>
          {editor.kind === "item" && (
            <>
              {!editor.item && (
                <label>
                  {t("source")}
                  <select name="sourceId">
                    <option value="">{t("manual")}</option>
                    {register.sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.partyName ?? ""} {s.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                {t("type")}
                <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                  <option value="risk">{t("risk")}</option>
                  <option value="opportunity">{t("opportunity")}</option>
                </select>
              </label>
              {field("title", t("name"), c?.title ?? "", "text", true)}
              {area("description", t("description"), c?.description ?? "", true)}
              {area("causes", t("causes"), c?.causes)}
              {area("consequences", t("consequences"), c?.consequences)}
              {area("reasoning", t("reasoning"), c?.reasoning ?? "", true)}
            </>
          )}
          {editor.kind === "rating" && (
            <>
              {editor.item?.effective.content.type === "risk" ? (
                <>
                  {field(
                    "probability",
                    t("probability"),
                    String(r?.probability ?? 1),
                    "number",
                    true,
                  )}
                  {field("impact", t("impact"), String(r?.impact ?? 1), "number", true)}
                </>
              ) : (
                <>
                  {field(
                    "feasibility",
                    t("feasibility"),
                    String(r?.feasibility ?? 1),
                    "number",
                    true,
                  )}
                  {field("benefit", t("benefit"), String(r?.benefit ?? 1), "number", true)}
                </>
              )}
              <label>
                {t("priority")}
                <select name="priority" defaultValue={r?.priority ?? "P3"}>
                  {["P1", "P2", "P3", "P4"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              {area("reasoning", t("reasoning"), r?.reasoning ?? "", true)}
            </>
          )}
          {editor.kind === "controls" && (
            <>
              <label>
                {t("controls")}
                <select value={controlsState} onChange={(e) => setControlsState(e.target.value)}>
                  <option value="existing">{t("existing")}</option>
                  <option value="none">{t("none")}</option>
                </select>
              </label>
              {controlsState === "existing" &&
                area(
                  "controls",
                  t("controls"),
                  editor.item?.effective.controls.join("\n") ?? "",
                  true,
                )}
            </>
          )}
          {editor.kind === "action" && (
            <>
              <p>{t("proposalNotice")}</p>
              {field("title", t("name"), a?.title ?? "", "text", true)}
              {area("description", t("description"), a?.description)}
              {field("process", t("process"), a?.process ?? "", "text", true)}
              {field("owner", t("owner"), a?.owner ?? "", "text", true)}
              {field("objective", t("objective"), a?.objective)}
              {field("resources", t("resources"), a?.resources)}
              {field("budget", t("budget"), a?.budget)}
              {field("plannedDate", t("plannedDate"), a?.plannedDate ?? today, "date", true)}
              {area("criterion", t("criterion"), a?.criterion ?? "", true)}
              {field(
                "effectivenessDate",
                t("effectivenessDate"),
                a?.effectivenessDate ?? today,
                "date",
                true,
              )}
            </>
          )}
          {editor.kind === "progress" && (
            <>
              <label>
                {t("status")}
                <select name="status" defaultValue={editor.action?.progress?.status ?? "todo"}>
                  {(["todo", "in_progress", "completed", "cancelled"] as const).map((v) => (
                    <option value={v} key={v}>
                      {smqRo.RO_EVENT_LABELS[uiLanguage][v]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("percent")}
                <input
                  name="percent"
                  type="number"
                  min={0}
                  max={100}
                  required
                  defaultValue={editor.action?.progress?.percent ?? 0}
                />
              </label>
              {field(
                "actualDate",
                t("actualDate"),
                editor.action?.progress?.actualDate ?? "",
                "date",
              )}
              {area("comment", t("comment"), "", true)}
            </>
          )}
          {editor.kind === "effectiveness" && (
            <>
              {field("date", t("reviewDate"), today, "date", true)}
              <label>
                {t("result")}
                <select name="result">
                  {(["effective", "partially_effective", "ineffective"] as const).map((v) => (
                    <option key={v} value={v}>
                      {smqRo.RO_EVENT_LABELS[uiLanguage][v]}
                    </option>
                  ))}
                </select>
              </label>
              {area("measuredValue", t("measuredValue"), "", true)}
              {area("comment", t("comment"), "", true)}
            </>
          )}
          {area("reason", t("reason"), "", true)}
          <div className="pip-actions">
            <Button type="submit" disabled={busy}>
              {t("save")}
            </Button>
            <Button type="button" onClick={onClose}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
