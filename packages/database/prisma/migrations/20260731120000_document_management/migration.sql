-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'UPLOADED', 'PROCESSING', 'REVIEW_REQUIRED', 'VALIDATED', 'PUBLISHED', 'PROCESSING_FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('PLATFORM_INTERNAL', 'ORGANIZATION_AVAILABLE', 'PUBLIC_REFERENCE', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "VersionChangeType" AS ENUM ('INITIAL', 'MINOR_REVISION', 'MAJOR_REVISION', 'AMENDMENT', 'CORRECTION', 'REPLACEMENT', 'TRANSLATION');

-- CreateEnum
CREATE TYPE "ProcessingJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('NOT_STARTED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReviewIssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'BLOCKING');

-- CreateEnum
CREATE TYPE "ReviewIssueStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "short_title" TEXT,
    "description" TEXT,
    "document_type" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "jurisdiction" TEXT,
    "country_code" TEXT,
    "language" TEXT NOT NULL,
    "issuing_authority" TEXT,
    "reference_number" TEXT,
    "publication_date" DATE,
    "effective_date" DATE,
    "expiration_date" DATE,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'PLATFORM_INTERNAL',
    "current_version_id" TEXT,
    "supersedes_document_id" TEXT,
    "replaced_by_document_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT NOT NULL,
    "published_by_user_id" TEXT,
    "published_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "version_label" TEXT NOT NULL,
    "revision_date" DATE,
    "effective_date" DATE,
    "expiration_date" DATE,
    "change_summary" TEXT,
    "change_type" "VersionChangeType" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "original_file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_extension" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "page_count" INTEGER,
    "word_count" INTEGER,
    "character_count" INTEGER,
    "extraction_method" TEXT,
    "ocr_used" BOOLEAN NOT NULL DEFAULT false,
    "ocr_confidence" DECIMAL(5,4),
    "processing_status" "ProcessingJobStatus" NOT NULL DEFAULT 'PENDING',
    "processing_error" TEXT,
    "raw_extracted_text_location" TEXT,
    "normalized_text_location" TEXT,
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "supersedes_version_id" TEXT,
    "chunking_version" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "validated_by_user_id" TEXT,
    "validated_at" TIMESTAMP(3),
    "published_by_user_id" TEXT,
    "published_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_files" (
    "id" TEXT NOT NULL,
    "document_version_id" TEXT NOT NULL,
    "file_role" TEXT NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_extension" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "uploaded_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_relationships" (
    "id" TEXT NOT NULL,
    "source_document_id" TEXT NOT NULL,
    "source_version_id" TEXT,
    "target_document_id" TEXT NOT NULL,
    "target_version_id" TEXT,
    "relationship_type" TEXT NOT NULL,
    "description" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_processing_jobs" (
    "id" TEXT NOT NULL,
    "document_version_id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "status" "ProcessingJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "input_metadata" JSONB,
    "output_metadata" JSONB,
    "output_location" TEXT,
    "quality_score" DECIMAL(5,4),
    "worker_version" TEXT,
    "processing_configuration" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sections" (
    "id" TEXT NOT NULL,
    "document_version_id" TEXT NOT NULL,
    "parent_section_id" TEXT,
    "section_type" TEXT NOT NULL,
    "section_number" TEXT,
    "title" TEXT,
    "normalized_title" TEXT,
    "content" TEXT NOT NULL,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "order_index" INTEGER NOT NULL,
    "source_location" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" TEXT NOT NULL,
    "document_version_id" TEXT NOT NULL,
    "document_section_id" TEXT,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "source_location" JSONB,
    "content_hash" TEXT NOT NULL,
    "chunking_version" TEXT NOT NULL,
    "embedding_status" "ProcessingJobStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxonomies" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taxonomies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxonomy_terms" (
    "id" TEXT NOT NULL,
    "taxonomy_id" TEXT NOT NULL,
    "parent_term_id" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taxonomy_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_taxonomy_terms" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "taxonomy_term_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence_score" DECIMAL(5,4),
    "is_validated" BOOLEAN NOT NULL DEFAULT false,
    "validated_by_user_id" TEXT,
    "validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_taxonomy_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_metadata_suggestions" (
    "id" TEXT NOT NULL,
    "document_version_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "suggested_value" JSONB NOT NULL,
    "confidence_score" DECIMAL(5,4) NOT NULL,
    "source_page" INTEGER,
    "source_text" TEXT,
    "decision" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_metadata_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_reviews" (
    "id" TEXT NOT NULL,
    "document_version_id" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "assigned_to_user_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "notes" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_review_issues" (
    "id" TEXT NOT NULL,
    "document_version_id" TEXT NOT NULL,
    "processing_job_id" TEXT,
    "issue_type" TEXT NOT NULL,
    "severity" "ReviewIssueSeverity" NOT NULL,
    "status" "ReviewIssueStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source_location" JSONB,
    "assigned_to_user_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "resolved_by_user_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_review_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_activity_log" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "document_version_id" TEXT,
    "actor_user_id" TEXT,
    "organization_id" TEXT,
    "action" TEXT NOT NULL,
    "ip_address" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_current_version_id_key" ON "documents"("current_version_id");

-- CreateIndex
CREATE INDEX "documents_status_updated_at_idx" ON "documents"("status", "updated_at");

-- CreateIndex
CREATE INDEX "documents_document_type_country_code_idx" ON "documents"("document_type", "country_code");

-- CreateIndex
CREATE INDEX "documents_reference_number_idx" ON "documents"("reference_number");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_storage_key_key" ON "document_versions"("storage_key");

-- CreateIndex
CREATE INDEX "document_versions_file_hash_idx" ON "document_versions"("file_hash");

-- CreateIndex
CREATE INDEX "document_versions_status_processing_status_idx" ON "document_versions"("status", "processing_status");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_version_number_key" ON "document_versions"("document_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_version_label_key" ON "document_versions"("document_id", "version_label");

-- CreateIndex
CREATE UNIQUE INDEX "document_files_storage_key_key" ON "document_files"("storage_key");

-- CreateIndex
CREATE INDEX "document_files_file_hash_idx" ON "document_files"("file_hash");

-- CreateIndex
CREATE UNIQUE INDEX "document_files_document_version_id_file_hash_file_role_key" ON "document_files"("document_version_id", "file_hash", "file_role");

-- CreateIndex
CREATE UNIQUE INDEX "document_relationships_source_document_id_source_version_id_key" ON "document_relationships"("source_document_id", "source_version_id", "target_document_id", "target_version_id", "relationship_type");

-- CreateIndex
CREATE UNIQUE INDEX "document_processing_jobs_idempotency_key_key" ON "document_processing_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "document_processing_jobs_status_job_type_idx" ON "document_processing_jobs"("status", "job_type");

-- CreateIndex
CREATE INDEX "document_processing_jobs_document_version_id_created_at_idx" ON "document_processing_jobs"("document_version_id", "created_at");

-- CreateIndex
CREATE INDEX "document_sections_parent_section_id_idx" ON "document_sections"("parent_section_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_sections_document_version_id_order_index_key" ON "document_sections"("document_version_id", "order_index");

-- CreateIndex
CREATE UNIQUE INDEX "document_chunks_document_version_id_chunking_version_chunk__key" ON "document_chunks"("document_version_id", "chunking_version", "chunk_index");

-- CreateIndex
CREATE UNIQUE INDEX "document_chunks_document_version_id_chunking_version_conten_key" ON "document_chunks"("document_version_id", "chunking_version", "content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "taxonomies_key_key" ON "taxonomies"("key");

-- CreateIndex
CREATE UNIQUE INDEX "taxonomy_terms_taxonomy_id_key_key" ON "taxonomy_terms"("taxonomy_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "document_taxonomy_terms_document_id_taxonomy_term_id_source_key" ON "document_taxonomy_terms"("document_id", "taxonomy_term_id", "source");

-- CreateIndex
CREATE UNIQUE INDEX "document_metadata_suggestions_document_version_id_field_nam_key" ON "document_metadata_suggestions"("document_version_id", "field_name");

-- CreateIndex
CREATE INDEX "document_reviews_status_assigned_to_user_id_idx" ON "document_reviews"("status", "assigned_to_user_id");

-- CreateIndex
CREATE INDEX "document_review_issues_document_version_id_status_severity_idx" ON "document_review_issues"("document_version_id", "status", "severity");

-- CreateIndex
CREATE INDEX "document_activity_log_document_id_created_at_idx" ON "document_activity_log"("document_id", "created_at");

-- CreateIndex
CREATE INDEX "document_activity_log_action_created_at_idx" ON "document_activity_log"("action", "created_at");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_supersedes_document_id_fkey" FOREIGN KEY ("supersedes_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_replaced_by_document_id_fkey" FOREIGN KEY ("replaced_by_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_published_by_user_id_fkey" FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_supersedes_version_id_fkey" FOREIGN KEY ("supersedes_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_validated_by_user_id_fkey" FOREIGN KEY ("validated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_published_by_user_id_fkey" FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_relationships" ADD CONSTRAINT "document_relationships_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_relationships" ADD CONSTRAINT "document_relationships_source_version_id_fkey" FOREIGN KEY ("source_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_relationships" ADD CONSTRAINT "document_relationships_target_document_id_fkey" FOREIGN KEY ("target_document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_relationships" ADD CONSTRAINT "document_relationships_target_version_id_fkey" FOREIGN KEY ("target_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_relationships" ADD CONSTRAINT "document_relationships_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_processing_jobs" ADD CONSTRAINT "document_processing_jobs_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sections" ADD CONSTRAINT "document_sections_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sections" ADD CONSTRAINT "document_sections_parent_section_id_fkey" FOREIGN KEY ("parent_section_id") REFERENCES "document_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_section_id_fkey" FOREIGN KEY ("document_section_id") REFERENCES "document_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxonomy_terms" ADD CONSTRAINT "taxonomy_terms_taxonomy_id_fkey" FOREIGN KEY ("taxonomy_id") REFERENCES "taxonomies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxonomy_terms" ADD CONSTRAINT "taxonomy_terms_parent_term_id_fkey" FOREIGN KEY ("parent_term_id") REFERENCES "taxonomy_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_taxonomy_terms" ADD CONSTRAINT "document_taxonomy_terms_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_taxonomy_terms" ADD CONSTRAINT "document_taxonomy_terms_taxonomy_term_id_fkey" FOREIGN KEY ("taxonomy_term_id") REFERENCES "taxonomy_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_taxonomy_terms" ADD CONSTRAINT "document_taxonomy_terms_validated_by_user_id_fkey" FOREIGN KEY ("validated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_metadata_suggestions" ADD CONSTRAINT "document_metadata_suggestions_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_metadata_suggestions" ADD CONSTRAINT "document_metadata_suggestions_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_review_issues" ADD CONSTRAINT "document_review_issues_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_review_issues" ADD CONSTRAINT "document_review_issues_processing_job_id_fkey" FOREIGN KEY ("processing_job_id") REFERENCES "document_processing_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_review_issues" ADD CONSTRAINT "document_review_issues_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_review_issues" ADD CONSTRAINT "document_review_issues_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_review_issues" ADD CONSTRAINT "document_review_issues_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_activity_log" ADD CONSTRAINT "document_activity_log_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_activity_log" ADD CONSTRAINT "document_activity_log_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_activity_log" ADD CONSTRAINT "document_activity_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
