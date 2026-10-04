import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import {
  Injectable,
  Inject,
  Optional,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { createPrismaClient, Prisma, type DatabaseClient } from "@qhse/database";
import {
  planningDocumentSchema,
  planningRegisterSchema,
  planningProposalSchema,
  workQueueNames,
  type PlanningModule,
  type PlanningWrite,
  type PlanningLaunch,
  type PlanningDocument,
} from "@qhse/contracts";
import { smqPlanning } from "@qhse/domain";
import type { TenantContext } from "../../../common/request-context.js";
import { WorkQueueService } from "../../jobs/work-queue.service.js";
import { loadPlanningSources, planningFingerprint as hash } from "./planning-material.js";
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
@Injectable()
export class PlanningService {
  private readonly db: DatabaseClient;
  constructor(
    @Inject(WorkQueueService) private readonly queue: WorkQueueService,
    @Optional() db?: DatabaseClient,
  ) {
    this.db = db ?? createPrismaClient();
  }
  private async project(t: TenantContext, id: string) {
    const p = await this.db.project.findFirst({
      where: { organizationId: t.organizationId, archivedAt: null, OR: [{ id }, { slug: id }] },
    });
    if (!p) throw new NotFoundException("Project not found");
    return p;
  }
  private async lock(
    tx: Prisma.TransactionClient,
    projectId: string,
    module: PlanningModule,
    revision: number,
    fingerprint: string,
  ) {
    await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
    const state = await tx.planningState.upsert({
      where: { projectId_module: { projectId, module } },
      create: { projectId, module, document: json(smqPlanning.emptyDocument()), fingerprint },
      update: {},
    });
    if (state.revision !== revision) throw new ConflictException("PLANNING_INPUT_CHANGED");
    return state;
  }
  async register(t: TenantContext, id: string, module: PlanningModule) {
    const p = await this.project(t, id);
    return this.db.$transaction(
      async (tx) => {
        const sources = await loadPlanningSources(tx, p.id),
          fingerprint = hash(sources);
        const [state, versions, runs] = await Promise.all([
          tx.planningState.findUnique({ where: { projectId_module: { projectId: p.id, module } } }),
          tx.planningVersion.findMany({
            where: {
              projectId: p.id,
              kind: module === "policy" ? { in: ["policy", "objectives"] } : "processes",
            },
            orderBy: { createdAt: "desc" },
          }),
          tx.planningRun.findMany({
            where: { projectId: p.id, module },
            orderBy: { createdAt: "desc" },
            take: 20,
          }),
        ]);
        return planningRegisterSchema.parse({
          projectId: p.id,
          module,
          revision: state?.revision ?? 0,
          document: state?.document ?? smqPlanning.emptyDocument(),
          sources,
          fingerprint,
          current: !state || state.fingerprint === fingerprint,
          versions: versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() })),
          runs: runs.map((r) => ({
            ...r,
            applied: r.appliedAt !== null,
            createdAt: r.createdAt.toISOString(),
          })),
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  private async policyCurrent(
    tx: Prisma.TransactionClient,
    projectId: string,
    d: PlanningDocument,
    fingerprint: string,
  ) {
    if (!d.policyVersionId) return false;
    const v = await tx.planningVersion.findFirst({
      where: { id: d.policyVersionId, projectId, kind: "policy" },
    });
    return Boolean(
      v &&
      v.fingerprint === fingerprint &&
      hash(smqPlanning.policyBasis(planningDocumentSchema.parse(v.document))) ===
        hash(smqPlanning.policyBasis(d)),
    );
  }
  async write(t: TenantContext, id: string, module: PlanningModule, input: PlanningWrite) {
    const p = await this.project(t, id);
    await this.db.$transaction(async (tx) => {
      // Project lock also serializes upstream SMQ writers and prevents validating a mixed snapshot.
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${p.id} FOR UPDATE`;
      const sources = await loadPlanningSources(tx, p.id),
        fingerprint = hash(sources);
      const state = await this.lock(tx, p.id, module, input.revision, fingerprint);
      let d = planningDocumentSchema.parse(state.document);
      const before = d;
      if (input.kind !== "review_sources" && state.fingerprint !== fingerprint)
        throw new ConflictException("PLANNING_SOURCES_CHANGED");
      if (input.kind === "review_sources") {
        d = {
          ...d,
          axes: d.axes.map((x) => ({ ...x, decision: "pending" })),
          objectives: d.objectives.map((x) => ({ ...x, decision: "pending" })),
          processes: d.processes.map((x) => ({ ...x, decision: "pending" })),
          interactions: d.interactions.map((x) => ({ ...x, decision: "pending" })),
          policyVersionId: null,
        };
      } else if (input.kind === "save") {
        d = planningDocumentSchema.parse(input.document);
        if (!smqPlanning.uniqueIds(d)) throw new BadRequestException("PLANNING_DUPLICATE_IDS");
        // Version links belong to the server; a browser cannot bless a draft as a policy.
        d.policyVersionId = before.policyVersionId;
        if (module === "policy") {
          d.processes = before.processes;
          d.interactions = before.interactions;
          if (hash(smqPlanning.policyBasis(d)) !== hash(smqPlanning.policyBasis(before)))
            d.policyVersionId = null;
        } else {
          d.directions = before.directions;
          d.axes = before.axes;
          d.statement = before.statement;
          d.objectives = before.objectives;
          d.policyVersionId = null;
        }
      } else if (input.kind === "apply") {
        const run = await tx.planningRun.findFirst({
          where: { id: input.runId, projectId: p.id, module, status: "COMPLETED", appliedAt: null },
        });
        if (!run || run.revision !== state.revision || run.fingerprint !== fingerprint)
          throw new ConflictException("PLANNING_PROPOSAL_EXPIRED");
        const out = planningProposalSchema.parse(run.outputSnapshot);
        const newId = () => randomUUID();
        // Append proposals; existing professional corrections and decisions remain intact.
        if (run.stage === "axes")
          d = {
            ...d,
            axes: [
              ...d.axes,
              ...out.axes.map((x) => ({ ...x, id: newId(), decision: "pending" as const })),
            ],
            policyVersionId: null,
          };
        if (run.stage === "statement")
          d = { ...d, statement: out.statement, policyVersionId: null };
        if (run.stage === "objectives")
          d = {
            ...d,
            objectives: [
              ...d.objectives,
              ...out.objectives.map((x) => ({
                ...x,
                id: newId(),
                decision: "pending" as const,
                baseline: "",
                target: "",
                deadline: "",
                owner: "",
              })),
            ],
          };
        if (run.stage === "processes")
          d = {
            ...d,
            processes: [
              ...d.processes,
              ...out.processes.map((x) => ({
                ...x,
                id: newId(),
                decision: "pending" as const,
                pilotName: "",
                pilotRole: "",
              })),
            ],
          };
        if (run.stage === "interactions")
          d = {
            ...d,
            interactions: [
              ...d.interactions,
              ...out.interactions.map((x) => ({ ...x, id: newId(), decision: "pending" as const })),
            ],
          };
        d = planningDocumentSchema.parse(d);
        await tx.planningRun.update({ where: { id: run.id }, data: { appliedAt: new Date() } });
      } else {
        if (!sources.scope?.current) throw new BadRequestException("PLANNING_SCOPE_REQUIRED");
        if (
          (module === "policy" && input.target === "processes") ||
          (module === "processes" && input.target !== "processes")
        )
          throw new BadRequestException("PLANNING_TARGET_INVALID");
        const valid =
          input.target === "policy"
            ? smqPlanning.statementComplete(d)
            : input.target === "objectives"
              ? smqPlanning.objectivesComplete(d) &&
                (await this.policyCurrent(tx, p.id, d, fingerprint))
              : smqPlanning.pilotsComplete(d);
        if (!valid) throw new BadRequestException("PLANNING_REVIEW_INCOMPLETE");
        const last = await tx.planningVersion.findFirst({
          where: { projectId: p.id, kind: input.target },
          orderBy: { version: "desc" },
        });
        const v = await tx.planningVersion.create({
          data: {
            projectId: p.id,
            kind: input.target,
            version: (last?.version ?? 0) + 1,
            document: json(d),
            sources: json(sources),
            fingerprint,
            authorId: t.userId,
          },
        });
        if (input.target === "policy") d = { ...d, policyVersionId: v.id };
      }
      await tx.planningCorrection.create({
        data: {
          projectId: p.id,
          module,
          kind: input.kind,
          authorId: t.userId,
          previous: json(before),
          next: json(d),
        },
      });
      await tx.planningState.update({
        where: { id: state.id },
        data: { document: json(d), fingerprint, revision: { increment: 1 } },
      });
    });
    return this.register(t, p.id, module);
  }
  async exportExcel(t: TenantContext, id: string, module: PlanningModule, versionId: string) {
    const data = await this.register(t, id, module),
      v = data.versions.find((v) => v.id === versionId);
    if (!v) throw new NotFoundException("Validated version not found");
    const labels = {
      fr: {
        policy: "Politique qualité",
        objectives: "Objectifs qualité",
        processes: "Cartographie des processus",
        head: [
          "Axe de la politique qualité",
          "Objectif qualité (SMART)",
          "Indicateur clé (KPI)",
          "Valeur cible",
          "Méthode de mesure",
          "Unité",
          "Valeur de départ",
          "Échéance",
          "Fréquence",
          "Responsable",
        ],
        ph: ["Processus", "Famille", "Pilote", "Fonction", "Finalité", "Entrées", "Sorties"],
        ih: ["Source", "Flux", "Destinataire"],
        families: { management: "Management", realization: "Réalisation", support: "Support" },
      },
      en: {
        policy: "Quality policy",
        objectives: "Quality objectives",
        processes: "Process map",
        head: [
          "Quality policy axis",
          "Quality objective (SMART)",
          "Key indicator (KPI)",
          "Target value",
          "Measurement method",
          "Unit",
          "Baseline",
          "Deadline",
          "Frequency",
          "Owner",
        ],
        ph: ["Process", "Family", "Owner", "Role", "Purpose", "Inputs", "Outputs"],
        ih: ["Source", "Exchange", "Destination"],
        families: { management: "Management", realization: "Realization", support: "Support" },
      },
      ar: {
        policy: "سياسة الجودة",
        objectives: "أهداف الجودة",
        processes: "خريطة العمليات",
        head: [
          "محور سياسة الجودة",
          "هدف الجودة",
          "المؤشر الرئيسي",
          "القيمة المستهدفة",
          "طريقة القياس",
          "الوحدة",
          "القيمة الأولية",
          "الموعد النهائي",
          "الدورية",
          "المسؤول",
        ],
        ph: ["العملية", "الفئة", "المسؤول", "الوظيفة", "الغاية", "المدخلات", "المخرجات"],
        ih: ["المصدر", "التدفق", "المستقبل"],
        families: { management: "الإدارة", realization: "التنفيذ", support: "الدعم" },
      },
    }[v.sources.facts.language];
    const book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet(labels[v.kind]);
    sheet.views = [{ rightToLeft: v.sources.facts.language === "ar" }];
    sheet.addRow([v.sources.facts.organizationName, v.version, v.createdAt]);
    const d = v.document;
    if (v.kind === "policy") {
      sheet.addRow([d.statement]);
      sheet.addRow([d.directions.signatoryName, d.directions.signatoryRole]);
    } else if (v.kind === "objectives") {
      sheet.addRow(labels.head);
      const axes = new Map(d.axes.map((x) => [x.id, x.title]));
      d.objectives
        .filter((x) => x.decision === "retained")
        .forEach((x) =>
          sheet.addRow([
            axes.get(x.axisId) ?? "",
            x.title,
            x.indicator,
            x.target,
            x.method,
            x.unit,
            x.baseline,
            x.deadline,
            x.frequency,
            x.owner,
          ]),
        );
    } else {
      sheet.addRow(labels.ph);
      d.processes
        .filter((x) => x.decision === "retained")
        .forEach((x) =>
          sheet.addRow([
            x.title,
            labels.families[x.family],
            x.pilotName,
            x.pilotRole,
            x.purpose,
            x.inputs,
            x.outputs,
          ]),
        );
      const links = book.addWorksheet(labels.ih[1]);
      links.views = [{ rightToLeft: v.sources.facts.language === "ar" }];
      links.addRow(labels.ih);
      const names = new Map(d.processes.map((x) => [x.id, x.title]));
      d.interactions
        .filter((x) => x.decision === "retained")
        .forEach((x) => links.addRow([names.get(x.from) ?? "", x.flow, names.get(x.to) ?? ""]));
    }
    for (const ws of book.worksheets) {
      ws.columns.forEach((c) => {
        c.width = 35;
      });
      ws.eachRow((r) => {
        r.eachCell((c) => {
          c.alignment = { wrapText: true, vertical: "top" };
        });
      });
      ws.getRow(2).font = { bold: true };
    }
    return Buffer.from(await book.xlsx.writeBuffer());
  }
  async launch(t: TenantContext, id: string, module: PlanningModule, input: PlanningLaunch) {
    const p = await this.project(t, id);
    const run = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${p.id} FOR UPDATE`;
      const sources = await loadPlanningSources(tx, p.id),
        fingerprint = hash(sources);
      const state = await this.lock(tx, p.id, module, input.revision, fingerprint);
      const document = planningDocumentSchema.parse(state.document);
      if (state.fingerprint !== fingerprint)
        throw new ConflictException("PLANNING_SOURCES_CHANGED");
      if (!sources.scope?.current) throw new BadRequestException("PLANNING_SCOPE_REQUIRED");
      const allowed =
        module === "policy" ? ["axes", "statement", "objectives"] : ["processes", "interactions"];
      if (!allowed.includes(input.stage)) throw new BadRequestException("PLANNING_STAGE_INVALID");
      if (
        (input.stage === "axes" && !smqPlanning.directionsComplete(document)) ||
        (input.stage === "statement" && !smqPlanning.axesComplete(document)) ||
        (input.stage === "objectives" &&
          !(await this.policyCurrent(tx, p.id, document, fingerprint))) ||
        (input.stage === "interactions" && !smqPlanning.processesComplete(document))
      )
        throw new BadRequestException("PLANNING_REVIEW_INCOMPLETE");
      if (
        await tx.planningRun.findFirst({
          where: { projectId: p.id, module, status: { in: ["DRAFT", "RUNNING"] } },
        })
      )
        throw new ConflictException("PLANNING_RUN_ACTIVE");
      return tx.planningRun.create({
        data: {
          projectId: p.id,
          module,
          stage: input.stage,
          revision: state.revision,
          fingerprint,
          inputSnapshot: json({ module, stage: input.stage, sources, document, fingerprint }),
        },
      });
    });
    try {
      await this.queue.enqueue(workQueueNames.planning, "planning", {
        organizationId: t.organizationId,
        correlationId: randomUUID(),
        idempotencyKey: run.id,
        payload: { runId: run.id },
      });
    } catch {
      await this.db.planningRun.update({
        where: { id: run.id },
        data: { status: "FAILED", error: "PLANNING_QUEUE_UNAVAILABLE", completedAt: new Date() },
      });
      throw new BadRequestException("PLANNING_QUEUE_UNAVAILABLE");
    }
    return this.register(t, p.id, module);
  }
}
