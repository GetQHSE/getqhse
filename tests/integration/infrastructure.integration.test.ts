import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Client } from "pg";
import { GenericContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env["TESTCONTAINERS_ENABLED"] === "true";
const suite = describe.skipIf(!enabled);

suite("real infrastructure", () => {
  let postgres: Awaited<ReturnType<GenericContainer["start"]>>;
  let redis: Awaited<ReturnType<GenericContainer["start"]>>;
  let minio: Awaited<ReturnType<GenericContainer["start"]>>;

  beforeAll(async () => {
    [postgres, redis, minio] = await Promise.all([
      new GenericContainer("pgvector/pgvector:0.8.6-pg18")
        .withEnvironment({
          POSTGRES_DB: "qhse_test",
          POSTGRES_USER: "qhse_test",
          POSTGRES_PASSWORD: "qhse_test",
        })
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
        .start(),
      new GenericContainer("redis:8.8.1")
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
        .start(),
      new GenericContainer("minio/minio:RELEASE.2025-09-07T16-13-09Z")
        .withEnvironment({
          MINIO_ROOT_USER: "test-access-key",
          MINIO_ROOT_PASSWORD: "test-secret-key",
        })
        .withCommand(["server", "/data"])
        .withExposedPorts(9000)
        .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000))
        .start(),
    ]);
  });

  afterAll(async () => {
    await Promise.all(
      [postgres, redis, minio]
        .filter((container) => container !== undefined)
        .map((container) => container.stop()),
    );
  });

  it("provides PostgreSQL with pgvector", async () => {
    const client = new Client({
      host: postgres.getHost(),
      port: postgres.getMappedPort(5432),
      database: "qhse_test",
      user: "qhse_test",
      password: "qhse_test",
    });
    await client.connect();
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    const result = await client.query<{ extname: string }>(
      "SELECT extname FROM pg_extension WHERE extname = 'vector'",
    );
    expect(result.rows[0]?.extname).toBe("vector");
    await client.end();
  });

  it("provides a real Redis service", async () => {
    const result = await redis.exec(["redis-cli", "ping"]);
    expect(result.output).toContain("PONG");
  });

  it("provides real S3-compatible MinIO storage", async () => {
    const client = new S3Client({
      endpoint: `http://${minio.getHost()}:${minio.getMappedPort(9000)}`,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
      },
    });
    await client.send(new CreateBucketCommand({ Bucket: "qhse-test" }));
    await expect(
      client.send(new HeadBucketCommand({ Bucket: "qhse-test" })),
    ).resolves.toBeDefined();
    client.destroy();
  });
});
