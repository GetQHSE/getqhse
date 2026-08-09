/*
  Warnings:

  - You are about to drop the column `search_vector` on the `document_chunks` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "document_chunks_search_vector_idx";

-- DropIndex
DROP INDEX "document_embeddings_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "document_chunks" DROP COLUMN "search_vector";
