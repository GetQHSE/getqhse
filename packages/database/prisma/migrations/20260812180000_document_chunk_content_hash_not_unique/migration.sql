-- Identical text legitimately repeats within a single document (recurring
-- boilerplate, short repeated notes such as "Aucune exigence."), and
-- content_hash is sha256(content) alone -- it does not incorporate
-- heading_path or the owning provision. Such chunks therefore collide by
-- construction, which made the chunking stage fail permanently on documents
-- like ISO 9001. Demote the uniqueness guarantee to a plain lookup index;
-- (document_version_id, chunking_version, chunk_index) remains unique and is
-- the real integrity constraint.
DROP INDEX IF EXISTS "document_chunks_document_version_id_chunking_version_conten_key";

CREATE INDEX IF NOT EXISTS "document_chunks_document_version_id_chunking_version_conten_idx"
    ON "document_chunks" ("document_version_id", "chunking_version", "content_hash");
