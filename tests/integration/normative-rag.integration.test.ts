import { readFile, readdir } from "node:fs/promises";

import { Client } from "pg";
import { GenericContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env["TESTCONTAINERS_ENABLED"] === "true";
const suite = describe.skipIf(!enabled);

suite("normative pgvector baseline", () => {
  let postgres: Awaited<ReturnType<GenericContainer["start"]>>;
  let database: Client;

  beforeAll(async () => {
    postgres = await new GenericContainer("pgvector/pgvector:0.8.6-pg18")
      .withEnvironment({
        POSTGRES_DB: "normative_test",
        POSTGRES_USER: "normative_test",
        POSTGRES_PASSWORD: "normative_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    database = new Client({
      connectionString: `postgresql://normative_test:normative_test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/normative_test`,
    });
    await database.connect();
    const root = new URL("../../packages/database/prisma/migrations/", import.meta.url);
    const migrations = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map(({ name }) => name)
      .sort();
    for (const migration of migrations) {
      await database.query(await readFile(new URL(`${migration}/migration.sql`, root), "utf8"));
    }
  });

  afterAll(async () => {
    await database?.end();
    await postgres?.stop();
  });

  it("stores 768-dimensional vectors and exposes GIN and HNSW indexes", async () => {
    const indexes = await database.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE indexname IN ('document_chunks_search_vector_idx', 'document_embeddings_embedding_hnsw_idx') ORDER BY indexname",
    );
    expect(indexes.rows.map(({ indexname }) => indexname)).toEqual([
      "document_chunks_search_vector_idx",
      "document_embeddings_embedding_hnsw_idx",
    ]);

    const now = new Date();
    await database.query(
      `INSERT INTO users (id, name, email, email_verified, status, locale, timezone, platform_role, created_at, updated_at)
       VALUES ('user-rag', 'RAG Admin', 'rag@example.test', true, 'active', 'fr-MA', 'Africa/Casablanca', 'super_admin', $1, $1)`,
      [now],
    );
    await database.query(
      `INSERT INTO documents
       (id, title, document_type, source_type, jurisdiction, language, reference_number, status, visibility,
        created_by_user_id, updated_by_user_id, published_by_user_id, published_at, created_at, updated_at)
       VALUES ('doc-rag', 'Synthetic quality standard', 'standard', 'licensed', 'global', 'fr', 'SYN 9001',
        'PUBLISHED', 'ORGANIZATION_AVAILABLE', 'user-rag', 'user-rag', 'user-rag', $1, $1, $1)`,
      [now],
    );
    await database.query(
      `INSERT INTO document_versions
       (id, document_id, version_number, version_label, change_type, status, original_file_name, mime_type,
        file_extension, file_size, storage_key, file_hash, processing_status, review_status,
        storage_allowed, extraction_allowed, embedding_allowed, ai_processing_allowed,
        external_provider_allowed, excerpt_display_allowed, rights_reviewed_at, chunking_version,
        created_by_user_id, validated_by_user_id, validated_at, published_by_user_id, published_at, created_at, updated_at)
       VALUES ('rev-rag', 'doc-rag', 1, 'r1', 'INITIAL', 'PUBLISHED', 'synthetic.pdf', 'application/pdf',
        'pdf', 10, 'synthetic/rev-rag.pdf', repeat('a', 64), 'COMPLETED', 'APPROVED', true, true, true,
        true, true, true, $1, 'normative-v1', 'user-rag', 'user-rag', $1, 'user-rag', $1, $1, $1)`,
      [now],
    );
    await database.query(
      "UPDATE documents SET current_version_id = 'rev-rag' WHERE id = 'doc-rag'",
    );
    await database.query(
      `INSERT INTO document_provisions
       (id, document_version_id, provision_type, source_identifier, title, heading_path, language, content,
        content_hash, page_start, page_end, order_index, created_at, updated_at)
       VALUES ('provision-rag', 'rev-rag', 'CLAUSE', '4.1', 'Context', ARRAY['4.1 Context'], 'fr',
        'The organization determines its context.', repeat('b', 64), 8, 8, 0, $1, $1)`,
      [now],
    );
    await database.query(
      `INSERT INTO document_chunks
       (id, document_version_id, document_provision_id, chunk_index, content, search_text, language,
        heading_path, token_count, page_start, page_end, content_hash, chunking_version,
        embedding_status, created_at, updated_at)
       VALUES ('chunk-rag', 'rev-rag', 'provision-rag', 0, 'The organization determines its context.',
        'SYN 9001 4.1 Context organization', 'fr', ARRAY['4.1 Context'], 8, 8, 8, repeat('c', 64),
        'normative-v1', 'COMPLETED', $1, $1)`,
      [now],
    );
    await database.query(
      `INSERT INTO embedding_profiles
       (id, key, provider, model, dimensions, version, status, activated_at, created_at, updated_at)
       VALUES ('profile-rag', 'fake:768:v1', 'fake', 'deterministic', 768, 1, 'ACTIVE', $1, $1, $1)`,
      [now],
    );
    const vector = `[1,${Array.from({ length: 767 }, () => "0").join(",")}]`;
    await database.query(
      `INSERT INTO document_embeddings
       (id, document_chunk_id, embedding_profile_id, input_hash, embedding, generated_at, created_at, updated_at)
       VALUES ('embedding-rag', 'chunk-rag', 'profile-rag', repeat('d', 64), $1::vector, $2, $2, $2)`,
      [vector, now],
    );
    const nearest = await database.query<{ id: string }>(
      `SELECT document_chunk_id AS id FROM document_embeddings
       WHERE embedding_profile_id = 'profile-rag' ORDER BY embedding <=> $1::vector LIMIT 1`,
      [vector],
    );
    expect(nearest.rows).toEqual([{ id: "chunk-rag" }]);
  });

  it("keeps profile activation atomic and rollback-capable", async () => {
    await database.query(
      `INSERT INTO embedding_profiles
       (id, key, provider, model, dimensions, version, status, created_at, updated_at)
       VALUES ('profile-rag-v2', 'fake:768:v2', 'fake', 'deterministic', 768, 2, 'READY', NOW(), NOW())`,
    );
    await database.query("BEGIN");
    await database.query(
      "UPDATE embedding_profiles SET status = 'RETIRED', retired_at = NOW() WHERE status = 'ACTIVE'",
    );
    await database.query(
      "UPDATE embedding_profiles SET status = 'ACTIVE', activated_at = NOW() WHERE id = 'profile-rag-v2'",
    );
    await database.query("COMMIT");
    const active = await database.query<{ id: string }>(
      "SELECT id FROM embedding_profiles WHERE status = 'ACTIVE'",
    );
    expect(active.rows).toEqual([{ id: "profile-rag-v2" }]);

    await database.query("BEGIN");
    await database.query(
      "UPDATE embedding_profiles SET status = 'READY' WHERE id = 'profile-rag-v2'",
    );
    await database.query(
      "UPDATE embedding_profiles SET status = 'ACTIVE', retired_at = NULL WHERE id = 'profile-rag'",
    );
    await database.query("COMMIT");
    const rolledBack = await database.query<{ id: string }>(
      "SELECT id FROM embedding_profiles WHERE status = 'ACTIVE'",
    );
    expect(rolledBack.rows).toEqual([{ id: "profile-rag" }]);
  });
});
