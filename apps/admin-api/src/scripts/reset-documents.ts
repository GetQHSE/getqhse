import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { createPrismaClient } from "@qhse/database";
import { Queue } from "bullmq";

const localHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres", "redis", "minio"]);

function requiredUrl(name: string): URL {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (!localHosts.has(url.hostname)) {
    throw new Error(`${name} must target a local development host, received ${url.hostname}`);
  }
  return url;
}

function assertDevelopmentEnvironment() {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("Document reset is disabled when NODE_ENV=production");
  }
  requiredUrl("DATABASE_URL");
  requiredUrl("REDIS_URL");
  requiredUrl("S3_ENDPOINT");
}

function redisConnection(url: URL) {
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.password ? { password: url.password } : {}),
  };
}

function s3Client() {
  const endpoint = requiredUrl("S3_ENDPOINT").toString();
  return new S3Client({
    endpoint,
    region: process.env["S3_REGION"] ?? "us-east-1",
    forcePathStyle: process.env["S3_FORCE_PATH_STYLE"] === "true",
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: process.env["S3_ACCESS_KEY"] ?? "",
      secretAccessKey: process.env["S3_SECRET_KEY"] ?? "",
    },
  });
}

async function objectKeys(client: S3Client, bucket: string) {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "documents/",
        ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
      }),
    );
    keys.push(...(page.Contents ?? []).flatMap(({ Key }) => (Key ? [Key] : [])));
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function waitForIdleQueue(queue: Queue) {
  await queue.pause();
  const deadline = Date.now() + 30_000;
  while ((await queue.getActiveCount()) > 0) {
    if (Date.now() >= deadline) {
      throw new Error("Document processing jobs are still active. Stop the worker and retry.");
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function main() {
  assertDevelopmentEnvironment();
  const confirmed = process.argv.includes("--confirm");
  const database = createPrismaClient();
  const redisUrl = requiredUrl("REDIS_URL");
  const queue = new Queue("document-processing", { connection: redisConnection(redisUrl) });
  const storage = s3Client();
  const bucket = process.env["S3_DOCUMENTS_BUCKET"] ?? process.env["S3_BUCKET"] ?? "qhse-files";

  try {
    const [documents, versions, files, processingJobs, queueJobs, keys] = await Promise.all([
      database.document.count(),
      database.documentVersion.count(),
      database.documentFile.count(),
      database.documentProcessingJob.count(),
      queue.getJobCounts("active", "waiting", "delayed", "completed", "failed", "paused"),
      objectKeys(storage, bucket),
    ]);
    const summary = { documents, versions, files, processingJobs, queueJobs, objects: keys.length };
    console.log(JSON.stringify({ mode: confirmed ? "reset" : "dry-run", summary }, null, 2));
    if (!confirmed) {
      console.log("Dry run only. Run `pnpm dev:reset-documents` to remove this data.");
      return;
    }

    await waitForIdleQueue(queue);
    await queue.obliterate({ force: true });

    for (let index = 0; index < keys.length; index += 1_000) {
      const batch = keys.slice(index, index + 1_000);
      await storage.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }

    await database.$transaction([
      database.documentReviewIssue.deleteMany(),
      database.documentActivity.deleteMany(),
      database.documentRelationship.deleteMany(),
      database.documentFile.deleteMany(),
      database.documentReview.deleteMany(),
      database.documentMetadataSuggestion.deleteMany(),
      database.documentTaxonomyTerm.deleteMany(),
      database.documentChunk.deleteMany(),
      database.documentSection.deleteMany(),
      database.documentProcessingJob.deleteMany(),
      database.documentVersion.deleteMany(),
      database.document.deleteMany(),
    ]);

    console.log("Document development data reset completed.");
  } finally {
    await Promise.allSettled([queue.close(), database.$disconnect()]);
    storage.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
