import { readFile, readdir } from "node:fs/promises";

import { createPrismaClient, type DatabaseClient } from "@qhse/database";
import { profileQuestions, type ProfileFieldKey } from "@qhse/profile";
import { GenericContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  ProfileChatModelInput,
  ProfileChatModelPort,
} from "../../apps/client-api/src/modules/project-profile/application/profile-chat-model.port.js";
import type { FileStorage } from "../../apps/client-api/src/modules/files/application/file-storage.port.js";
import type { AudioTranscriptionPort } from "../../apps/client-api/src/modules/files/application/audio-transcription.port.js";
import { FilesService } from "../../apps/client-api/src/modules/files/application/files.service.js";
import { ProjectProfilesService } from "../../apps/client-api/src/modules/project-profile/application/project-profiles.service.js";

const enabled = process.env["TESTCONTAINERS_ENABLED"] === "true";
const suite = describe.skipIf(!enabled);

function validValue(key: ProfileFieldKey): unknown {
  const values: Record<ProfileFieldKey, unknown> = {
    "project.name": "Atlas Qualité",
    "project.logoUrl": null,
    "organization.mission": "Fabriquer des composants fiables pour l'industrie locale.",
    "organization.offerings": [{ name: "Composant Atlas", type: "PRODUCT" }],
    "organization.offeringRanges": { hasMultiple: false, ranges: [] },
    "market.primaryCustomerSegments": ["Industries marocaines"],
    "organization.employeeCount": 42,
    "operations.keyProcesses": [{ name: "Production", classification: "CORE" }],
    "scope.certificationScope": "Conception, fabrication et livraison à Casablanca",
    "operations.externalProviders": { usesExternalProviders: false, providers: [] },
    "organization.afterSalesServices": { hasAfterSalesServices: false, services: [] },
    "scope.operatingReach": "NATIONAL",
    "scope.operatingCountries": ["MA"],
    "organization.primarySector": { label: "Industrie manufacturière" },
    "regulatory.implementedFrameworks": { hasImplementedFrameworks: false, frameworks: [] },
    "operations.orderToDeliveryFlow": "Commande, planification, production, contrôle et livraison.",
    "resources.keyResources": [
      { category: "EQUIPMENT", name: "Ligne de production", critical: true },
    ],
    "resources.criticalCompetencies": ["Contrôle qualité"],
    "operations.majorDifficulties": { has: false, items: [] },
    "context.externalFactors": [{ category: "LEGAL", description: "Évolution réglementaire" }],
    "regulatory.knownRequirements": { hasKnownRequirements: false, requirements: [] },
    "context.sectorChallenges": ["Pression sur les coûts"],
    "stakeholders.customerNeeds": [
      { customerType: "Industriels", needs: ["Conformité", "Délais"] },
    ],
    "stakeholders.otherParties": [{ category: "AUTHORITY", name: "Autorités locales" }],
    "stakeholders.expectations": [{ party: "Salariés", expectations: ["Sécurité", "Formation"] }],
    "strategy.annualObjectives": [{ description: "Réduire les rebuts", target: "-10 %" }],
    "strategy.values": ["Fiabilité", "Amélioration continue"],
    "strategy.differentiators": ["Délais courts"],
    "strategy.iso9001Motivation": "Structurer la croissance et améliorer la satisfaction client.",
    "context.marketChallenges": ["Concurrence internationale"],
    "context.growthOpportunities": ["Nouveaux marchés nationaux"],
    "regulatory.criticalRisks": ["Non-respect des exigences produit"],
    "operations.recurrentIssues": { hasRecurrentIssues: false, issues: [] },
  };
  return values[key];
}

