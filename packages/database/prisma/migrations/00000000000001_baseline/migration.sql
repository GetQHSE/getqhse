-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('DRAFT', 'PLANNED', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssessmentResult" AS ENUM ('CONFORMING', 'PARTIAL', 'NON_CONFORMING', 'NOT_ASSESSED');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('DOCUMENT', 'PHOTO', 'NOTE', 'LINK');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('OBSERVATION', 'MINOR', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'VERIFIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CorrectiveActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'VERIFIED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'ACTIVE', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'UPLOADED', 'PROCESSING', 'REVIEW_REQUIRED', 'VALIDATED', 'PUBLISHED', 'PROCESSING_FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('PLATFORM_INTERNAL', 'ORGANIZATION_AVAILABLE', 'PUBLIC_REFERENCE', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "VersionChangeType" AS ENUM ('INITIAL', 'REPLACEMENT');

-- CreateEnum
CREATE TYPE "DocumentProvisionType" AS ENUM ('CLAUSE', 'ARTICLE', 'DEFINITION', 'ANNEX', 'TABLE', 'NOTE', 'SECTION');

-- CreateEnum
CREATE TYPE "EmbeddingProfileStatus" AS ENUM ('BUILDING', 'READY', 'ACTIVE', 'RETIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProcessingJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ProjectEntityType" AS ENUM ('COMPANY', 'SCHOOL', 'UNIVERSITY', 'INSTITUTION', 'ASSOCIATION', 'PUBLIC_ADMINISTRATION', 'INDUSTRIAL_SITE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('EMPTY', 'PROFILE_IN_PROGRESS', 'PROFILE_REVIEW', 'READY_FOR_ANALYSIS', 'ANALYSIS_IN_PROGRESS', 'REVIEW_REQUIRED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('IN_PROGRESS', 'REVIEW_REQUIRED', 'COMPLETE', 'STALE');

-- CreateEnum
CREATE TYPE "ProfileFieldStatus" AS ENUM ('UNANSWERED', 'ANSWERED', 'NEEDS_CLARIFICATION', 'NOT_APPLICABLE', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "ProfileFieldSource" AS ENUM ('ONBOARDING', 'USER_CHAT', 'USER_EDIT', 'AI_INFERRED', 'IMPORTED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ProfileConversationStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ProfileMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "AiInvocationStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RegulatoryWatchStatus" AS ENUM ('NOT_STARTED', 'ANALYZING', 'AWAITING_CLARIFICATION', 'REVIEW_REQUIRED', 'ACTIVE', 'STALE', 'FAILED');

-- CreateEnum
CREATE TYPE "RegulatoryAnalysisStatus" AS ENUM ('QUEUED', 'RUNNING', 'AWAITING_CLARIFICATION', 'READY_FOR_REVIEW', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RegulatoryApplicability" AS ENUM ('APPLICABLE', 'TO_CONFIRM', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "RegulatoryBaselineStatus" AS ENUM ('PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "RegulatoryActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'VERIFIED');

-- CreateEnum
CREATE TYPE "RegulatoryEffectiveness" AS ENUM ('PENDING', 'EFFECTIVE', 'INEFFECTIVE');

-- CreateEnum
CREATE TYPE "FileUploadStatus" AS ENUM ('PENDING', 'READY', 'REJECTED');

-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('CHAT_ATTACHMENT', 'VOICE_NOTE', 'EVIDENCE', 'REGULATORY_EVIDENCE');

-- CreateEnum
CREATE TYPE "TranscriptionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('NOT_STARTED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReviewIssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'BLOCKING');

-- CreateEnum
CREATE TYPE "ReviewIssueStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "locale" TEXT NOT NULL DEFAULT 'fr-MA',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Casablanca',
    "platform_role" TEXT NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

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
    "source_edition" TEXT,
    "source_url" TEXT,
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
    "storage_allowed" BOOLEAN NOT NULL DEFAULT false,
    "extraction_allowed" BOOLEAN NOT NULL DEFAULT false,
    "embedding_allowed" BOOLEAN NOT NULL DEFAULT false,
    "ai_processing_allowed" BOOLEAN NOT NULL DEFAULT false,
    "external_provider_allowed" BOOLEAN NOT NULL DEFAULT false,
    "excerpt_display_allowed" BOOLEAN NOT NULL DEFAULT false,
    "export_allowed" BOOLEAN NOT NULL DEFAULT false,
    "rights_reviewed_at" TIMESTAMP(3),
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
CREATE TABLE "document_provisions" (
    "id" TEXT NOT NULL,
    "document_version_id" TEXT NOT NULL,
    "document_section_id" TEXT,
    "provision_type" "DocumentProvisionType" NOT NULL,
    "source_identifier" TEXT,
    "title" TEXT,
    "heading_path" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "language" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "source_location" JSONB,
    "order_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_provisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" TEXT NOT NULL,
    "document_version_id" TEXT NOT NULL,
    "document_section_id" TEXT,
    "document_provision_id" TEXT,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "search_text" TEXT NOT NULL,
    "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce("search_text", ''))) STORED,
    "language" TEXT NOT NULL,
    "heading_path" TEXT[] DEFAULT ARRAY[]::TEXT[],
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
CREATE TABLE "embedding_profiles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL DEFAULT 768,
    "version" INTEGER NOT NULL,
    "status" "EmbeddingProfileStatus" NOT NULL DEFAULT 'BUILDING',
    "activated_at" TIMESTAMP(3),
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "embedding_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_embeddings" (
    "id" TEXT NOT NULL,
    "document_chunk_id" TEXT NOT NULL,
    "embedding_profile_id" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "embedding" vector(768) NOT NULL,
    "token_count" INTEGER,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retrieval_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "query_hash" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "returned_source_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "embedding_profile_id" TEXT,
    "result_count" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retrieval_logs_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT NOT NULL,
    "active_organization_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "icon" TEXT,
    "metadata" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "country_code" TEXT NOT NULL DEFAULT 'MA',
    "locale" TEXT NOT NULL DEFAULT 'fr-MA',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Casablanca',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "inviter_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo_url" TEXT,
    "entity_type" "ProjectEntityType" NOT NULL,
    "country_code" TEXT NOT NULL DEFAULT 'MA',
    "standard_code" TEXT NOT NULL DEFAULT 'ISO_9001',
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'EMPTY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_activities" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_profiles" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" "ProfileStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "completeness_percent" INTEGER NOT NULL DEFAULT 0,
    "regulatory_readiness" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "last_reviewed_at" TIMESTAMP(3),
    "next_review_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_profile_fields" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB,
    "status" "ProfileFieldStatus" NOT NULL DEFAULT 'UNANSWERED',
    "source" "ProfileFieldSource",
    "confidence" DOUBLE PRECISION,
    "source_message_id" TEXT,
    "not_applicable_reason" TEXT,
    "confirmed_by_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_profile_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_profile_field_revisions" (
    "id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,
    "previous_value" JSONB,
    "new_value" JSONB,
    "previous_status" "ProfileFieldStatus",
    "new_status" "ProfileFieldStatus" NOT NULL,
    "source" "ProfileFieldSource" NOT NULL,
    "changed_by_id" TEXT,
    "source_message_id" TEXT,
    "change_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_profile_field_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_profile_snapshots" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "completeness_percent" INTEGER NOT NULL,
    "regulatory_readiness" INTEGER NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_profile_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_regulatory_watches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" "RegulatoryWatchStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "current_baseline_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_regulatory_watches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_analysis_runs" (
    "id" TEXT NOT NULL,
    "watch_id" TEXT NOT NULL,
    "profile_snapshot_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "status" "RegulatoryAnalysisStatus" NOT NULL DEFAULT 'QUEUED',
    "as_of" DATE NOT NULL,
    "languages" TEXT[] DEFAULT ARRAY['fr', 'ar']::TEXT[],
    "phase" TEXT NOT NULL DEFAULT 'queued',
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "clarification_revision" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT,
    "prompt_key" TEXT,
    "prompt_version" INTEGER,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regulatory_analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_scope_facts" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regulatory_scope_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_applicability_candidates" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "provision_id" TEXT NOT NULL,
    "suggestion" "RegulatoryApplicability" NOT NULL,
    "rationale" TEXT NOT NULL,
    "matched_profile_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DECIMAL(5,4) NOT NULL,
    "decision" "RegulatoryApplicability",
    "decision_note" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regulatory_applicability_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_baselines" (
    "id" TEXT NOT NULL,
    "watch_id" TEXT NOT NULL,
    "analysis_run_id" TEXT NOT NULL,
    "profile_snapshot_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "RegulatoryBaselineStatus" NOT NULL DEFAULT 'PUBLISHED',
    "published_by_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_register_entries" (
    "id" TEXT NOT NULL,
    "baseline_id" TEXT NOT NULL,
    "provision_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "citation_label" TEXT NOT NULL,
    "applicability_rationale" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_register_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_evaluations" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "result" "AssessmentResult" NOT NULL DEFAULT 'NOT_ASSESSED',
    "comment" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "evaluated_by_id" TEXT,
    "evaluated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regulatory_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_evaluation_evidence" (
    "id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "file_id" TEXT,
    "label" TEXT,
    "url" TEXT,
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_evaluation_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_evaluation_actions" (
    "id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assignee_id" TEXT,
    "resources" TEXT,
    "due_date" DATE,
    "completed_date" DATE,
    "status" "RegulatoryActionStatus" NOT NULL DEFAULT 'OPEN',
    "effectiveness_criteria" TEXT,
    "effectiveness" "RegulatoryEffectiveness" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regulatory_evaluation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_profile_conversations" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "status" "ProfileConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "language" TEXT NOT NULL DEFAULT 'fr',
    "current_question_key" TEXT,
    "module" TEXT NOT NULL DEFAULT 'PROFILE_COMPLETION',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_profile_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_profile_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" "ProfileMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "client_message_id" TEXT,
    "reply_to_message_id" TEXT,
    "parts" JSONB,
    "model" TEXT,
    "prompt_key" TEXT,
    "prompt_version" INTEGER,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_profile_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_profile_message_attachments" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_profile_message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_invocations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT,
    "profile_id" TEXT,
    "conversation_id" TEXT,
    "module" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "prompt_key" TEXT NOT NULL,
    "prompt_version" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "input_schema_version" INTEGER,
    "input_hash" TEXT NOT NULL,
    "output_hash" TEXT,
    "tool_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "latency_ms" INTEGER,
    "status" "AiInvocationStatus" NOT NULL DEFAULT 'RUNNING',
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "ai_invocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_campaigns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audits" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "campaignId" TEXT,
    "title" TEXT NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "fileId" TEXT,
    "kind" "EvidenceKind" NOT NULL,
    "summary" TEXT,
    "assessmentResult" "AssessmentResult" NOT NULL DEFAULT 'NOT_ASSESSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corrective_actions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assigneeId" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "CorrectiveActionStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corrective_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "checksum" TEXT NOT NULL,
    "purpose" "FilePurpose" NOT NULL DEFAULT 'CHAT_ATTACHMENT',
    "upload_status" "FileUploadStatus" NOT NULL DEFAULT 'PENDING',
    "uploaded_by_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_transcriptions" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "language" TEXT,
    "text" TEXT,
    "duration_ms" INTEGER,
    "status" "TranscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "file_transcriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "externalJobId" TEXT,
    "correlationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

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
CREATE INDEX "document_provisions_document_version_id_source_identifier_idx" ON "document_provisions"("document_version_id", "source_identifier");

-- CreateIndex
CREATE INDEX "document_provisions_language_provision_type_idx" ON "document_provisions"("language", "provision_type");

-- CreateIndex
CREATE UNIQUE INDEX "document_provisions_document_version_id_order_index_key" ON "document_provisions"("document_version_id", "order_index");

-- CreateIndex
CREATE INDEX "document_chunks_document_provision_id_idx" ON "document_chunks"("document_provision_id");

CREATE INDEX "document_chunks_search_vector_idx" ON "document_chunks" USING GIN ("search_vector");

-- CreateIndex
CREATE UNIQUE INDEX "document_chunks_document_version_id_chunking_version_chunk__key" ON "document_chunks"("document_version_id", "chunking_version", "chunk_index");

-- CreateIndex
CREATE UNIQUE INDEX "document_chunks_document_version_id_chunking_version_conten_key" ON "document_chunks"("document_version_id", "chunking_version", "content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "embedding_profiles_key_key" ON "embedding_profiles"("key");

-- CreateIndex
CREATE INDEX "embedding_profiles_status_idx" ON "embedding_profiles"("status");

-- CreateIndex
CREATE UNIQUE INDEX "embedding_profiles_provider_model_dimensions_version_key" ON "embedding_profiles"("provider", "model", "dimensions", "version");

-- CreateIndex
CREATE INDEX "document_embeddings_embedding_profile_id_idx" ON "document_embeddings"("embedding_profile_id");

CREATE INDEX "document_embeddings_embedding_hnsw_idx" ON "document_embeddings" USING hnsw ("embedding" vector_cosine_ops);

-- CreateIndex
CREATE UNIQUE INDEX "document_embeddings_document_chunk_id_embedding_profile_id_key" ON "document_embeddings"("document_chunk_id", "embedding_profile_id");

-- CreateIndex
CREATE INDEX "retrieval_logs_organization_id_created_at_idx" ON "retrieval_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "retrieval_logs_embedding_profile_id_created_at_idx" ON "retrieval_logs"("embedding_profile_id", "created_at");

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

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_id_account_id_key" ON "accounts"("provider_id", "account_id");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "members_user_id_idx" ON "members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "members_organization_id_user_id_key" ON "members"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE INDEX "invitations_organization_id_idx" ON "invitations"("organization_id");

-- CreateIndex
CREATE INDEX "sites_organizationId_name_idx" ON "sites"("organizationId", "name");

-- CreateIndex
CREATE INDEX "sites_organizationId_deletedAt_idx" ON "sites"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "sites_organizationId_code_key" ON "sites"("organizationId", "code");

-- CreateIndex
CREATE INDEX "projects_organization_id_idx" ON "projects"("organization_id");

-- CreateIndex
CREATE INDEX "projects_created_by_id_idx" ON "projects"("created_by_id");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organization_id_slug_key" ON "projects"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "project_activities_project_id_idx" ON "project_activities"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_activities_project_id_normalized_name_key" ON "project_activities"("project_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "project_profiles_project_id_key" ON "project_profiles"("project_id");

-- CreateIndex
CREATE INDEX "project_profiles_status_idx" ON "project_profiles"("status");

-- CreateIndex
CREATE INDEX "project_profile_fields_profile_id_status_idx" ON "project_profile_fields"("profile_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "project_profile_fields_profile_id_key_key" ON "project_profile_fields"("profile_id", "key");

-- CreateIndex
CREATE INDEX "project_profile_field_revisions_field_id_created_at_idx" ON "project_profile_field_revisions"("field_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_profile_snapshots_profile_id_sequence_key" ON "project_profile_snapshots"("profile_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "project_profile_snapshots_profile_id_content_hash_key" ON "project_profile_snapshots"("profile_id", "content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "project_regulatory_watches_project_id_key" ON "project_regulatory_watches"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_regulatory_watches_current_baseline_id_key" ON "project_regulatory_watches"("current_baseline_id");

-- CreateIndex
CREATE INDEX "project_regulatory_watches_organization_id_status_idx" ON "project_regulatory_watches"("organization_id", "status");

-- CreateIndex
CREATE INDEX "regulatory_analysis_runs_watch_id_created_at_idx" ON "regulatory_analysis_runs"("watch_id", "created_at");

-- CreateIndex
CREATE INDEX "regulatory_analysis_runs_status_created_at_idx" ON "regulatory_analysis_runs"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "regulatory_scope_facts_run_id_key_key" ON "regulatory_scope_facts"("run_id", "key");

-- CreateIndex
CREATE INDEX "regulatory_applicability_candidates_run_id_decision_suggest_idx" ON "regulatory_applicability_candidates"("run_id", "decision", "suggestion");

-- CreateIndex
CREATE UNIQUE INDEX "regulatory_applicability_candidates_run_id_provision_id_key" ON "regulatory_applicability_candidates"("run_id", "provision_id");

-- CreateIndex
CREATE UNIQUE INDEX "regulatory_baselines_analysis_run_id_key" ON "regulatory_baselines"("analysis_run_id");

-- CreateIndex
CREATE INDEX "regulatory_baselines_watch_id_status_idx" ON "regulatory_baselines"("watch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "regulatory_baselines_watch_id_sequence_key" ON "regulatory_baselines"("watch_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "regulatory_register_entries_baseline_id_provision_id_key" ON "regulatory_register_entries"("baseline_id", "provision_id");

-- CreateIndex
CREATE UNIQUE INDEX "regulatory_register_entries_baseline_id_order_index_key" ON "regulatory_register_entries"("baseline_id", "order_index");

-- CreateIndex
CREATE UNIQUE INDEX "regulatory_evaluations_entry_id_key" ON "regulatory_evaluations"("entry_id");

-- CreateIndex
CREATE INDEX "regulatory_evaluations_result_updated_at_idx" ON "regulatory_evaluations"("result", "updated_at");

-- CreateIndex
CREATE INDEX "regulatory_evaluation_evidence_evaluation_id_created_at_idx" ON "regulatory_evaluation_evidence"("evaluation_id", "created_at");

-- CreateIndex
CREATE INDEX "regulatory_evaluation_actions_evaluation_id_status_idx" ON "regulatory_evaluation_actions"("evaluation_id", "status");

-- CreateIndex
CREATE INDEX "regulatory_evaluation_actions_assignee_id_due_date_idx" ON "regulatory_evaluation_actions"("assignee_id", "due_date");

-- CreateIndex
CREATE INDEX "project_profile_conversations_profile_id_status_idx" ON "project_profile_conversations"("profile_id", "status");

-- CreateIndex
CREATE INDEX "project_profile_messages_conversation_id_created_at_idx" ON "project_profile_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "project_profile_messages_reply_to_message_id_idx" ON "project_profile_messages"("reply_to_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_profile_messages_conversation_id_client_message_id_key" ON "project_profile_messages"("conversation_id", "client_message_id");

-- CreateIndex
CREATE INDEX "project_profile_message_attachments_file_id_idx" ON "project_profile_message_attachments"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_profile_message_attachments_message_id_file_id_key" ON "project_profile_message_attachments"("message_id", "file_id");

-- CreateIndex
CREATE INDEX "ai_invocations_organization_id_created_at_idx" ON "ai_invocations"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_invocations_project_id_created_at_idx" ON "ai_invocations"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_invocations_module_task_created_at_idx" ON "ai_invocations"("module", "task", "created_at");

-- CreateIndex
CREATE INDEX "audit_campaigns_organizationId_startsAt_idx" ON "audit_campaigns"("organizationId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "audit_campaigns_organizationId_name_startsAt_key" ON "audit_campaigns"("organizationId", "name", "startsAt");

-- CreateIndex
CREATE INDEX "audits_organizationId_status_idx" ON "audits"("organizationId", "status");

-- CreateIndex
CREATE INDEX "audits_organizationId_siteId_idx" ON "audits"("organizationId", "siteId");

-- CreateIndex
CREATE INDEX "evidence_organizationId_auditId_idx" ON "evidence"("organizationId", "auditId");

-- CreateIndex
CREATE INDEX "findings_organizationId_auditId_idx" ON "findings"("organizationId", "auditId");

-- CreateIndex
CREATE INDEX "findings_organizationId_severity_status_idx" ON "findings"("organizationId", "severity", "status");

-- CreateIndex
CREATE INDEX "corrective_actions_organizationId_status_dueAt_idx" ON "corrective_actions"("organizationId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "corrective_actions_organizationId_findingId_idx" ON "corrective_actions"("organizationId", "findingId");

-- CreateIndex
CREATE INDEX "files_organizationId_deletedAt_idx" ON "files"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "files_organizationId_objectKey_key" ON "files"("organizationId", "objectKey");

-- CreateIndex
CREATE INDEX "file_transcriptions_status_created_at_idx" ON "file_transcriptions"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "file_transcriptions_file_id_model_key" ON "file_transcriptions"("file_id", "model");

-- CreateIndex
CREATE INDEX "background_jobs_organizationId_status_idx" ON "background_jobs"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "background_jobs_organizationId_queue_idempotencyKey_key" ON "background_jobs"("organizationId", "queue", "idempotencyKey");

-- CreateIndex
CREATE INDEX "audit_log_entries_organizationId_createdAt_idx" ON "audit_log_entries"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_entries_organizationId_entityType_entityId_idx" ON "audit_log_entries"("organizationId", "entityType", "entityId");

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
ALTER TABLE "document_provisions" ADD CONSTRAINT "document_provisions_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_provisions" ADD CONSTRAINT "document_provisions_document_section_id_fkey" FOREIGN KEY ("document_section_id") REFERENCES "document_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_section_id_fkey" FOREIGN KEY ("document_section_id") REFERENCES "document_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_provision_id_fkey" FOREIGN KEY ("document_provision_id") REFERENCES "document_provisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_embeddings" ADD CONSTRAINT "document_embeddings_document_chunk_id_fkey" FOREIGN KEY ("document_chunk_id") REFERENCES "document_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_embeddings" ADD CONSTRAINT "document_embeddings_embedding_profile_id_fkey" FOREIGN KEY ("embedding_profile_id") REFERENCES "embedding_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retrieval_logs" ADD CONSTRAINT "retrieval_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retrieval_logs" ADD CONSTRAINT "retrieval_logs_embedding_profile_id_fkey" FOREIGN KEY ("embedding_profile_id") REFERENCES "embedding_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_profiles" ADD CONSTRAINT "project_profiles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_profile_fields" ADD CONSTRAINT "project_profile_fields_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "project_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_profile_fields" ADD CONSTRAINT "project_profile_fields_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_profile_field_revisions" ADD CONSTRAINT "project_profile_field_revisions_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "project_profile_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_profile_field_revisions" ADD CONSTRAINT "project_profile_field_revisions_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_profile_snapshots" ADD CONSTRAINT "project_profile_snapshots_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "project_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_profile_snapshots" ADD CONSTRAINT "project_profile_snapshots_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_regulatory_watches" ADD CONSTRAINT "project_regulatory_watches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_regulatory_watches" ADD CONSTRAINT "project_regulatory_watches_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_regulatory_watches" ADD CONSTRAINT "project_regulatory_watches_current_baseline_id_fkey" FOREIGN KEY ("current_baseline_id") REFERENCES "regulatory_baselines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_analysis_runs" ADD CONSTRAINT "regulatory_analysis_runs_watch_id_fkey" FOREIGN KEY ("watch_id") REFERENCES "project_regulatory_watches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_analysis_runs" ADD CONSTRAINT "regulatory_analysis_runs_profile_snapshot_id_fkey" FOREIGN KEY ("profile_snapshot_id") REFERENCES "project_profile_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_analysis_runs" ADD CONSTRAINT "regulatory_analysis_runs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_scope_facts" ADD CONSTRAINT "regulatory_scope_facts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "regulatory_analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_applicability_candidates" ADD CONSTRAINT "regulatory_applicability_candidates_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "regulatory_analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_applicability_candidates" ADD CONSTRAINT "regulatory_applicability_candidates_provision_id_fkey" FOREIGN KEY ("provision_id") REFERENCES "document_provisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_applicability_candidates" ADD CONSTRAINT "regulatory_applicability_candidates_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_baselines" ADD CONSTRAINT "regulatory_baselines_watch_id_fkey" FOREIGN KEY ("watch_id") REFERENCES "project_regulatory_watches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_baselines" ADD CONSTRAINT "regulatory_baselines_analysis_run_id_fkey" FOREIGN KEY ("analysis_run_id") REFERENCES "regulatory_analysis_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_baselines" ADD CONSTRAINT "regulatory_baselines_profile_snapshot_id_fkey" FOREIGN KEY ("profile_snapshot_id") REFERENCES "project_profile_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_baselines" ADD CONSTRAINT "regulatory_baselines_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_register_entries" ADD CONSTRAINT "regulatory_register_entries_baseline_id_fkey" FOREIGN KEY ("baseline_id") REFERENCES "regulatory_baselines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_register_entries" ADD CONSTRAINT "regulatory_register_entries_provision_id_fkey" FOREIGN KEY ("provision_id") REFERENCES "document_provisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_evaluations" ADD CONSTRAINT "regulatory_evaluations_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "regulatory_register_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_evaluations" ADD CONSTRAINT "regulatory_evaluations_evaluated_by_id_fkey" FOREIGN KEY ("evaluated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_evaluation_evidence" ADD CONSTRAINT "regulatory_evaluation_evidence_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "regulatory_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_evaluation_evidence" ADD CONSTRAINT "regulatory_evaluation_evidence_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_evaluation_evidence" ADD CONSTRAINT "regulatory_evaluation_evidence_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_evaluation_actions" ADD CONSTRAINT "regulatory_evaluation_actions_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "regulatory_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_evaluation_actions" ADD CONSTRAINT "regulatory_evaluation_actions_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_profile_conversations" ADD CONSTRAINT "project_profile_conversations_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "project_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_profile_conversations" ADD CONSTRAINT "project_profile_conversations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_profile_messages" ADD CONSTRAINT "project_profile_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "project_profile_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_profile_message_attachments" ADD CONSTRAINT "project_profile_message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "project_profile_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_profile_message_attachments" ADD CONSTRAINT "project_profile_message_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_invocations" ADD CONSTRAINT "ai_invocations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_invocations" ADD CONSTRAINT "ai_invocations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_invocations" ADD CONSTRAINT "ai_invocations_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "project_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_invocations" ADD CONSTRAINT "ai_invocations_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "project_profile_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_campaigns" ADD CONSTRAINT "audit_campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "audit_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_transcriptions" ADD CONSTRAINT "file_transcriptions_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log_entries" ADD CONSTRAINT "audit_log_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "users"
  ADD CONSTRAINT "users_status_check"
  CHECK ("status" IN ('active', 'suspended', 'deleted')),
  ADD CONSTRAINT "users_platform_role_check"
  CHECK ("platform_role" IN ('user', 'super_admin', 'platform_admin', 'support', 'content_manager'));

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_status_check"
  CHECK ("status" IN ('active', 'suspended', 'archived'));

ALTER TABLE "members"
  ADD CONSTRAINT "members_role_check"
  CHECK ("role" IN ('owner', 'admin', 'member')),
  ADD CONSTRAINT "members_status_check"
  CHECK ("status" IN ('active', 'suspended'));
