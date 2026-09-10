import {
  configureLlmSettingsLoader,
  llmSettings,
  refreshLlmSettings,
  LLM_SETTINGS_ROW_ID,
} from "@qhse/ai";
import {
  createPrismaClient,
  embeddableRevisionFilter,
  searchableRevisionFilter,
  unindexedSearchableChunkFilter,
  type DatabaseClient,
} from "@qhse/database";
import { workQueueNames } from "@qhse/contracts";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";

/**
 * Drives the normative index rollout (runbook steps 6-7) against whichever
 * database `DATABASE_URL` points at, including production. Every action here is
 * additive: it creates an embedding profile, enqueues indexing jobs, and
 * activates a profile that already covers the corpus. It never deletes.
 */

type Mode = "report" | "index" | "activate";

function redisConnection() {
  const value = process.env["REDIS_URL"];
  if (!value) throw new Error("REDIS_URL is required");
  const url = new URL(value);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: url.username } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

async function report(database: DatabaseClient) {
  const [profiles, searchableRevisions, embeddableRevisions, publishedDocuments] =
    await Promise.all([
      database.embeddingProfile.findMany({ orderBy: { version: "desc" } }),
      database.documentVersion.count({ where: searchableRevisionFilter }),
      database.documentVersion.count({ where: embeddableRevisionFilter }),
      database.document.count({ where: { status: "PUBLISHED", deletedAt: null } }),
    ]);
  const profileRows = await Promise.all(
    profiles.map(async (profile) => ({
      id: profile.id,
      key: profile.key,
      status: profile.status,
      version: profile.version,
      missingChunks: await database.documentChunk.count({
        where: unindexedSearchableChunkFilter(profile.id),
      }),
    })),
  );
  return {
    ragEnabled: llmSettings().ragEnabled,
    providerConfigured: Boolean(llmSettings().apiKeys[llmSettings().embeddingProvider]),
    publishedDocuments,
    searchableRevisions,
    embeddableRevisions,
    profiles: profileRows,
  };
}

/** Creates a profile when none can absorb new content, then enqueues indexing. */
async function index(database: DatabaseClient, queue: Queue) {
  let profile = await database.embeddingProfile.findFirst({
    where: { status: { in: ["BUILDING", "READY"] } },
    orderBy: [{ status: "asc" }, { version: "desc" }],
  });
  if (!profile) {
    const latest = await database.embeddingProfile.aggregate({ _max: { version: true } });
    const profileVersion = (latest._max.version ?? 0) + 1;
    const settings = llmSettings();
    profile = await database.embeddingProfile.create({
      data: {
        key: `${settings.embeddingProvider}:${settings.embeddingModel}:768:v${profileVersion}`,
        provider: settings.embeddingProvider,
        model: settings.embeddingModel,
        dimensions: 768,
        version: profileVersion,
        status: "BUILDING",
      },
    });
    console.log(`Created embedding profile ${profile.key} (${profile.id}).`);
  } else {
    console.log(`Reusing ${profile.status} embedding profile ${profile.key} (${profile.id}).`);
  }

  const revisions = await database.documentVersion.findMany({
    where: embeddableRevisionFilter,
    select: {
      id: true,
      documentId: true,
      chunkingVersion: true,
      _count: { select: { chunks: true } },
    },
  });
  const withChunks = revisions.filter((revision) => revision._count.chunks > 0);
  const withoutChunks = revisions.length - withChunks.length;
  if (withoutChunks) {
    // Embeddings are generated from chunks, so an unprocessed revision cannot
    // be indexed until the document-processing pipeline has run on it.
    console.warn(
      `${withoutChunks} eligible revision(s) have no chunks and were skipped; run document processing on them first.`,
    );
  }

  for (const revision of withChunks) {
    await queue.add(
      "index-normative-revision",
      {
        organizationId: "platform",
        correlationId: randomUUID(),
        idempotencyKey: `${revision.id}:${profile.id}:${revision.chunkingVersion ?? "pending"}`,
        payload: {
          documentId: revision.documentId,
          versionId: revision.id,
          profileId: profile.id,
        },
      },
      {
        jobId: `${revision.id}-${profile.id}-${revision.chunkingVersion ?? "pending"}`,
        attempts: 5,
        backoff: { type: "exponential", delay: 2_000 },
      },
    );
  }
  console.log(
    `Enqueued ${withChunks.length} indexing job(s) on ${workQueueNames.embeddingGeneration}.`,
  );
  console.log("Wait for the worker to drain, then re-run with --report, then --activate.");
}

async function activate(database: DatabaseClient) {
  const profile = await database.embeddingProfile.findFirst({
    where: { status: "READY" },
    orderBy: { version: "desc" },
  });
  if (!profile) {
    throw new Error(
      "No READY embedding profile. Run with --index and let the worker finish before activating.",
    );
  }
  const missing = await database.documentChunk.count({
    where: unindexedSearchableChunkFilter(profile.id),
  });
  if (missing) {
    throw new Error(
      `${missing} searchable chunk(s) are not indexed under ${profile.key}. Re-run with --index.`,
    );
  }
  await database.$transaction(async (tx) => {
    const now = new Date();
    await tx.embeddingProfile.updateMany({
      where: { status: "ACTIVE", id: { not: profile.id } },
      data: { status: "RETIRED", retiredAt: now },
    });
    await tx.embeddingProfile.update({
      where: { id: profile.id },
      data: { status: "ACTIVE", activatedAt: now, retiredAt: null },
    });
  });
  console.log(`Activated ${profile.key}. Previous profiles were retired but keep their vectors.`);
}

function selectedMode(): Mode {
  if (process.argv.includes("--activate")) return "activate";
  if (process.argv.includes("--index")) return "index";
  return "report";
}

async function main() {
  const mode = selectedMode();
  const database = createPrismaClient();
  // A one-shot script does not need the polling sync, but it does need to report the same
  // configuration the services are running on rather than this shell's environment.
  configureLlmSettingsLoader(() =>
    database.llmSetting.findUnique({ where: { id: LLM_SETTINGS_ROW_ID } }),
  );
  await refreshLlmSettings();
  const queue =
    mode === "index"
      ? new Queue(workQueueNames.embeddingGeneration, { connection: redisConnection() })
      : undefined;
  try {
    if (mode === "index") await index(database, queue!);
    if (mode === "activate") await activate(database);
    console.log(JSON.stringify(await report(database), null, 2));
    if (mode === "report") {
      console.log("Read-only. Pass --index to build the index, then --activate to serve it.");
    }
  } finally {
    await Promise.allSettled([queue?.close(), database.$disconnect()]);
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
