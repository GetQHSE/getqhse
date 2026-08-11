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
        external_provider_allowed, excerpt_display_allowed, export_allowed, rights_reviewed_at, chunking_version,
        created_by_user_id, validated_by_user_id, validated_at, published_by_user_id, published_at, created_at, updated_at)
       VALUES ('rev-rag', 'doc-rag', 1, 'r1', 'INITIAL', 'PUBLISHED', 'synthetic.pdf', 'application/pdf',
        'pdf', 10, 'synthetic/rev-rag.pdf', repeat('a', 64), 'COMPLETED', 'APPROVED', true, true, true,
        true, true, true, true, $1, 'normative-v1', 'user-rag', 'user-rag', $1, 'user-rag', $1, $1, $1)`,
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

  it("persists a profile-snapshot-bound register and initializes its evaluation", async () => {
    const now = new Date();
    await database.query(
      `INSERT INTO organizations (id, name, slug, status, country_code, locale, timezone, created_at)
       VALUES ('org-watch', 'Watch Org', 'watch-org', 'active', 'MA', 'fr-MA', 'Africa/Casablanca', $1)`,
      [now],
    );
    await database.query(
      `INSERT INTO members (id, organization_id, user_id, role, status, created_at)
       VALUES ('member-watch', 'org-watch', 'user-rag', 'owner', 'active', $1)`,
      [now],
    );
    await database.query(
      `INSERT INTO projects
       (id, organization_id, created_by_id, name, slug, entity_type, country_code, standard_code, status, created_at, updated_at)
       VALUES ('project-watch', 'org-watch', 'user-rag', 'Watch Project', 'watch-project', 'COMPANY', 'MA', 'ISO_9001',
        'READY_FOR_ANALYSIS', $1, $1)`,
      [now],
    );
    await database.query(
      `INSERT INTO project_profiles
       (id, project_id, schema_version, revision, status, completeness_percent, regulatory_readiness, completed_at, created_at, updated_at)
       VALUES ('profile-watch', 'project-watch', 1, 1, 'COMPLETE', 100, 100, $1, $1, $1)`,
      [now],
    );
    await database.query(
      `INSERT INTO project_profile_snapshots
       (id, profile_id, sequence, schema_version, data, content_hash, completeness_percent, regulatory_readiness, created_by_id, created_at)
       VALUES ('snapshot-watch', 'profile-watch', 1, 1, '{"fields":{}}'::jsonb, repeat('e', 64), 100, 100, 'user-rag', $1)`,
      [now],
    );
    await database.query(
      `INSERT INTO project_regulatory_watches
       (id, organization_id, project_id, status, revision, created_at, updated_at)
       VALUES ('watch-1', 'org-watch', 'project-watch', 'REVIEW_REQUIRED', 1, $1, $1)`,
      [now],
    );
    await database.query(
      `INSERT INTO regulatory_analysis_runs
       (id, watch_id, profile_snapshot_id, created_by_id, trigger_key, status, as_of, languages, phase, progress_percent,
        clarification_revision, created_at, updated_at)
       VALUES ('run-watch', 'watch-1', 'snapshot-watch', 'user-rag', 'integration-run-watch', 'READY_FOR_REVIEW', CURRENT_DATE, ARRAY['fr'],
        'review', 100, 0, $1, $1)`,
      [now],
    );
    await database.query(
      `INSERT INTO regulatory_applicability_candidates
       (id, run_id, provision_id, suggestion, rationale, matched_profile_keys, confidence, decision,
        reviewed_by_id, reviewed_at, created_at, updated_at)
       VALUES ('candidate-watch', 'run-watch', 'provision-rag', 'APPLICABLE', 'Applicable to the declared scope',
        ARRAY['scope.certificationScope'], 0.9500, 'APPLICABLE', 'user-rag', $1, $1, $1)`,
      [now],
    );
    await database.query(
      `INSERT INTO regulatory_baselines
       (id, watch_id, analysis_run_id, profile_snapshot_id, sequence, status, published_by_id, published_at, created_at)
       VALUES ('baseline-watch', 'watch-1', 'run-watch', 'snapshot-watch', 1, 'PUBLISHED', 'user-rag', $1, $1)`,
      [now],
    );
    await database.query(
      `INSERT INTO regulatory_register_entries
       (id, baseline_id, provision_id, order_index, citation_label, applicability_rationale, created_at)
       VALUES ('entry-watch', 'baseline-watch', 'provision-rag', 0, 'SYN 9001 — 4.1', 'Applicable', $1)`,
      [now],
    );
    await database.query(
      `INSERT INTO regulatory_evaluations
       (id, entry_id, result, revision, created_at, updated_at)
       VALUES ('evaluation-watch', 'entry-watch', 'NOT_ASSESSED', 1, $1, $1)`,
      [now],
    );
    await database.query(
      `UPDATE project_regulatory_watches
       SET current_baseline_id = 'baseline-watch', status = 'ACTIVE', updated_at = $1
       WHERE id = 'watch-1'`,
      [now],
    );

    const register = await database.query<{
      snapshotId: string;
      result: string;
      sourceId: string;
    }>(
      `SELECT b.profile_snapshot_id AS "snapshotId", e.result::text AS result, r.provision_id AS "sourceId"
       FROM project_regulatory_watches w
       JOIN regulatory_baselines b ON b.id = w.current_baseline_id
       JOIN regulatory_register_entries r ON r.baseline_id = b.id
       JOIN regulatory_evaluations e ON e.entry_id = r.id
       WHERE w.organization_id = 'org-watch' AND w.project_id = 'project-watch'`,
    );
    expect(register.rows).toEqual([
      { snapshotId: "snapshot-watch", result: "NOT_ASSESSED", sourceId: "provision-rag" },
    ]);
  });
});
