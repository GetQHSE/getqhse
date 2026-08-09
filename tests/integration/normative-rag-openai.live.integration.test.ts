import { readFile, readdir } from "node:fs/promises";

import { Client } from "pg";
import { GenericContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OpenAiQueryEmbeddingAdapter } from "../../apps/client-api/src/modules/normative-repository/infrastructure/openai-query-embedding.adapter.js";
import { PrismaNormativeRetriever } from "../../apps/client-api/src/modules/normative-repository/infrastructure/prisma-normative-retriever.js";
import { EmbeddingGenerationProcessor } from "../../apps/worker/src/processors/representative.processors.js";

const enabled =
  process.env["TESTCONTAINERS_ENABLED"] === "true" &&
  process.env["OPENAI_LIVE_TESTS"] === "true" &&
  Boolean(process.env["OPENAI_API_KEY"]);
const suite = describe.skipIf(!enabled);

type DatabaseOwner = {
  database: { $disconnect(): Promise<void> };
};

suite("normative RAG with live OpenAI embeddings", () => {
  let postgres: Awaited<ReturnType<GenericContainer["start"]>>;
  let database: Client;
  let processor: EmbeddingGenerationProcessor;
  let retriever: PrismaNormativeRetriever;
  const previousDatabaseUrl = process.env["DATABASE_URL"];
  const previousRagFlag = process.env["NORMATIVE_RAG_ENABLED"];

  beforeAll(async () => {
    postgres = await new GenericContainer("pgvector/pgvector:0.8.6-pg18")
      .withEnvironment({
        POSTGRES_DB: "normative_openai_test",
        POSTGRES_USER: "normative_openai_test",
        POSTGRES_PASSWORD: "normative_openai_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    const databaseUrl = `postgresql://normative_openai_test:normative_openai_test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/normative_openai_test`;
    process.env["DATABASE_URL"] = databaseUrl;
    process.env["NORMATIVE_RAG_ENABLED"] = "true";
    database = new Client({ connectionString: databaseUrl });
    await database.connect();

    const root = new URL("../../packages/database/prisma/migrations/", import.meta.url);
    const migrations = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map(({ name }) => name)
      .sort();
    for (const migration of migrations) {
      await database.query(await readFile(new URL(`${migration}/migration.sql`, root), "utf8"));
    }

    const now = new Date();
    await database.query(
      `INSERT INTO organizations (id, name, slug, status, country_code, locale, timezone, created_at)
       VALUES ('org-live-rag', 'Live RAG Test', 'live-rag-test', 'active', 'MA', 'fr-MA', 'Africa/Casablanca', $1)`,
      [now],
    );
    await database.query(
      `INSERT INTO users (id, name, email, email_verified, status, locale, timezone, platform_role, created_at, updated_at)
       VALUES ('user-live-rag', 'RAG Admin', 'live-rag@example.test', true, 'active', 'fr-MA', 'Africa/Casablanca', 'super_admin', $1, $1)`,
      [now],
    );
    await database.query(
      `INSERT INTO documents
       (id, title, document_type, source_type, jurisdiction, language, reference_number, status, visibility,
        created_by_user_id, updated_by_user_id, published_by_user_id, published_at, created_at, updated_at)
       VALUES ('doc-live-rag', 'Référentiel qualité synthétique', 'standard', 'licensed', 'global', 'fr',
        'SYN 9001', 'PUBLISHED', 'ORGANIZATION_AVAILABLE', 'user-live-rag', 'user-live-rag',
        'user-live-rag', $1, $1, $1)`,
      [now],
    );
    await database.query(
      `INSERT INTO document_versions
       (id, document_id, version_number, version_label, change_type, status, original_file_name, mime_type,
        file_extension, file_size, storage_key, file_hash, processing_status, review_status,
        storage_allowed, extraction_allowed, embedding_allowed, ai_processing_allowed,
        external_provider_allowed, excerpt_display_allowed, rights_reviewed_at, chunking_version,
        created_by_user_id, validated_by_user_id, validated_at, published_by_user_id, published_at, created_at, updated_at)
       VALUES ('rev-live-rag', 'doc-live-rag', 1, 'r1', 'INITIAL', 'PUBLISHED', 'synthetic.pdf',
        'application/pdf', 'pdf', 10, 'synthetic/rev-live-rag.pdf', repeat('a', 64), 'COMPLETED',
        'APPROVED', true, true, true, true, true, true, $1, 'normative-v1', 'user-live-rag',
        'user-live-rag', $1, 'user-live-rag', $1, $1, $1)`,
      [now],
    );
    await database.query(
      "UPDATE documents SET current_version_id = 'rev-live-rag' WHERE id = 'doc-live-rag'",
    );
    await database.query(
      `INSERT INTO document_provisions
       (id, document_version_id, provision_type, source_identifier, title, heading_path, language, content,
        content_hash, page_start, page_end, order_index, created_at, updated_at)
       VALUES ('provision-live-rag', 'rev-live-rag', 'CLAUSE', '4.1', 'Contexte de l’organisme',
        ARRAY['4.1 Contexte de l’organisme'], 'fr',
        'L’organisme doit déterminer les enjeux externes et internes pertinents pour sa finalité et son orientation stratégique.',
        repeat('b', 64), 8, 8, 0, $1, $1)`,
      [now],
    );
    await database.query(
      `INSERT INTO document_chunks
       (id, document_version_id, document_provision_id, chunk_index, content, search_text, language,
        heading_path, token_count, page_start, page_end, content_hash, chunking_version,
        embedding_status, created_at, updated_at)
       VALUES ('chunk-live-rag', 'rev-live-rag', 'provision-live-rag', 0,
        'L’organisme doit déterminer les enjeux externes et internes pertinents pour sa finalité et son orientation stratégique.',
        'Référentiel qualité synthétique SYN 9001 4.1 Contexte de l’organisme enjeux externes internes finalité orientation stratégique',
        'fr', ARRAY['4.1 Contexte de l’organisme'], 25, 8, 8, repeat('c', 64), 'normative-v1',
        'PENDING', $1, $1)`,
      [now],
    );
    await database.query(
      `INSERT INTO embedding_profiles
       (id, key, provider, model, dimensions, version, status, created_at, updated_at)
       VALUES ('profile-live-rag', 'openai:text-embedding-3-small:768:v1', 'openai',
        'text-embedding-3-small', 768, 1, 'BUILDING', $1, $1)`,
      [now],
    );
  });

  afterAll(async () => {
    await (processor as unknown as DatabaseOwner | undefined)?.database.$disconnect();
    await (retriever as unknown as DatabaseOwner | undefined)?.database.$disconnect();
    await database?.end();
    await postgres?.stop();
    if (previousDatabaseUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = previousDatabaseUrl;
    if (previousRagFlag === undefined) delete process.env["NORMATIVE_RAG_ENABLED"];
    else process.env["NORMATIVE_RAG_ENABLED"] = previousRagFlag;
  });

  it("indexes through the worker and retrieves through the customer repository", async () => {
    processor = new EmbeddingGenerationProcessor();
    await processor.process({
      data: {
        organizationId: "platform",
        correlationId: "live-rag-correlation",
        idempotencyKey: "rev-live-rag:profile-live-rag:normative-v1",
        payload: { versionId: "rev-live-rag", profileId: "profile-live-rag" },
      },
      updateProgress: async () => undefined,
    } as never);

    const indexed = await database.query<{ dimensions: number; status: string }>(
      `SELECT vector_dims(e.embedding) AS dimensions, p.status
       FROM document_embeddings e
       JOIN embedding_profiles p ON p.id = e.embedding_profile_id
       WHERE e.document_chunk_id = 'chunk-live-rag' AND e.embedding_profile_id = 'profile-live-rag'`,
    );
    expect(indexed.rows).toEqual([{ dimensions: 768, status: "READY" }]);

    await database.query(
      `UPDATE embedding_profiles SET status = 'ACTIVE', activated_at = NOW()
       WHERE id = 'profile-live-rag'`,
    );
    retriever = new PrismaNormativeRetriever(new OpenAiQueryEmbeddingAdapter());
    const response = await retriever.search("org-live-rag", {
      query: "Que demande la clause 4.1 concernant le contexte de l’organisme ?",
      asOf: new Date().toISOString().slice(0, 10),
      languages: ["fr"],
      documentFamilies: ["standard"],
      limit: 10,
    });

    expect(response.embeddingProfile).toMatchObject({
      id: "profile-live-rag",
      model: "text-embedding-3-small",
    });
    expect(response.results[0]).toMatchObject({
      sourceId: "provision-live-rag",
      revisionId: "rev-live-rag",
      provisionIdentifier: "4.1",
      pageStart: 8,
      pageEnd: 8,
    });
    expect(response.results[0]?.citationLabel).toContain("4.1");

    const log = await database.query<{
      query_hash: string;
      returned_source_ids: string[];
      result_count: number;
    }>(
      `SELECT query_hash, returned_source_ids, result_count
       FROM retrieval_logs WHERE organization_id = 'org-live-rag'`,
    );
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]?.query_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(log.rows[0]?.returned_source_ids).toEqual(["provision-live-rag"]);
    expect(log.rows[0]?.result_count).toBe(1);
  });
});
