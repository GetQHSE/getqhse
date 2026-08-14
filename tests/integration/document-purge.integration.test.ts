import { readFile, readdir } from "node:fs/promises";

import { createPrismaClient, type DatabaseClient } from "@qhse/database";
import { Client } from "pg";
import { GenericContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentsService } from "../../apps/admin-api/src/modules/normative-documents/documents.service.js";

const enabled = process.env["TESTCONTAINERS_ENABLED"] === "true";
const suite = describe.skipIf(!enabled);

/**
 * The purge deletes across a graph guarded by RESTRICT foreign keys, so the
 * statement order is only provably correct against a real schema — mocks would
 * happily accept an order Postgres rejects. NODE_ENV is set to production here
 * because the purge is deliberately available in every environment.
 */
suite("document purge", () => {
  let postgres: Awaited<ReturnType<GenericContainer["start"]>>;
  let raw: Client;
  let database: DatabaseClient;
  let service: DocumentsService;

  const admin = { id: "u1", platformRole: "super_admin" } as never;
  const deleteObjects = vi.fn().mockResolvedValue(1);

  beforeAll(async () => {
    postgres = await new GenericContainer("pgvector/pgvector:0.8.6-pg18")
      .withEnvironment({
        POSTGRES_DB: "purge_test",
        POSTGRES_USER: "purge_test",
        POSTGRES_PASSWORD: "purge_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    const url = `postgresql://purge_test:purge_test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/purge_test`;
    process.env["DATABASE_URL"] = url;
    process.env["NODE_ENV"] = "production";
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
    service = new DocumentsService({ deleteObjects } as never, { add: vi.fn() } as never);
    (service as unknown as { database: DatabaseClient }).database = database;
  });

  afterAll(async () => {
    await database?.$disconnect();
    await raw?.end();
    await postgres?.stop();
  });

  /**
   * Seeds a published document wired into every relation that holds a RESTRICT
   * reference to it: files, provisions, chunks, embeddings, a relationship, an
   * activity row, a sync event, and a customer regulatory register citing it.
   */
  beforeEach(async () => {
    const now = new Date();
    await raw.query("BEGIN");
    await raw.query(`
      DELETE FROM regulatory_evaluations; DELETE FROM regulatory_register_entries;
      DELETE FROM regulatory_baselines; DELETE FROM regulatory_applicability_candidates;
      DELETE FROM regulatory_analysis_runs; DELETE FROM project_regulatory_watches;
      DELETE FROM regulatory_sync_events; DELETE FROM document_relationships;
      DELETE FROM document_activity_log; DELETE FROM document_files;
      DELETE FROM document_embeddings; DELETE FROM document_chunks;
      DELETE FROM document_provisions;
      UPDATE documents SET current_version_id = NULL;
      DELETE FROM document_versions; DELETE FROM documents;
      DELETE FROM project_profile_snapshots; DELETE FROM project_profiles; DELETE FROM projects;
      DELETE FROM members; DELETE FROM organizations;
      DELETE FROM embedding_profiles; DELETE FROM users;
    `);
    await raw.query("COMMIT");

    await raw.query(
      `INSERT INTO users (id,name,email,email_verified,status,locale,timezone,platform_role,created_at,updated_at)
       VALUES ('u1','Admin','a@e.test',true,'active','fr-MA','Africa/Casablanca','super_admin',$1,$1)`,
      [now],
    );
    for (const id of ["d1", "d2"]) {
      await raw.query(
        `INSERT INTO documents (id,title,document_type,source_type,jurisdiction,language,status,visibility,
          created_by_user_id,updated_by_user_id,published_at,created_at,updated_at)
         VALUES ($2,$2,'standard','licensed','global','fr','PUBLISHED','ORGANIZATION_AVAILABLE','u1','u1',$1,$1,$1)`,
        [now, id],
      );
      await raw.query(
        `INSERT INTO document_versions (id,document_id,version_number,version_label,change_type,status,
          original_file_name,mime_type,file_extension,file_size,storage_key,file_hash,processing_status,review_status,
          storage_allowed,extraction_allowed,embedding_allowed,ai_processing_allowed,external_provider_allowed,
          excerpt_display_allowed,export_allowed,chunking_version,created_by_user_id,validated_at,published_at,created_at,updated_at)
         VALUES ($2,$3,1,'r1','INITIAL','PUBLISHED','f.pdf','application/pdf','pdf',10,$2,repeat($4,64),'COMPLETED','APPROVED',
          true,true,true,true,true,true,true,'normative-v1','u1',$1,$1,$1,$1)`,
        [now, `v-${id}`, id, id === "d1" ? "a" : "b"],
      );
      await raw.query(`UPDATE documents SET current_version_id = $1 WHERE id = $2`, [
        `v-${id}`,
        id,
      ]);
    }
    await raw.query(
      `INSERT INTO document_files (id,document_version_id,file_role,original_file_name,storage_key,mime_type,
        file_extension,file_size,file_hash,uploaded_by_user_id,created_at)
       VALUES ('f1','v-d1','primary','f.pdf','documents/d1/versions/v-d1/f.pdf','application/pdf','pdf',10,repeat('a',64),'u1',$1)`,
      [now],
    );
    await raw.query(
      `INSERT INTO document_provisions (id,document_version_id,provision_type,source_identifier,title,heading_path,
        language,content,content_hash,page_start,page_end,order_index,created_at,updated_at)
       VALUES ('prov1','v-d1','CLAUSE','4.1','Context',ARRAY['4.1'],'fr','text',repeat('b',64),1,1,0,$1,$1)`,
      [now],
    );
    await raw.query(
      `INSERT INTO document_chunks (id,document_version_id,document_provision_id,chunk_index,content,search_text,
        language,heading_path,token_count,page_start,page_end,content_hash,chunking_version,embedding_status,created_at,updated_at)
       VALUES ('c1','v-d1','prov1',0,'text','text','fr',ARRAY['4.1'],4,1,1,repeat('c',64),'normative-v1','COMPLETED',$1,$1)`,
      [now],
    );
    await raw.query(
      `INSERT INTO embedding_profiles (id,key,provider,model,dimensions,version,status,created_at,updated_at)
       VALUES ('p1','fake:768:v1','fake','deterministic',768,1,'ACTIVE',$1,$1)`,
      [now],
    );
    await raw.query(
      `INSERT INTO document_embeddings (id,document_chunk_id,embedding_profile_id,input_hash,embedding,generated_at,created_at,updated_at)
       VALUES ('e1','c1','p1',repeat('d',64),
        ('[' || array_to_string(array_fill(0.1::real, ARRAY[768]), ',') || ']')::vector,$1,$1,$1)`,
      [now],
    );
    await raw.query(
      `INSERT INTO document_relationships (id,source_document_id,target_document_id,relationship_type,created_by_user_id,created_at)
       VALUES ('rel1','d1','d2','SUPERSEDES','u1',$1)`,
      [now],
    );
    await raw.query(
      `INSERT INTO document_activity_log (id,document_id,document_version_id,actor_user_id,action,created_at)
       VALUES ('act1','d1','v-d1','u1','document.published',$1)`,
      [now],
    );
    await raw.query(
      `INSERT INTO regulatory_sync_events (id,document_id,previous_version_id,published_version_id,actor_user_id,status,created_at,updated_at)
       VALUES ('sync1','d1','v-d1','v-d1','u1','PENDING',$1,$1)`,
      [now],
    );

    // A customer register citing the document's provision.
    await raw.query(
      `INSERT INTO organizations (id,name,slug,status,country_code,locale,timezone,created_at)
       VALUES ('org1','Org','org','active','MA','fr-MA','Africa/Casablanca',$1)`,
      [now],
    );
    await raw.query(
      `INSERT INTO members (id,organization_id,user_id,role,status,created_at) VALUES ('m1','org1','u1','owner','active',$1)`,
      [now],
    );
    await raw.query(
      `INSERT INTO projects (id,organization_id,created_by_id,name,slug,entity_type,country_code,standard_code,status,created_at,updated_at)
       VALUES ('proj1','org1','u1','P','p','COMPANY','MA','ISO_9001','READY_FOR_ANALYSIS',$1,$1)`,
      [now],
    );
    await raw.query(
      `INSERT INTO project_profiles (id,project_id,schema_version,revision,status,completeness_percent,regulatory_readiness,completed_at,created_at,updated_at)
       VALUES ('pp1','proj1',1,1,'COMPLETE',100,100,$1,$1,$1)`,
      [now],
    );
    await raw.query(
      `INSERT INTO project_profile_snapshots (id,profile_id,sequence,schema_version,data,content_hash,completeness_percent,regulatory_readiness,created_by_id,created_at)
       VALUES ('snap1','pp1',1,1,'{"fields":{}}'::jsonb,repeat('e',64),100,100,'u1',$1)`,
      [now],
    );
    await raw.query(
      `INSERT INTO project_regulatory_watches (id,organization_id,project_id,status,revision,created_at,updated_at)
       VALUES ('w1','org1','proj1','ACTIVE',1,$1,$1)`,
      [now],
    );
    await raw.query(
      `INSERT INTO regulatory_analysis_runs (id,watch_id,profile_snapshot_id,created_by_id,trigger_key,status,as_of,
        languages,phase,progress_percent,clarification_revision,trigger_document_version_id,created_at,updated_at)
       VALUES ('run1','w1','snap1','u1','k1','READY_FOR_REVIEW',CURRENT_DATE,ARRAY['fr'],'review',100,0,'v-d1',$1,$1)`,
      [now],
    );
    await raw.query(
      `INSERT INTO regulatory_applicability_candidates (id,run_id,provision_id,suggestion,rationale,matched_profile_keys,
        confidence,decision,created_at,updated_at)
       VALUES ('cand1','run1','prov1','APPLICABLE','r',ARRAY['scope.certificationScope'],0.95,'APPLICABLE',$1,$1)`,
      [now],
    );
    await raw.query(
      `INSERT INTO regulatory_baselines (id,watch_id,analysis_run_id,profile_snapshot_id,sequence,status,published_by_id,published_at,created_at)
       VALUES ('base1','w1','run1','snap1',1,'PUBLISHED','u1',$1,$1)`,
      [now],
    );
    await raw.query(
      `INSERT INTO regulatory_register_entries (id,baseline_id,provision_id,order_index,citation_label,applicability_rationale,created_at)
       VALUES ('entry1','base1','prov1',0,'4.1','Applicable',$1)`,
      [now],
    );
    await raw.query(
      `INSERT INTO regulatory_evaluations (id,entry_id,result,revision,created_at,updated_at)
       VALUES ('eval1','entry1','NOT_ASSESSED',1,$1,$1)`,
      [now],
    );
    await raw.query(
      `UPDATE project_regulatory_watches SET current_baseline_id = 'base1' WHERE id = 'w1'`,
    );
    deleteObjects.mockClear();
  });

  async function count(table: string, where = "1=1") {
    const result = await raw.query<{ count: string }>(
      `SELECT COUNT(*) FROM ${table} WHERE ${where}`,
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  it("reports the full blast radius without deleting anything", async () => {
    const result = await service.purgeDocument(admin, "d1", { confirm: false });

    expect(result).toMatchObject({
      purged: false,
      impact: {
        revisions: 1,
        files: 1,
        provisions: 1,
        chunks: 1,
        embeddings: 1,
        relationships: 1,
        activityEntries: 1,
        regulatorySyncEvents: 1,
        regulatoryRegisterEntries: 1,
        regulatoryCandidates: 1,
      },
    });
    expect(await count("documents", "id = 'd1'")).toBe(1);
    expect(deleteObjects).not.toHaveBeenCalled();
  });

  it("removes the document and every dependent row in one transaction", async () => {
    await expect(service.purgeDocument(admin, "d1", { confirm: true })).resolves.toMatchObject({
      purged: true,
    });

    expect(await count("documents", "id = 'd1'")).toBe(0);
    expect(await count("document_versions")).toBe(1); // d2's revision survives
    expect(await count("document_files")).toBe(0);
    expect(await count("document_provisions")).toBe(0);
    expect(await count("document_chunks")).toBe(0);
    expect(await count("document_embeddings")).toBe(0);
    expect(await count("document_relationships")).toBe(0);
    expect(await count("document_activity_log")).toBe(0);
    expect(await count("regulatory_sync_events")).toBe(0);
    expect(await count("regulatory_register_entries")).toBe(0);
    expect(await count("regulatory_applicability_candidates")).toBe(0);
    expect(await count("regulatory_evaluations")).toBe(0);
    expect(deleteObjects).toHaveBeenCalledWith(["documents/d1/versions/v-d1/f.pdf"]);
  });

  it("leaves unrelated documents and the customer's watch intact", async () => {
    await service.purgeDocument(admin, "d1", { confirm: true });

    expect(await count("documents", "id = 'd2'")).toBe(1);
    expect(await count("project_regulatory_watches", "id = 'w1'")).toBe(1);
    expect(await count("projects", "id = 'proj1'")).toBe(1);
    // The analysis run survives with its document pointer nulled by SET NULL.
    expect(await count("regulatory_analysis_runs", "trigger_document_version_id IS NULL")).toBe(1);
  });

  it("frees the embedding profile's coverage gap so readiness recomputes", async () => {
    // Purging the only indexed document must not leave dangling embeddings
    // that would make the active profile look complete over missing content.
    await service.purgeDocument(admin, "d1", { confirm: true });

    expect(await count("document_embeddings", "embedding_profile_id = 'p1'")).toBe(0);
    expect(await count("embedding_profiles", "id = 'p1'")).toBe(1);
  });

  it("is repeatable, so a purged id cannot be purged twice", async () => {
    await service.purgeDocument(admin, "d1", { confirm: true });

    await expect(service.purgeDocument(admin, "d1", { confirm: true })).rejects.toThrow(
      "Document not found",
    );
  });
});
