import { useModuleStep } from "../../hooks/use-module-step.js";
import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@qhse/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@qhse/ui/components/dialog";
import { toSupportedLanguage } from "@qhse/contracts";
import { Toaster } from "@qhse/ui/components/toast";
import { smqPip } from "@qhse/domain";
import type {
  PipRegister,
  PipParty,
  PipRequirement,
  PipEvaluation,
  PipReview,
  PipAllocation,
  PipAddParty,
  PipAddRequirement,
  PipAnswer,
  PipLaunch,
} from "@qhse/contracts";
import { clientApi } from "../../app/client-api.js";
import { notify } from "../context/context-ui.js";
import { exportPip } from "./export.js";
import "./pip.css";

const {
  isRetained,
  needsAllocation,
  computePipWorkflow,
  computeCriticality,
  powerInterestStrategy,
} = smqPip;
type Action =
  | { type: "review"; input: PipReview }
  | { type: "allocation"; input: PipAllocation }
  | { type: "party"; input: PipAddParty }
  | { type: "requirement"; input: PipAddRequirement }
  | { type: "answer"; input: PipAnswer }
  | { type: "validate" };
type Editor =
  | { type: "party"; party?: PipParty }
  | {
      type: "requirement";
      party: PipParty;
      item?: PipRequirement;
      kind?: PipRequirement["content"]["kind"];
    }
  | { type: "evaluation"; party: PipParty; evaluation: PipEvaluation }
  | { type: "allocation"; item: PipRequirement };

