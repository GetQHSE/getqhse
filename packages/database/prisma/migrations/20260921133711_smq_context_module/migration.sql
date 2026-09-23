-- This migration is scoped to the SMQ Contexte module (ISO 9001 §4.1) only.
-- document_chunks.search_vector and the document_embeddings HNSW index are
-- raw-SQL infrastructure not modelled in schema.prisma (tsvector / pgvector
-- types Prisma does not natively support, see 00000000000001_baseline); a
-- plain `prisma migrate dev` diff wants to drop them on every future
-- migration for that reason. Deliberately excluded here — do not remove.

-- CreateEnum
CREATE TYPE "ContextAnalysisMethod" AS ENUM ('SWOT', 'PESTEL');

-- CreateEnum
CREATE TYPE "ContextRunStatus" AS ENUM ('DRAFT', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ContextIssueOrigin" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "ContextIssueReviewStatus" AS ENUM ('PENDING', 'VALIDATED', 'MODIFIED', 'NOT_RETAINED');

-- CreateEnum
CREATE TYPE "ContextIssueSourceKind" AS ENUM ('AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "ContextEvidenceOrigin" AS ENUM ('SYSTEM', 'USER');

-- CreateTable
CREATE TABLE "project_context_settings" (
    "project_id" TEXT NOT NULL,
    "analysis_method" "ContextAnalysisMethod" NOT NULL DEFAULT 'SWOT',
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_context_settings_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "context_internal_inputs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "section_key" TEXT NOT NULL,
    "question_key" TEXT NOT NULL,
    "question_label" TEXT NOT NULL,
    "answer_text" TEXT NOT NULL DEFAULT '',
    "methodology_version" TEXT NOT NULL DEFAULT 'v1',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "context_internal_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_external_research_runs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" "ContextRunStatus" NOT NULL DEFAULT 'DRAFT',
    "methodology_version" TEXT NOT NULL DEFAULT 'v1',
    "context_snapshot" JSONB NOT NULL DEFAULT '{}',
    "context_fingerprint" TEXT,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "regulatory_run_id" TEXT,
    "model" TEXT,
    "search_queries" JSONB NOT NULL DEFAULT '[]',
    "summary" JSONB NOT NULL DEFAULT '{}',
    "error_message" TEXT,
    "triggered_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "context_external_research_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_external_factors" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "category_key" TEXT NOT NULL,
    "category_label" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "relevance_to_company" TEXT,
    "influence_on_objectives" TEXT,
    "influence_on_quality" TEXT,
    "influence_on_customer_satisfaction" TEXT,
    "geographic_scope" TEXT,
    "orientation" TEXT,
    "evidence_strength" TEXT,
    "confidence" DECIMAL(5,4),
    "source_origin" TEXT NOT NULL DEFAULT 'web_research',
    "regulatory_entry_id" TEXT,
    "canonical_key" TEXT NOT NULL,
    "factor_fingerprint" TEXT NOT NULL,
    "comparison_status" TEXT,
    "previous_factor_id" TEXT,
    "model" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_external_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_external_factor_sources" (
    "id" TEXT NOT NULL,
    "factor_id" TEXT NOT NULL,
    "url" TEXT,
    "title" TEXT,
    "publisher" TEXT,
    "source_date" DATE,
    "grounding_origin" TEXT NOT NULL DEFAULT 'search_grounding',
    "excerpt" TEXT,
    "authority_tier" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_external_factor_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_analysis_runs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" "ContextRunStatus" NOT NULL DEFAULT 'DRAFT',
    "methodology_version" TEXT NOT NULL DEFAULT 'v1',
    "context_snapshot" JSONB NOT NULL DEFAULT '{}',
    "context_fingerprint" TEXT,
    "inputs" JSONB NOT NULL DEFAULT '{}',
    "summary" JSONB NOT NULL DEFAULT '{}',
    "error_message" TEXT,
    "triggered_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "context_analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_issues" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "previous_issue_id" TEXT,
    "issue_fingerprint" TEXT NOT NULL,
    "canonical_key" TEXT NOT NULL,
    "comparison_status" TEXT,
    "ai_origin" "ContextIssueOrigin" NOT NULL,
    "ai_category_key" TEXT,
    "ai_category_label" TEXT,
    "ai_title" TEXT NOT NULL,
    "ai_description" TEXT,
    "ai_reasoning" TEXT,
    "ai_nature" TEXT,
    "ai_impact_quality" TEXT,
    "ai_impact_customer_satisfaction" TEXT,
    "ai_impact_overall" TEXT,
    "ai_scores" JSONB NOT NULL DEFAULT '{}',
    "ai_confidence" DECIMAL(5,4),
    "ai_recommended_priority" BOOLEAN NOT NULL DEFAULT false,
    "ai_model" TEXT,
    "ai_generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origin" "ContextIssueOrigin",
    "category_key" TEXT,
    "category_label" TEXT,
    "title" TEXT,
    "description" TEXT,
    "nature" TEXT,
    "impact_quality" TEXT,
    "impact_customer_satisfaction" TEXT,
    "impact_overall" TEXT,
    "scores" JSONB,
    "user_selected_priority" BOOLEAN,
    "human_override" BOOLEAN NOT NULL DEFAULT false,
    "human_reviewed_by_id" TEXT,
    "human_reviewed_at" TIMESTAMP(3),
    "review_status" "ContextIssueReviewStatus" NOT NULL DEFAULT 'PENDING',
    "source_kind" "ContextIssueSourceKind" NOT NULL DEFAULT 'AI',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "context_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_issue_evidence" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "origin_kind" "ContextEvidenceOrigin" NOT NULL,
    "source_ref_table" TEXT,
    "source_ref_id" TEXT,
    "source_url" TEXT,
    "excerpt" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_issue_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_issue_corrections" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "previous_value" JSONB,
    "new_value" JSONB,
    "correction_reason" TEXT,
    "corrected_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_issue_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "context_internal_inputs_project_id_question_key_key" ON "context_internal_inputs"("project_id", "question_key");

-- CreateIndex
CREATE INDEX "context_external_research_runs_project_id_created_at_idx" ON "context_external_research_runs"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "context_external_factors_project_id_canonical_key_idx" ON "context_external_factors"("project_id", "canonical_key");

-- CreateIndex
CREATE UNIQUE INDEX "context_external_factors_run_id_factor_fingerprint_key" ON "context_external_factors"("run_id", "factor_fingerprint");

-- CreateIndex
CREATE INDEX "context_analysis_runs_project_id_created_at_idx" ON "context_analysis_runs"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "context_issues_project_id_canonical_key_idx" ON "context_issues"("project_id", "canonical_key");

-- CreateIndex
CREATE UNIQUE INDEX "context_issues_run_id_issue_fingerprint_key" ON "context_issues"("run_id", "issue_fingerprint");

-- RenameForeignKey
ALTER TABLE "regulatory_applicability_candidates" RENAME CONSTRAINT "regulatory_applicability_candidates_requirement_edited_by_id_fk" TO "regulatory_applicability_candidates_requirement_edited_by__fkey";

-- AddForeignKey
ALTER TABLE "project_context_settings" ADD CONSTRAINT "project_context_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_context_settings" ADD CONSTRAINT "project_context_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_internal_inputs" ADD CONSTRAINT "context_internal_inputs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_internal_inputs" ADD CONSTRAINT "context_internal_inputs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_internal_inputs" ADD CONSTRAINT "context_internal_inputs_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_external_research_runs" ADD CONSTRAINT "context_external_research_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_external_research_runs" ADD CONSTRAINT "context_external_research_runs_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_external_factors" ADD CONSTRAINT "context_external_factors_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "context_external_research_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_external_factors" ADD CONSTRAINT "context_external_factors_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_external_factors" ADD CONSTRAINT "context_external_factors_regulatory_entry_id_fkey" FOREIGN KEY ("regulatory_entry_id") REFERENCES "regulatory_register_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_external_factors" ADD CONSTRAINT "context_external_factors_previous_factor_id_fkey" FOREIGN KEY ("previous_factor_id") REFERENCES "context_external_factors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_external_factor_sources" ADD CONSTRAINT "context_external_factor_sources_factor_id_fkey" FOREIGN KEY ("factor_id") REFERENCES "context_external_factors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_analysis_runs" ADD CONSTRAINT "context_analysis_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_analysis_runs" ADD CONSTRAINT "context_analysis_runs_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_issues" ADD CONSTRAINT "context_issues_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "context_analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_issues" ADD CONSTRAINT "context_issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_issues" ADD CONSTRAINT "context_issues_previous_issue_id_fkey" FOREIGN KEY ("previous_issue_id") REFERENCES "context_issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_issues" ADD CONSTRAINT "context_issues_human_reviewed_by_id_fkey" FOREIGN KEY ("human_reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_issues" ADD CONSTRAINT "context_issues_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_issue_evidence" ADD CONSTRAINT "context_issue_evidence_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "context_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_issue_evidence" ADD CONSTRAINT "context_issue_evidence_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_issue_corrections" ADD CONSTRAINT "context_issue_corrections_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "context_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_issue_corrections" ADD CONSTRAINT "context_issue_corrections_corrected_by_id_fkey" FOREIGN KEY ("corrected_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ai_knowledge_embeddings_knowledge_example_id_embedding_profile_" RENAME TO "ai_knowledge_embeddings_knowledge_example_id_embedding_prof_key";

-- RenameIndex
ALTER INDEX "ai_knowledge_examples_source_organization_id_source_project_id_" RENAME TO "ai_knowledge_examples_source_organization_id_source_project_idx";

-- RenameIndex
ALTER INDEX "regulatory_analysis_reviews_organization_id_outcome_created_at_" RENAME TO "regulatory_analysis_reviews_organization_id_outcome_created_idx";
