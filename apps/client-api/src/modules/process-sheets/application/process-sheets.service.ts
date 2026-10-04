import { randomUUID } from "node:crypto";
import {
  Injectable,
  Inject,
  Optional,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { createPrismaClient, Prisma, type DatabaseClient } from "@qhse/database";
import {
  processSheetContentSchema,
  processSheetRegisterSchema,
  processSheetVersionSchema,
  processSheetProposalSchema,
  processSheetMaterialSchema,
  workQueueNames,
  type ProcessSheetWrite,
  type ProcessSheetSources,
} from "@qhse/contracts";
import { smqProcessSheets } from "@qhse/domain";
import type { TenantContext } from "../../../common/request-context.js";
import { WorkQueueService } from "../../jobs/work-queue.service.js";
import {
  loadSheetSources,
  sheetMaterial,
  sheetFingerprint as hash,
} from "./process-sheet-material.js";
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
@Injectable()
export class ProcessSheetsService {
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
  private usable(s: ProcessSheetSources, processId: string) {
    const p = s.map?.processes.find((p) => p.id === processId);
    if (!p) throw new BadRequestException("SHEET_PROCESS_UNAVAILABLE");
    if (!s.map?.current) throw new ConflictException("SHEET_MAP_STALE");
    return p;
  }
  private async lockedSheet(
    tx: Prisma.TransactionClient,
    projectId: string,
    sheetId: string,
    revision: number,
  ) {
    await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
    const s = await tx.processSheet.findFirst({ where: { id: sheetId, projectId } });
    if (!s) throw new NotFoundException("Process sheet not found");
    if (s.revision !== revision) throw new ConflictException("SHEET_INPUT_CHANGED");
    return s;
  }
  async register(t: TenantContext, id: string) {
    const p = await this.project(t, id);
    return this.db.$transaction(
      async (tx) => {
        const sources = await loadSheetSources(tx, p.id);
        const [sheets, versions, runs] = await Promise.all([
          tx.processSheet.findMany({ where: { projectId: p.id }, orderBy: { updatedAt: "desc" } }),
          tx.processSheetVersion.findMany({
            where: { projectId: p.id },
            orderBy: { validatedAt: "desc" },
          }),
          tx.processSheetRun.findMany({
            where: { projectId: p.id },
            orderBy: { createdAt: "desc" },
            take: 100,
          }),
        ]);
        return processSheetRegisterSchema.parse({
          projectId: p.id,
          sources,
          sheets: sheets.map((s) => ({
            ...s,
            current: Boolean(
              sources.map?.current && s.fingerprint === hash(sheetMaterial(sources, s.processId)),
            ),
            available: Boolean(sources.map?.processes.some((p) => p.id === s.processId)),
            updatedAt: s.updatedAt.toISOString(),
          })),
          versions: versions.map((v) => ({ ...v, validatedAt: v.validatedAt.toISOString() })),
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
  async prepare(t: TenantContext, id: string, processId: string) {
    const project = await this.project(t, id);
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${project.id} FOR UPDATE`;
      const sources = await loadSheetSources(tx, project.id),
        p = this.usable(sources, processId),
        material = sheetMaterial(sources, processId);
      const existing = await tx.processSheet.findUnique({
        where: { projectId_processId: { projectId: project.id, processId } },
      });
      if (existing) return; // Opening a saved sheet never regenerates or overwrites professional input.
      const content = processSheetContentSchema.parse(
        smqProcessSheets.emptyContent(p, new Date().toISOString().slice(0, 10)),
      );
      const s = await tx.processSheet.create({
        data: {
          projectId: project.id,
          processId,
          content: json(content),
          sourceSnapshot: json(material),
          fingerprint: hash(material),
        },
      });
      await tx.processSheetCorrection.create({
        data: {
          projectId: project.id,
          sheetId: s.id,
          kind: "prepare",
          previous: { absent: true },
          next: json({ content, material }),
          authorId: t.userId,
        },
      });
    });
    return this.register(t, project.id);
  }
  async write(t: TenantContext, id: string, sheetId: string, input: ProcessSheetWrite) {
    const p = await this.project(t, id);
    await this.db.$transaction(async (tx) => {
      const sheet = await this.lockedSheet(tx, p.id, sheetId, input.revision);
      const sources = await loadSheetSources(tx, p.id),
        material = sheetMaterial(sources, sheet.processId),
        fingerprint = hash(material);
      let content = processSheetContentSchema.parse(sheet.content),
        snapshot = processSheetMaterialSchema.parse(sheet.sourceSnapshot),
        nextFingerprint = sheet.fingerprint;
      const before = { content, material: snapshot };
      if (input.kind === "save") {
        content = processSheetContentSchema.parse(input.content);
      } else if (input.kind === "refresh_sources") {
        this.usable(sources, sheet.processId);
        snapshot = material;
        nextFingerprint = fingerprint;
        content = {
          ...content,
          referencesReviewed: false,
          activities: content.activities.map((a) => ({ ...a, decision: "pending" })),
        };
      } else {
        this.usable(sources, sheet.processId);
        if (sheet.fingerprint !== fingerprint) throw new ConflictException("SHEET_SOURCES_CHANGED");
        if (input.kind === "apply") {
          const run = await tx.processSheetRun.findFirst({
            where: {
              id: input.runId,
              projectId: p.id,
              sheetId: sheet.id,
              status: "COMPLETED",
              appliedAt: null,
            },
          });
          if (!run || run.revision !== sheet.revision || run.fingerprint !== fingerprint)
            throw new ConflictException("SHEET_PROPOSAL_EXPIRED");
          const proposal = processSheetProposalSchema.parse(run.outputSnapshot);
          content = processSheetContentSchema.parse({
            ...content,
            activities: [
              ...content.activities,
              ...proposal.activities.map((a) => ({ ...a, id: randomUUID(), decision: "pending" })),
            ],
          });
          await tx.processSheetRun.update({
            where: { id: run.id },
            data: { appliedAt: new Date() },
          });
        } else {
          const missing = smqProcessSheets.missingItems(content, {
            objectives: sources.objectives,
            risks: sources.facts.risks,
            requirements: sources.facts.requirements,
          });
          if (missing.length)
            throw new BadRequestException({ code: "SHEET_REVIEW_INCOMPLETE", missing });
          const last = await tx.processSheetVersion.findFirst({
            where: { sheetId: sheet.id },
            orderBy: { version: "desc" },
          });
          await tx.processSheetVersion.create({
            data: {
              projectId: p.id,
              sheetId: sheet.id,
              processId: sheet.processId,
              version: (last?.version ?? 0) + 1,
              content: json(content),
              sourceSnapshot: json(snapshot),
              fingerprint,
              validatedById: t.userId,
            },
          });
        }
      }
      await tx.processSheet.update({
        where: { id: sheet.id },
        data: {
          content: json(content),
          sourceSnapshot: json(snapshot),
          fingerprint: nextFingerprint,
          revision: { increment: 1 },
        },
      });
      await tx.processSheetCorrection.create({
        data: {
          projectId: p.id,
          sheetId: sheet.id,
          kind: input.kind,
          previous: json(before),
          next: json({ content, material: snapshot }),
          authorId: t.userId,
        },
      });
    });
    return this.register(t, p.id);
  }
  async launch(t: TenantContext, id: string, sheetId: string, revision: number) {
    const p = await this.project(t, id);
    const run = await this.db.$transaction(async (tx) => {
      const sheet = await this.lockedSheet(tx, p.id, sheetId, revision),
        sources = await loadSheetSources(tx, p.id),
        material = sheetMaterial(sources, sheet.processId),
        fingerprint = hash(material);
      this.usable(sources, sheet.processId);
      if (sheet.fingerprint !== fingerprint) throw new ConflictException("SHEET_SOURCES_CHANGED");
      const content = processSheetContentSchema.parse(sheet.content);
      if (content.description.trim().length < 20)
        throw new BadRequestException("SHEET_DESCRIPTION_REQUIRED");
      if (
        await tx.processSheetRun.findFirst({
          where: { sheetId: sheet.id, status: { in: ["DRAFT", "RUNNING"] } },
        })
      )
        throw new ConflictException("SHEET_RUN_ACTIVE");
      return tx.processSheetRun.create({
        data: {
          projectId: p.id,
          sheetId: sheet.id,
          revision: sheet.revision,
          fingerprint,
          inputSnapshot: json({ material, content }),
        },
      });
    });
    try {
      await this.queue.enqueue(workQueueNames.processSheets, "process-sheet-activities", {
        organizationId: t.organizationId,
        correlationId: randomUUID(),
        idempotencyKey: run.id,
        payload: { runId: run.id },
      });
    } catch {
      await this.db.processSheetRun.update({
        where: { id: run.id },
        data: { status: "FAILED", error: "SHEET_QUEUE_UNAVAILABLE", completedAt: new Date() },
      });
      throw new BadRequestException("SHEET_QUEUE_UNAVAILABLE");
    }
    return this.register(t, p.id);
  }
  async exportVersion(t: TenantContext, id: string, versionId: string) {
    const p = await this.project(t, id);
    const v = await this.db.processSheetVersion.findFirst({
      where: { id: versionId, projectId: p.id },
    });
    if (!v) throw new NotFoundException("Validated sheet not found");
    return processSheetVersionSchema.parse({ ...v, validatedAt: v.validatedAt.toISOString() });
  }
}