export function PipPage() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) return null;
  return (
    <Toaster>
      <PipAnalysis key={projectId} projectId={projectId} />
    </Toaster>
  );
}
function PipAnalysis({ projectId }: { projectId: string }) {
  const { t } = useTranslation("pip");
  const cache = useQueryClient();
  const key = ["pip-register", projectId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => clientApi.pipRegister(projectId),
    refetchInterval: (q) =>
      q.state.data?.runs.some((r) => r.status === "DRAFT" || r.status === "RUNNING") ? 2500 : false,
  });
  const { step, setStep, explicit } = useModuleStep(5);
  const [landed, setLanded] = useState(false);
  const [filter, setFilter] = useState<
    "all" | "retained" | "pending" | "validated" | "rejected" | "added"
  >("all");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [method, setMethod] = useState<PipLaunch["method"]>("both");
  const [exporting, setExporting] = useState(false);
  const register = query.data;
  const workflow = computePipWorkflow(
    register?.parties ?? [],
    register?.evaluationMethod ?? "both",
    register?.outdated ?? false,
  );
  useEffect(() => {
    if (!register || landed) return;
    const first = workflow.completion.findIndex((done) => !done);
    if (!explicit) setStep(register.parties.length === 0 ? 1 : first === -1 ? 5 : first + 1);
    setMethod(register.evaluationMethod);
    setLanded(true);
  }, [register, landed, workflow.completion, explicit, setStep]);
  const errorText = (error: unknown) => {
    const obj = error as { body?: { message?: unknown }; message?: string };
    const code = typeof obj.body?.message === "string" ? obj.body.message : obj.message;
    const codes = [
      "PIP_PROFILE_REQUIRED",
      "PIP_RUN_ACTIVE",
      "PIP_INVENTORY_REQUIRED",
      "PIP_ALLOCATION_REQUIRED",
      "PIP_INPUT_CHANGED",
      "PIP_REGISTER_INCOMPLETE",
      "PIP_PARTY_EXISTS",
      "PIP_REQUIREMENT_EXISTS",
      "PIP_EVALUATION_INCOMPLETE",
      "PIP_ANALYSIS_FAILED",
      "PIP_QUEUE_UNAVAILABLE",
    ] as const;
    const found = codes.find((c) => c === code);
    return found ? t(`errors.${found}`) : t("failed");
  };
  const write = useMutation({
    mutationFn: (action: Action): Promise<PipRegister> => {
      switch (action.type) {
        case "review":
          return clientApi.reviewPip(projectId, action.input);
        case "allocation":
          return clientApi.allocatePip(projectId, action.input);
        case "party":
          return clientApi.addPipParty(projectId, action.input);
        case "requirement":
          return clientApi.addPipRequirement(projectId, action.input);
        case "answer":
          return clientApi.answerPip(projectId, action.input);
        case "validate":
          return clientApi.validatePip(projectId);
      }
    },
    onSuccess: (next) => {
      cache.setQueryData(key, next);
      setEditor(null);
      notify.success(t("saved"));
    },
    onError: (e) => notify.error(errorText(e)),
  });
  const launch = useMutation({
    mutationFn: (stage: PipLaunch["stage"]) => clientApi.launchPip(projectId, { stage, method }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: key });
    },
    onError: (e) => notify.error(errorText(e)),
  });
  if (query.isLoading)
    return (
      <div className="pip-app" aria-busy="true">
        {t("loading")}
      </div>
    );
  if (!register || query.isError)
    return (
      <div className="pip-app" role="alert">
        {t("loadFailed")} <Button onClick={() => void query.refetch()}>{t("retry")}</Button>
      </div>
    );
  const active = register.runs.some((r) => r.status === "DRAFT" || r.status === "RUNNING");
  const busy = active || launch.isPending || write.isPending;
  const retained = register.parties.filter(isRetained);
  const filtered = register.parties.filter(
    (p) =>
      filter === "all" ||
      (filter === "retained" && isRetained(p)) ||
      (filter === "pending" && p.reviewStatus === "PENDING") ||
      (filter === "validated" && isRetained(p)) ||
      (filter === "rejected" && p.reviewStatus === "NOT_RETAINED") ||
      (filter === "added" && p.origin === "user"),
  );
  const review = (
    entityType: PipReview["entityType"],
    entityId: string,
    reviewStatus: PipReview["reviewStatus"],
  ) => {
    write.mutate({
      type: "review",
      input: { entityType, entityId, reviewStatus, reason: t("reviewReason") },
    });
  };
  const progress =
    step === 2
      ? t("requirementsProgress", workflow.requirements)
      : step === 3
        ? t("allocationProgress", workflow.allocations)
        : t("evaluationProgress", workflow.evaluations);
  const exported = async (format: "xlsx" | "docx" | "pdf") => {
    setExporting(true);
    try {
      await exportPip(register, format);
    } catch {
      notify.error(t("exportFailed"));
    } finally {
      setExporting(false);
    }
  };
  const labels = smqPip.PIP_EXPORT_LABELS[register.language];
  const canExport = !!register.validatedAt && workflow.complete && !busy;
  return (
    <main className="pip-app">
      <header className="pip-head">
        <h1>{t("title")}</h1>
        <p>{t("subtitle")}</p>
      </header>
      <nav className="pip-steps" aria-label={t("title")}>
        {([1, 2, 3, 4, 5] as const).map((n) => (
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
      {register.outdated && (
        <p className="pip-notice" role="status">
          {t("outdated")}
        </p>
      )}
      {active && (
        <p className="pip-notice" role="status" aria-live="polite">
          {t("running")}
        </p>
      )}
      {register.runs[0]?.status === "FAILED" && (
        <p className="pip-error" role="alert">
          {errorText({ message: register.runs[0].errorMessage ?? "PIP_ANALYSIS_FAILED" })}
        </p>
      )}
      {step === 1 && (
        <>
          {register.clarifications.length > 0 && (
            <section className="pip-card">
              <h2>{t("clarifications")}</h2>
              {register.clarifications.map((c) => (
                <Clarification
                  key={`${c.id}:${c.answer ?? ""}`}
                  clarification={c}
                  busy={busy}
                  onSave={(answer) => write.mutate({ type: "answer", input: { id: c.id, answer } })}
                />
              ))}
            </section>
          )}
          <div className="pip-toolbar">
            <div className="pip-filters">
              {(["all", "retained", "pending", "validated", "rejected", "added"] as const).map(
                (f) => (
                  <button
                    key={f}
                    aria-pressed={filter === f}
                    className={filter === f ? "selected" : ""}
                    onClick={() => setFilter(f)}
                  >
                    {t(`filters.${f}`)}
                  </button>
                ),
              )}
            </div>
            <div className="pip-actions">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setEditor({ type: "party" })}
              >
                ＋ {t("addParty")}
              </Button>
              <Button disabled={busy} onClick={() => launch.mutate("INVENTORY")}>
                {t(register.parties.length ? "regenerate" : "generate")}
              </Button>
            </div>
          </div>
          {(["internal", "external"] as const).map((scope) => (
            <section key={scope}>
              {filtered.some((p) => p.content.scope === scope) && (
                <h2 className="pip-group-label">{t(`scope.${scope}`)}</h2>
              )}
              {filtered
                .filter((p) => p.content.scope === scope)
                .map((party) => (
                  <article className="pip-card" key={party.id}>
                    <div className="pip-card-head">
                      <div>
                        <h3>{party.content.name}</h3>
                        <div className="pip-tags">
                          <Status status={party.reviewStatus} />
                          <span>{party.content.category}</span>
                          <span>{t(`scope.${scope}`)}</span>
                          <span>{t(`relevance.${party.content.relevance}`)}</span>
                          {party.origin === "user" && <span>{t("userAdded")}</span>}
                        </div>
                      </div>
                      {party.content.confidence != null && (
                        <small>
                          {t("confidence", { value: Math.round(party.content.confidence * 100) })}
                        </small>
                      )}
                    </div>
                    <p>{party.content.description}</p>
                    <details>
                      <summary>{t("why")}</summary>
                      <p>{party.content.reasoning}</p>
                      {party.content.evidence.map((e, i) => (
                        <blockquote key={i}>{e.excerpt}</blockquote>
                      ))}
                    </details>
                    <div className="pip-actions">
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => setEditor({ type: "party", party })}
                      >
                        {t("edit")}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          review("party", party.id, isRetained(party) ? "PENDING" : "VALIDATED")
                        }
                      >
                        {t(isRetained(party) ? "reopen" : "validate")}
                      </Button>
                      {party.reviewStatus !== "NOT_RETAINED" && (
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => review("party", party.id, "NOT_RETAINED")}
                        >
                          {t("reject")}
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
            </section>
          ))}
          {filtered.length === 0 && <p className="pip-empty">{t("empty")}</p>}
        </>
      )}
      {step === 2 && (
        <>
          <section className="pip-card pip-stage-head">
            <div>
              <h2>{t("steps", { returnObjects: true })[1]}</h2>
              <p>{t("needsIntro")}</p>
              <small>{progress}</small>
            </div>
            <Button
              disabled={busy || !workflow.completion[0]}
              onClick={() => launch.mutate("REQUIREMENTS")}
            >
              {t("generateRequirements")}
            </Button>
          </section>
          {!workflow.completion[0] && <p className="pip-notice">{t("inventoryFirst")}</p>}
          {retained.map((party) => (
            <section className="pip-card" key={party.id}>
              <h3>{party.content.name}</h3>
              {(["need", "qms_requirement", "operational_disposition"] as const).map((kind) => (
                <div key={kind} className="pip-section">
                  <div className="pip-toolbar">
                    <h4>{t(`kinds.${kind}`)}</h4>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setEditor({ type: "requirement", party, kind })}
                    >
                      ＋ {t("add")}
                    </Button>
                  </div>
                  {party.requirements
                    .filter((r) => r.content.kind === kind)
                    .map((item) => (
                      <div className="pip-item" key={item.id}>
                        <p>{item.content.text}</p>
                        <div className="pip-tags">
                          <Status status={item.reviewStatus} />
                          <span>{t(`sources.${item.content.sourceType}`)}</span>
                        </div>
                        <details>
                          <summary>{t("why")}</summary>
                          <p>{item.content.reasoning}</p>
                          {item.content.sourceLabel && <p>{item.content.sourceLabel}</p>}
                          {item.content.sourceUrl &&
                            /^https?:\/\//i.test(item.content.sourceUrl) && (
                              <a href={item.content.sourceUrl} target="_blank" rel="noreferrer">
                                {t("evidence")} ↗
                              </a>
                            )}
                        </details>
                        <div className="pip-actions">
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              review(
                                "requirement",
                                item.id,
                                isRetained(item) ? "PENDING" : "VALIDATED",
                              )
                            }
                          >
                            {t(isRetained(item) ? "reopen" : "validate")}
                          </Button>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => setEditor({ type: "requirement", party, item })}
                          >
                            {t("edit")}
                          </Button>
                          {item.reviewStatus !== "NOT_RETAINED" && (
                            <Button
                              variant="ghost"
                              disabled={busy}
                              onClick={() => review("requirement", item.id, "NOT_RETAINED")}
                            >
                              {t("reject")}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              ))}
            </section>
          ))}
        </>
      )}
      {step === 3 && (
        <>
          <section className="pip-card">
            <h2>{t("steps", { returnObjects: true })[2]}</h2>
            <p>{t("allocationIntro")}</p>
            <small>{progress}</small>
          </section>
          {retained.map((party) => (
            <section className="pip-card" key={party.id}>
              <h3>{party.content.name}</h3>
              {party.requirements
                .filter((r) => isRetained(r) && needsAllocation(r))
                .map((item) => (
                  <div className="pip-item" key={item.id}>
                    <div className="pip-tags">
                      <span>{t(`kinds.${item.content.kind}`)}</span>
                      {item.allocationReviewed && (
                        <span className="ok">✓ {t("statuses.VALIDATED")}</span>
                      )}
                    </div>
                    <p>{item.content.text}</p>
                    <div className="pip-tags">
                      {item.services.map((s) => (
                        <span key={s}>{s}</span>
                      ))}
                      {item.noServiceConfirmed && <span>{t("noService")}</span>}
                    </div>
                    <div className="pip-actions">
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => setEditor({ type: "allocation", item })}
                      >
                        {t("edit")}
                      </Button>
                      <Button
                        disabled={busy || item.services.length === 0}
                        onClick={() =>
                          write.mutate({
                            type: "allocation",
                            input: {
                              requirementId: item.id,
                              services: item.services,
                              noServiceConfirmed: false,
                              reason: t("reviewReason"),
                            },
                          })
                        }
                      >
                        {t("confirmAllocation")}
                      </Button>
                    </div>
                  </div>
                ))}
              {!party.requirements.some((r) => isRetained(r) && needsAllocation(r)) && (
                <p>{t("noAllocation")}</p>
              )}
            </section>
          ))}
        </>
      )}
      {step === 4 && (
        <>
          <section className="pip-card">
            <h2>{t("steps", { returnObjects: true })[3]}</h2>
            <p>{t("scoringNotice")}</p>
            <div className="pip-toolbar">
              <label>
                {t("steps", { returnObjects: true })[3]}{" "}
                <select
                  value={method}
                  disabled={busy}
                  onChange={(e) => setMethod(e.target.value as PipLaunch["method"])}
                >
                  {(["power_interest", "criticality", "both"] as const).map((m) => (
                    <option key={m} value={m}>
                      {t(`methods.${m}`)}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                disabled={busy || !workflow.completion[2]}
                onClick={() => launch.mutate("EVALUATION")}
              >
                {t("generateEvaluation")}
              </Button>
            </div>
            {method !== register.evaluationMethod && <p>{t("methodChanged")}</p>}
            <small>{progress}</small>
          </section>
          {!workflow.completion[2] && <p className="pip-notice">{t("allocationFirst")}</p>}
          {register.evaluationMethod !== "criticality" && <PowerInterest parties={retained} />}
          {retained.map((party) => {
            const e = party.evaluation;
            const score = computeCriticality(e?.content.impact, e?.content.requirementLevel);
            return (
              <section className="pip-card" key={party.id}>
                <div className="pip-card-head">
                  <h3>{party.content.name}</h3>
                  {e && <Status status={e.reviewStatus} />}
                </div>
                {e && (
                  <>
                    <div className="pip-tags">
                      {register.evaluationMethod !== "criticality" && (
                        <span>
                          {t("fields.power")} {e.content.power} /5 · {t("fields.interest")}{" "}
                          {e.content.interest} /5
                        </span>
                      )}
                      {register.evaluationMethod !== "power_interest" && (
                        <span>{t("criticality", { value: score ?? "—" })}</span>
                      )}
                    </div>
                    <p>
                      {e.content.monitoringMethod} · {e.content.monitoringFrequency}
                    </p>
                    <details>
                      <summary>{t("why")}</summary>
                      <p>{e.content.reasoning}</p>
                    </details>
                    <div className="pip-actions">
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => setEditor({ type: "evaluation", party, evaluation: e })}
                      >
                        {t("edit")}
                      </Button>
                      <Button
                        disabled={busy || !workflow.completion[2]}
                        onClick={() =>
                          review("evaluation", e.id, isRetained(e) ? "PENDING" : "VALIDATED")
                        }
                      >
                        {t(isRetained(e) ? "reopen" : "validate")}
                      </Button>
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </>
      )}
      {step === 5 && (
        <>
          <section className="pip-card">
            <div className="pip-card-head">
              <div>
                <h2>
                  {t(
                    register.validatedAt && workflow.complete
                      ? "validatedRegister"
                      : "draftRegister",
                  )}
                </h2>
                <p>
                  {register.organizationName} · {register.projectName} · {register.standard} ·
                  pip-v1
                </p>
              </div>
              <div className="pip-actions">
                {(["xlsx", "docx", "pdf"] as const).map((format) => (
                  <Button
                    key={format}
                    variant="outline"
                    disabled={
                      !canExport || exporting || (format === "pdf" && register.language === "ar")
                    }
                    onClick={() => void exported(format)}
                  >
                    {format === "xlsx" ? "Excel" : format === "docx" ? "Word" : "PDF"}
                  </Button>
                ))}
              </div>
            </div>
            {register.language === "ar" && <p>{t("pdfUnavailable")}</p>}
            <div className="pip-kpis">
              <div>
                <b>{retained.length}</b>
                <span>{t("retainedCount")}</span>
              </div>
              <div>
                <b>
                  {workflow.requirements.reviewed}/{workflow.requirements.total}
                </b>
                <span>{t("steps", { returnObjects: true })[1]}</span>
              </div>
              <div>
                <b>
                  {workflow.allocations.reviewed}/{workflow.allocations.total}
                </b>
                <span>{t("steps", { returnObjects: true })[2]}</span>
              </div>
              <div>
                <b>
                  {workflow.evaluations.reviewed}/{workflow.evaluations.total}
                </b>
                <span>{t("steps", { returnObjects: true })[3]}</span>
              </div>
            </div>
            {workflow.unresolved > 0 && <p>{t("unresolved", { count: workflow.unresolved })}</p>}
            <Button
              disabled={!workflow.complete || busy || !!register.validatedAt}
              onClick={() => write.mutate({ type: "validate" })}
            >
              {t("finalize")}
            </Button>
          </section>
          <p className="pip-notice">{t("monitoringNotice")}</p>
          {register.evaluationMethod !== "criticality" && <PowerInterest parties={retained} />}
          <div className="pip-register">
            <table>
              <thead>
                <tr>
                  {labels.headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {smqPip
                  .pipRegisterRows(register.parties, register.evaluationMethod, register.language)
                  .map((row, i) => (
                    <tr key={retained[i]?.id}>
                      {row.map((cell, j) => (
                        <td key={j}>{cell}</td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <details className="pip-card">
            <summary>{t("history")}</summary>
            {register.runs.map((run) => (
              <p key={run.id}>
                {
                  t("steps", { returnObjects: true })[
                    run.stage === "INVENTORY" ? 0 : run.stage === "REQUIREMENTS" ? 1 : 3
                  ]
                }{" "}
                · {t(`statuses.${run.status}`)} · {new Date(run.createdAt).toLocaleString()} ·{" "}
                {run.model ?? "—"}
              </p>
            ))}
          </details>
        </>
      )}
      <footer className="pip-nav-actions">
        <Button variant="outline" disabled={step === 1} onClick={() => setStep(step - 1)}>
          {t("previous")}
        </Button>
        {step < 5 && <Button onClick={() => setStep(step + 1)}>{t("continue")}</Button>}
      </footer>
      {editor && (
        <PipEditor
          key={`${editor.type}:${"party" in editor ? (editor.party?.id ?? "new") : editor.type === "allocation" ? editor.item.id : "new"}`}
          editor={editor}
          method={register.evaluationMethod}
          busy={write.isPending}
          onCancel={() => setEditor(null)}
          onSave={(action) => write.mutate(action)}
        />
      )}
    </main>
  );
}
function Status({ status }: { status: PipReview["reviewStatus"] }) {
  const { t } = useTranslation("pip");
  return (
    <span className={status === "VALIDATED" || status === "MODIFIED" ? "ok" : ""}>
      {t(`statuses.${status}`)}
    </span>
  );
}
function Clarification({
  clarification,
  busy,
  onSave,
}: {
  clarification: PipRegister["clarifications"][number];
  busy: boolean;
  onSave: (answer: string) => void;
}) {
  const { t } = useTranslation("pip");
  const [answer, setAnswer] = useState(clarification.answer ?? "");
  return (
    <form
      className="pip-section"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(answer);
      }}
    >
      <label htmlFor={`answer-${clarification.id}`}>{clarification.question}</label>
      <p>{clarification.rationale}</p>
      <div className="pip-toolbar">
        <textarea
          id={`answer-${clarification.id}`}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          required
          maxLength={4000}
        />
        <Button disabled={busy || !answer.trim()} type="submit">
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
function PowerInterest({ parties }: { parties: PipParty[] }) {
  const { t, i18n } = useTranslation("pip");
  return (
    <section className="pip-card">
      <h2>{t("methods.power_interest")}</h2>
      <div className="pip-matrix">
        {(["keep_satisfied", "key_actor", "monitor", "keep_informed"] as const).map((strategy) => (
          <div key={strategy}>
            <h4>
              {
                smqPip.PIP_EXPORT_LABELS[toSupportedLanguage(i18n.resolvedLanguage)].strategies[
                  strategy
                ]
              }
            </h4>
            {parties
              .filter(
                (p) =>
                  powerInterestStrategy(
                    p.evaluation?.content.power,
                    p.evaluation?.content.interest,
                  ) === strategy,
              )
              .map((p) => (
                <p key={p.id}>
                  {p.content.name}{" "}
                  <small>
                    ({p.evaluation?.content.power}/5 · {p.evaluation?.content.interest}/5)
                  </small>
                </p>
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function PipEditor({
  editor,
  method,
  busy,
  onCancel,
  onSave,
}: {
  editor: Editor;
  method: PipLaunch["method"];
  busy: boolean;
  onCancel: () => void;
  onSave: (action: Action) => void;
}) {
  const { t } = useTranslation("pip");
  const [name, setName] = useState(
    editor.type === "party" ? (editor.party?.content.name ?? "") : "",
  );
  const [description, setDescription] = useState(
    editor.type === "party" ? (editor.party?.content.description ?? "") : "",
  );
  const [category, setCategory] = useState(
    editor.type === "party" ? (editor.party?.content.category ?? "") : "",
  );
  const [scope, setScope] = useState<"internal" | "external">(
    editor.type === "party" ? (editor.party?.content.scope ?? "external") : "external",
  );
  const [relevance, setRelevance] = useState<PipParty["content"]["relevance"]>(
    editor.type === "party" ? (editor.party?.content.relevance ?? "relevant") : "relevant",
  );
  const [text, setText] = useState(
    editor.type === "requirement" ? (editor.item?.content.text ?? "") : "",
  );
  const [kind, setKind] = useState<PipRequirement["content"]["kind"]>(
    editor.type === "requirement" ? (editor.item?.content.kind ?? editor.kind ?? "need") : "need",
  );
  const [sourceType, setSourceType] = useState<PipRequirement["content"]["sourceType"]>(
    editor.type === "requirement"
      ? (editor.item?.content.sourceType ?? "ai_recommendation")
      : "ai_recommendation",
  );
  const [reasoning, setReasoning] = useState(
    editor.type === "party"
      ? (editor.party?.content.reasoning ?? "")
      : editor.type === "requirement"
        ? (editor.item?.content.reasoning ?? "")
        : "",
  );
  const [reason, setReason] = useState("");
  const [services, setServices] = useState(
    editor.type === "allocation" ? editor.item.services.join("\n") : "",
  );
  const [none, setNone] = useState(
    editor.type === "allocation" ? editor.item.noServiceConfirmed : false,
  );
  const [evaluation, setEvaluation] = useState<PipEvaluation["content"]>(
    editor.type === "evaluation"
      ? editor.evaluation.content
      : {
          power: null,
          interest: null,
          impact: null,
          requirementLevel: null,
          monitoringMethod: "",
          monitoringFrequency: "",
          reasoning: "",
        },
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (editor.type === "party") {
      const content = {
        name,
        description,
        category,
        scope,
        relevance,
        reasoning,
        confidence: editor.party?.content.confidence ?? null,
        evidence: editor.party?.content.evidence ?? [],
      };
      onSave(
        editor.party
          ? {
              type: "review",
              input: {
                entityType: "party",
                entityId: editor.party.id,
                reviewStatus: "MODIFIED",
                content,
                reason,
              },
            }
          : { type: "party", input: { name, description, category, scope, relevance, reasoning } },
      );
    } else if (editor.type === "requirement") {
      const content = {
        ...(editor.item?.content ?? {
          sourceType: "ai_recommendation" as const,
          regulatoryEntryId: null,
          sourceLabel: null,
          sourceUrl: null,
        }),
        kind,
        text,
        reasoning,
        sourceType,
      };
      onSave(
        editor.item
          ? {
              type: "review",
              input: {
                entityType: "requirement",
                entityId: editor.item.id,
                reviewStatus: "MODIFIED",
                content,
                reason,
              },
            }
          : { type: "requirement", input: { partyId: editor.party.id, content } },
      );
    } else if (editor.type === "allocation") {
      onSave({
        type: "allocation",
        input: {
          requirementId: editor.item.id,
          services: none
            ? []
            : services
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
          noServiceConfirmed: none,
          reason,
        },
      });
    } else {
      onSave({
        type: "review",
        input: {
          entityType: "evaluation",
          entityId: editor.evaluation.id,
          reviewStatus: "MODIFIED",
          content: evaluation,
          reason,
        },
      });
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogContent className="pip-app pip-modal" showCloseButton={false}>
        <form onSubmit={submit}>
          <DialogTitle>{t("edit")}</DialogTitle>
          {editor.type === "party" && (
            <>
              <label>
                {t("fields.name")}
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={300}
                />
              </label>
              <label>
                {t("fields.description")}
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  maxLength={4000}
                />
              </label>
              <label>
                {t("fields.category")}
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                  maxLength={160}
                />
              </label>
              <label>
                {t("fields.scope")}
                <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
                  {(["internal", "external"] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`scope.${s}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("fields.relevance")}
                <select
                  value={relevance}
                  onChange={(e) => setRelevance(e.target.value as typeof relevance)}
                >
                  {(
                    [
                      "relevant",
                      "potentially_relevant",
                      "insufficient_information",
                      "not_relevant",
                    ] as const
                  ).map((r) => (
                    <option key={r} value={r}>
                      {t(`relevance.${r}`)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {editor.type === "requirement" && (
            <>
              <label>
                {t("steps", { returnObjects: true })[1]}
                <select
                  value={kind}
                  disabled={!!editor.item}
                  onChange={(e) => setKind(e.target.value as typeof kind)}
                >
                  {(["need", "qms_requirement", "operational_disposition"] as const).map((k) => (
                    <option key={k} value={k}>
                      {t(`kinds.${k}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("evidence")}
                <select
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value as typeof sourceType)}
                >
                  {(
                    [
                      "ai_recommendation",
                      "organizational",
                      "stakeholder_expectation",
                      "customer",
                      "contractual",
                      ...(editor.item?.content.regulatoryEntryId
                        ? ["legal_regulatory" as const]
                        : []),
                    ] as const
                  ).map((source) => (
                    <option value={source} key={source}>
                      {t(`sources.${source}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("fields.text")}
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  required
                  maxLength={4000}
                />
              </label>
            </>
          )}
          {(editor.type === "party" || editor.type === "requirement") && (
            <label>
              {t("fields.reasoning")}
              <textarea
                value={reasoning}
                onChange={(e) => setReasoning(e.target.value)}
                required
                maxLength={4000}
              />
            </label>
          )}
          {editor.type === "allocation" && (
            <>
              <p>{editor.item.content.text}</p>
              <label>
                {t("fields.services")}
                <textarea
                  value={services}
                  disabled={none}
                  onChange={(e) => setServices(e.target.value)}
                  required={!none}
                />
              </label>
              <label className="pip-checkbox">
                <input type="checkbox" checked={none} onChange={(e) => setNone(e.target.checked)} />
                {t("noService")}
              </label>
            </>
          )}
          {editor.type === "evaluation" && (
            <>
              <h3>{editor.party.content.name}</h3>
              <div className="pip-score-fields">
                {(["power", "interest", "impact", "requirementLevel"] as const)
                  .filter(
                    (f) =>
                      (method !== "criticality" || (f !== "power" && f !== "interest")) &&
                      (method !== "power_interest" || (f !== "impact" && f !== "requirementLevel")),
                  )
                  .map((field) => (
                    <label key={field}>
                      {t(`fields.${field}`)}
                      <select
                        required
                        value={evaluation[field] ?? ""}
                        onChange={(e) =>
                          setEvaluation({ ...evaluation, [field]: Number(e.target.value) })
                        }
                      >
                        <option value="" disabled>
                          —
                        </option>
                        {Array.from(
                          { length: field === "power" || field === "interest" ? 5 : 3 },
                          (_, i) => (
                            <option key={i + 1} value={i + 1}>
                              {i + 1}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  ))}
              </div>
              {method !== "power_interest" && (
                <p>
                  {t("criticality", {
                    value:
                      computeCriticality(evaluation.impact, evaluation.requirementLevel) ?? "—",
                  })}
                </p>
              )}
              {(["monitoringMethod", "monitoringFrequency"] as const).map((field) => (
                <label key={field}>
                  {t(`fields.${field}`)}
                  <input
                    value={evaluation[field]}
                    onChange={(e) => setEvaluation({ ...evaluation, [field]: e.target.value })}
                    required
                    maxLength={field === "monitoringMethod" ? 1000 : 300}
                  />
                </label>
              ))}
              <label>
                {t("fields.reasoning")}
                <textarea
                  value={evaluation.reasoning}
                  onChange={(e) => setEvaluation({ ...evaluation, reasoning: e.target.value })}
                  required
                  maxLength={4000}
                />
              </label>
            </>
          )}
          {(editor.type === "evaluation" ||
            editor.type === "allocation" ||
            (editor.type === "party" && editor.party) ||
            (editor.type === "requirement" && editor.item)) && (
            <label>
              {t("fields.reason")}
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                minLength={5}
                maxLength={2000}
              />
            </label>
          )}
          <div className="pip-actions">
            <Button variant="outline" disabled={busy} type="button" onClick={onCancel}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
