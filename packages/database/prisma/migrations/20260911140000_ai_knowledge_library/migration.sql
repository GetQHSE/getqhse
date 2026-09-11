CREATE TYPE "AiKnowledgeFeature" AS ENUM ('DISCOVERY', 'CONFORMITY_EVALUATION');
CREATE TYPE "AiKnowledgeStatus" AS ENUM ('DRAFT', 'ACTIVE');
CREATE TYPE "AiKnowledgeSource" AS ENUM ('CUSTOMER_REVIEW', 'HUMAN_CONFIRMATION', 'ADMIN');
CREATE TYPE "AiKnowledgeEmbeddingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "AiKnowledgeEvaluationSignal" AS ENUM ('CORRECTION', 'COMMENT');

CREATE TABLE "ai_knowledge_examples" (
  "id" TEXT NOT NULL,
  "feature" "AiKnowledgeFeature" NOT NULL,
  "status" "AiKnowledgeStatus" NOT NULL DEFAULT 'DRAFT',
  "source" "AiKnowledgeSource" NOT NULL DEFAULT 'ADMIN',
  "title" TEXT NOT NULL,
  "scenario_summary" TEXT NOT NULL,
  "guidance" TEXT,
  "jurisdiction" TEXT NOT NULL DEFAULT 'MA',
  "language" TEXT NOT NULL DEFAULT 'fr',
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "payload" JSONB NOT NULL,
  "rating" INTEGER,
  "expected_result" "AssessmentResult",
  "evaluation_signal" "AiKnowledgeEvaluationSignal",
  "source_organization_id" TEXT,
  "source_project_id" TEXT,
  "source_analysis_review_id" TEXT,
  "source_regulatory_evaluation_id" TEXT,
  "embedding_status" "AiKnowledgeEmbeddingStatus" NOT NULL DEFAULT 'PENDING',
  "embedding_error" TEXT,
  "created_by_user_id" TEXT,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_knowledge_examples_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_knowledge_embeddings" (
  "id" TEXT NOT NULL,
  "knowledge_example_id" TEXT NOT NULL,
  "embedding_profile_id" TEXT NOT NULL,
  "input_hash" TEXT NOT NULL,
  "embedding" vector(768) NOT NULL,
  "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_knowledge_embeddings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_knowledge_activity" (
  "id" TEXT NOT NULL,
  "example_id" TEXT,
  "feature" "AiKnowledgeFeature" NOT NULL,
  "action" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_knowledge_activity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_knowledge_examples_source_analysis_review_id_key" ON "ai_knowledge_examples"("source_analysis_review_id");
CREATE UNIQUE INDEX "ai_knowledge_examples_source_regulatory_evaluation_id_key" ON "ai_knowledge_examples"("source_regulatory_evaluation_id");
CREATE INDEX "ai_knowledge_examples_feature_status_updated_at_idx" ON "ai_knowledge_examples"("feature", "status", "updated_at");
CREATE INDEX "ai_knowledge_examples_feature_embedding_status_idx" ON "ai_knowledge_examples"("feature", "embedding_status");
CREATE INDEX "ai_knowledge_examples_source_organization_id_source_project_id_idx" ON "ai_knowledge_examples"("source_organization_id", "source_project_id");
CREATE INDEX "ai_knowledge_examples_jurisdiction_language_idx" ON "ai_knowledge_examples"("jurisdiction", "language");
CREATE UNIQUE INDEX "ai_knowledge_embeddings_knowledge_example_id_embedding_profile_id_key" ON "ai_knowledge_embeddings"("knowledge_example_id", "embedding_profile_id");
CREATE INDEX "ai_knowledge_embeddings_embedding_profile_id_idx" ON "ai_knowledge_embeddings"("embedding_profile_id");
CREATE INDEX "ai_knowledge_activity_example_id_created_at_idx" ON "ai_knowledge_activity"("example_id", "created_at");
CREATE INDEX "ai_knowledge_activity_feature_created_at_idx" ON "ai_knowledge_activity"("feature", "created_at");

ALTER TABLE "ai_knowledge_examples" ADD CONSTRAINT "ai_knowledge_examples_source_organization_id_fkey" FOREIGN KEY ("source_organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_knowledge_examples" ADD CONSTRAINT "ai_knowledge_examples_source_project_id_fkey" FOREIGN KEY ("source_project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_knowledge_examples" ADD CONSTRAINT "ai_knowledge_examples_source_analysis_review_id_fkey" FOREIGN KEY ("source_analysis_review_id") REFERENCES "regulatory_analysis_reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_knowledge_examples" ADD CONSTRAINT "ai_knowledge_examples_source_regulatory_evaluation_id_fkey" FOREIGN KEY ("source_regulatory_evaluation_id") REFERENCES "regulatory_evaluations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_knowledge_examples" ADD CONSTRAINT "ai_knowledge_examples_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_knowledge_examples" ADD CONSTRAINT "ai_knowledge_examples_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_knowledge_embeddings" ADD CONSTRAINT "ai_knowledge_embeddings_knowledge_example_id_fkey" FOREIGN KEY ("knowledge_example_id") REFERENCES "ai_knowledge_examples"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_knowledge_embeddings" ADD CONSTRAINT "ai_knowledge_embeddings_embedding_profile_id_fkey" FOREIGN KEY ("embedding_profile_id") REFERENCES "embedding_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_knowledge_activity" ADD CONSTRAINT "ai_knowledge_activity_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
