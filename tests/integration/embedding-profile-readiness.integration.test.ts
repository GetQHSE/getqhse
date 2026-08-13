import { readFile, readdir } from "node:fs/promises";

import {
  createPrismaClient,
  searchableRevisionFilter,
  unindexedSearchableChunkFilter,
  type DatabaseClient,
} from "@qhse/database";
import { Client } from "pg";
import { GenericContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env["TESTCONTAINERS_ENABLED"] === "true";
const suite = describe.skipIf(!enabled);

/**
 * Exercises the shared eligibility filters against a real Postgres schema. The
 * production incident these cover — "No active embedding profile" surfacing in
 * la veille réglementaire — came from the worker's readiness gate and the admin
 * activation gate disagreeing about which revisions must be indexed, so the two
 * are asserted here against actual rows rather than mocks.
 */
suite("embedding profile readiness against a real schema", () => {
  let postgres: Awaited<ReturnType<GenericContainer["start"]>>;
  let raw: Client;
  let database: DatabaseClient;

  const now = new Date();

  beforeAll(async () => {
    postgres = await new GenericContainer("pgvector/pgvector:0.8.6-pg18")
      .withEnvironment({
        POSTGRES_DB: "readiness_test",
        POSTGRES_USER: "readiness_test",
        POSTGRES_PASSWORD: "readiness_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    const url = `postgresql://readiness_test:readiness_test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/readiness_test`;
    raw = new Client({ connectionString: url });
    await raw.connect();
    const root = new URL("../../packages/database/prisma/migrations/", import.meta.url);
    const migrations = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map(({ name }) => name)
      .sort();
    for (const migration of migrations) {
      await raw.query(await readFile(new URL(`${migration}/migration.sql`, root), "utf8"));
    }
    database = createPrismaClient(url);

    await raw.query(
      `INSERT INTO users (id, name, email, email_verified, status, locale, timezone, platform_role, created_at, updated_at)
       VALUES ('u1', 'Admin', 'admin@example.test', true, 'active', 'fr-MA', 'Africa/Casablanca', 'super_admin', $1, $1)`,
      [now],
    );
    await raw.query(
      `INSERT INTO embedding_profiles (id, key, provider, model, dimensions, version, status, created_at, updated_at)
       VALUES ('p1', 'fake:768:v1', 'fake', 'deterministic', 768, 1, 'BUILDING', $1, $1)`,
      [now],
    );
  });

  afterAll(async () => {
    await database?.$disconnect();
    await raw?.end();
    await postgres?.stop();
  });

  /** Creates a document + revision + one chunk, with the given overrides. */
  async function seedRevision(options: {
    id: string;
    documentStatus?: string;
    visibility?: string;
    revisionStatus?: string;
    validated?: boolean;
    embeddingAllowed?: boolean;
    deleted?: boolean;
  }) {
    const {
      id,
      documentStatus = "PUBLISHED",
      visibility = "ORGANIZATION_AVAILABLE",
      revisionStatus = "PUBLISHED",
      validated = true,
      embeddingAllowed = true,
      deleted = false,
    } = options;
    await raw.query(
      `INSERT INTO documents
       (id, title, document_type, source_type, jurisdiction, language, status, visibility, deleted_at,
        created_by_user_id, updated_by_user_id, created_at, updated_at)
       VALUES ($2, $2, 'standard', 'licensed', 'global', 'fr', $3::"DocumentStatus", $4::"DocumentVisibility",
        $5, 'u1', 'u1', $1, $1)`,
      [now, `doc-${id}`, documentStatus, visibility, deleted ? now : null],
    );
    await raw.query(
      `INSERT INTO document_versions
       (id, document_id, version_number, version_label, change_type, status, original_file_name, mime_type,
        file_extension, file_size, storage_key, file_hash, processing_status, review_status,
        storage_allowed, extraction_allowed, embedding_allowed, ai_processing_allowed,
        external_provider_allowed, excerpt_display_allowed, export_allowed, chunking_version,
        created_by_user_id, validated_at, created_at, updated_at)
       VALUES ($2, $3, 1, 'r1', 'INITIAL', $4::"DocumentStatus", 'f.pdf', 'application/pdf', 'pdf', 10,
        $2, repeat('a', 64), 'COMPLETED', 'APPROVED', true, true, $5, true, true, true, true,
        'normative-v1', 'u1', $6, $1, $1)`,
      [now, `rev-${id}`, `doc-${id}`, revisionStatus, embeddingAllowed, validated ? now : null],
    );
    await raw.query(
      `INSERT INTO document_chunks
       (id, document_version_id, chunk_index, content, search_text, language, heading_path, token_count,
        page_start, page_end, content_hash, chunking_version, embedding_status, created_at, updated_at)
       VALUES ($2, $3, 0, 'text', 'text', 'fr', ARRAY['4.1'], 4, 1, 1, repeat('c', 64), 'normative-v1',
        'PENDING', $1, $1)`,
      [now, `chunk-${id}`, `rev-${id}`],
    );
  }

  it("counts a published, fully-permitted revision as searchable", async () => {
    await seedRevision({ id: "ok" });

    await expect(database.documentVersion.count({ where: searchableRevisionFilter })).resolves.toBe(
      1,
    );
    await expect(
      database.documentChunk.count({ where: unindexedSearchableChunkFilter("p1") }),
    ).resolves.toBe(1);
  });

  it("excludes revisions the retriever would never return", async () => {
    // Each of these is a reason the retriever drops the revision. If the
    // readiness gate counted them, a profile could never reach READY.
    await seedRevision({ id: "draft", revisionStatus: "VALIDATED" });
    await seedRevision({ id: "unvalidated", validated: false });
    await seedRevision({ id: "internal", visibility: "PLATFORM_INTERNAL" });
    await seedRevision({ id: "archived", documentStatus: "ARCHIVED" });
    await seedRevision({ id: "deleted", deleted: true });
    await seedRevision({ id: "norights", embeddingAllowed: false });

    // Only the revision seeded by the previous test still qualifies.
    await expect(database.documentVersion.count({ where: searchableRevisionFilter })).resolves.toBe(
      1,
    );
    await expect(
      database.documentChunk.count({ where: unindexedSearchableChunkFilter("p1") }),
    ).resolves.toBe(1);
  });

  it("clears the readiness gate once the searchable chunk is indexed", async () => {
    const vector = `[1,${Array.from({ length: 767 }, () => "0").join(",")}]`;
    await raw.query(
      `INSERT INTO document_embeddings
       (id, document_chunk_id, embedding_profile_id, input_hash, embedding, generated_at, created_at, updated_at)
       VALUES ('e1', 'chunk-ok', 'p1', repeat('d', 64), $1::vector, $2, $2, $2)`,
      [vector, now],
    );

    await expect(
      database.documentChunk.count({ where: unindexedSearchableChunkFilter("p1") }),
    ).resolves.toBe(0);
  });

  it("reopens the gate when a pre-indexed revision is later published", async () => {
    // The regression that stranded profiles in production: content published
    // after a profile reached READY must make the profile incomplete again.
    await raw.query(
      `UPDATE documents SET status = 'PUBLISHED', visibility = 'ORGANIZATION_AVAILABLE' WHERE id = 'doc-draft'`,
    );
    await raw.query(`UPDATE document_versions SET status = 'PUBLISHED' WHERE id = 'rev-draft'`);

    await expect(
      database.documentChunk.count({ where: unindexedSearchableChunkFilter("p1") }),
    ).resolves.toBe(1);
  });

  it("scopes the gate per profile so a new profile starts empty", async () => {
    await raw.query(
      `INSERT INTO embedding_profiles (id, key, provider, model, dimensions, version, status, created_at, updated_at)
       VALUES ('p2', 'fake:768:v2', 'fake', 'deterministic', 768, 2, 'BUILDING', $1, $1)`,
      [now],
    );

    await expect(
      database.documentChunk.count({ where: unindexedSearchableChunkFilter("p2") }),
    ).resolves.toBe(2);
  });
});
