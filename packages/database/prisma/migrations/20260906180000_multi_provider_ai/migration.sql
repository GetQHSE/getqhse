ALTER TABLE "llm_settings"
  ADD COLUMN "profile_provider" TEXT,
  ADD COLUMN "embedding_provider" TEXT,
  ADD COLUMN "embedding_model" TEXT,
  ADD COLUMN "regulatory_provider" TEXT,
  ADD COLUMN "regulatory_verification_provider" TEXT,
  ADD COLUMN "anthropic_effort" TEXT,
  ADD COLUMN "anthropic_speed" TEXT,
  ADD COLUMN "google_thinking_level" TEXT,
  ADD COLUMN "google_thinking_budget" INTEGER,
  ADD COLUMN "custom_models" JSONB,
  ADD COLUMN "anthropic_api_key_ciphertext" TEXT,
  ADD COLUMN "anthropic_api_key_preview" TEXT,
  ADD COLUMN "google_api_key_ciphertext" TEXT,
  ADD COLUMN "google_api_key_preview" TEXT;

ALTER TABLE "regulatory_analysis_runs" ADD COLUMN "provider" TEXT;
ALTER TABLE "regulatory_model_calls" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'openai';
ALTER TABLE "regulatory_evaluations" ADD COLUMN "ai_provider" TEXT;
ALTER TABLE "project_profile_messages" ADD COLUMN "provider" TEXT;
ALTER TABLE "ai_invocations" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'openai';

UPDATE "regulatory_analysis_runs" SET "provider" = 'openai' WHERE "model" IS NOT NULL;
UPDATE "regulatory_evaluations" SET "ai_provider" = 'openai' WHERE "ai_model" IS NOT NULL;
UPDATE "project_profile_messages" SET "provider" = 'openai' WHERE "model" IS NOT NULL;