suite("project profile backend workflow", () => {
  let postgres: Awaited<ReturnType<GenericContainer["start"]>>;
  let database: DatabaseClient;
  let service: ProjectProfilesService;
  let filesService: FilesService;
  const transcribeAudio = vi.fn(async () => ({
    text: "Nous employons quarante-deux personnes.",
    language: "fr",
    durationMs: 900,
    model: "fake-transcription-model",
  }));
  const tenant = { organizationId: "org-profile", userId: "user-profile", role: "owner" };

  beforeAll(async () => {
    postgres = await new GenericContainer("pgvector/pgvector:0.8.6-pg18")
      .withEnvironment({
        POSTGRES_DB: "profile_test",
        POSTGRES_USER: "profile_test",
        POSTGRES_PASSWORD: "profile_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    const databaseUrl = `postgresql://profile_test:profile_test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/profile_test`;
    const migrationRoot = new URL("../../packages/database/prisma/migrations/", import.meta.url);
    const migrations = (await readdir(migrationRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map(({ name }) => name)
      .sort();
    const { Client } = await import("pg");
    const migrationClient = new Client({ connectionString: databaseUrl });
    await migrationClient.connect();
    for (const migration of migrations) {
      await migrationClient.query(
        await readFile(new URL(`${migration}/migration.sql`, migrationRoot), "utf8"),
      );
    }
    await migrationClient.end();

    database = createPrismaClient(databaseUrl);
    await database.user.create({
      data: { id: "user-profile", name: "Profile Owner", email: "profile@example.test" },
    });
    await database.organization.create({
      data: { id: "org-profile", name: "Atlas Org", slug: "atlas-org" },
    });
    await database.organization.create({
      data: { id: "org-foreign", name: "Foreign Org", slug: "foreign-org" },
    });
    await database.fileObject.create({
      data: {
        id: "file-foreign",
        organizationId: "org-foreign",
        objectKey: "org-foreign/private.pdf",
        originalName: "private.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
        checksum: "b".repeat(64),
        uploadStatus: "READY",
      },
    });
    await database.project.create({
      data: {
        id: "project-profile",
        organizationId: tenant.organizationId,
        createdById: tenant.userId,
        name: "Atlas",
        slug: "atlas",
        entityType: "COMPANY",
        countryCode: "MA",
        activities: {
          create: [{ name: "Fabrication", normalizedName: "fabrication", isPrimary: true }],
        },
      },
    });
    const model: ProfileChatModelPort = {
      runTurn: vi.fn(async (input: ProfileChatModelInput) => {
        await input.recordAnswers([
          {
            key: "organization.mission",
            valueJson: JSON.stringify(validValue("organization.mission")),
            confidence: 0.99,
          },
        ]);
        return {
          text: "Merci. Passons à la suite.",
          model: "fake-profile-model",
          promptKey: "profile.chat",
          promptVersion: 1,
          inputTokens: 10,
          outputTokens: 5,
          toolNames: ["recordProfileAnswers"],
        };
      }),
      streamTurn: vi.fn(() => ({ pipe: async () => undefined })),
    };
    const storage: FileStorage = {
      createUploadUrl: vi.fn(async () => ({
        objectKey: "org-profile/voice.webm",
        url: "https://files.example.test/upload",
        expiresAt: new Date("2026-08-09T01:00:00Z"),
      })),
      createDownloadUrl: vi.fn(async () => "https://files.example.test/signed"),
      inspectObject: vi.fn(async () => ({
        contentType: "audio/webm",
        sizeBytes: 4,
        checksum: "a".repeat(64),
      })),
      readObject: vi.fn(async () => new Uint8Array([1, 2, 3, 4])),
    };
    service = new ProjectProfilesService(model, storage, database);
    filesService = new FilesService(
      storage,
      { transcribe: transcribeAudio } as AudioTranscriptionPort,
      database,
    );
  });

  it("persists, verifies, and idempotently transcribes a voice note", async () => {
    const upload = await filesService.createUpload(tenant, {
      fileName: "voice.webm",
      contentType: "audio/webm",
      sizeBytes: 4,
      checksum: "a".repeat(64),
      purpose: "VOICE_NOTE",
    });
    expect(upload.file.uploadStatus).toBe("PENDING");
    expect((await filesService.completeUpload(tenant, upload.file.id)).uploadStatus).toBe("READY");
    const first = await filesService.transcribe(tenant, upload.file.id);
    const replay = await filesService.transcribe(tenant, upload.file.id);
    expect(first).toMatchObject({ status: "COMPLETED", language: "fr" });
    expect(replay.id).toBe(first.id);
    expect(transcribeAudio).toHaveBeenCalledTimes(1);
  });

  it("never accepts an attachment owned by another organization", async () => {
    await expect(
      service.chat(tenant, "project-profile", {
        message: "Utilisez ce document",
        messageId: "foreign-attachment-turn",
        language: "fr",
        module: "PROFILE_COMPLETION",
        attachmentIds: ["file-foreign"],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  afterAll(async () => {
    await database?.$disconnect();
    await postgres?.stop();
  });

  it("initializes, chats, audits edits, rejects stale writes, and completes an immutable snapshot", async () => {
    const initial = await service.get(tenant, "atlas");
    expect(initial.profile.revision).toBe(1);
    expect(initial.fields.find(({ key }) => key === "project.name")).toMatchObject({
      value: "Atlas",
      source: "ONBOARDING",
    });

    const chat = await service.chat(tenant, "project-profile", {
      message: "Notre mission est de fabriquer des composants fiables.",
      messageId: "profile-turn-1",
      language: "fr",
      module: "PROFILE_COMPLETION",
      attachmentIds: [],
    });
    expect(chat.acceptedKeys).toEqual(["organization.mission"]);
    expect(chat.profile.profile.revision).toBe(2);
    expect(await database.aiInvocation.count({ where: { status: "COMPLETED" } })).toBe(1);
    const replay = await service.chat(tenant, "project-profile", {
      message: "Notre mission est de fabriquer des composants fiables.",
      messageId: "profile-turn-1",
      language: "fr",
      module: "PROFILE_COMPLETION",
      attachmentIds: [],
    });
    expect(replay.message.id).toBe(chat.message.id);
    expect(await database.aiInvocation.count()).toBe(1);

    const answers = profileQuestions
      .filter(({ required }) => required)
      .map(({ key }) => ({ key, value: validValue(key), status: "ANSWERED" as const }));
    const completedData = await service.update(tenant, "project-profile", {
      revision: 2,
      answers,
      changeReason: "Validation initiale du profil",
    });
    expect(completedData.completion).toMatchObject({
      completenessPercent: 100,
      regulatoryReadiness: 100,
    });
    expect(
      await database.projectProfileFieldRevision.count({
        where: { field: { profileId: completedData.profile.id } },
      }),
    ).toBeGreaterThanOrEqual(33);

    await expect(
      service.update(tenant, "project-profile", {
        revision: 2,
        answers: [{ key: "organization.employeeCount", value: 43, status: "ANSWERED" }],
      }),
    ).rejects.toMatchObject({ status: 409 });

    const snapshot = await service.complete(
      tenant,
      "project-profile",
      completedData.profile.revision,
    );
    expect(snapshot).toMatchObject({
      sequence: 1,
      completenessPercent: 100,
      regulatoryReadiness: 100,
    });
    expect(snapshot.contentHash).toHaveLength(64);
    expect(await database.projectProfileSnapshot.count()).toBe(1);
    expect((await database.project.findUnique({ where: { id: "project-profile" } }))?.status).toBe(
      "READY_FOR_ANALYSIS",
    );
  });

  it("never resolves a project through a foreign tenant context", async () => {
    await expect(
      service.get(
        { organizationId: "org-foreign", userId: "user-profile", role: "owner" },
        "project-profile",
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
