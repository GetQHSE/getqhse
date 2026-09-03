-- Platform-wide LLM configuration moves from the process environment into a single editable row.
-- Every column is nullable and means "not overridden", so the table starts empty and the running
-- services keep resolving their values from the environment until an administrator saves one.
CREATE TABLE "llm_settings" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "rag_enabled" BOOLEAN,
  "profile_model" TEXT,
  "transcription_model" TEXT,
  "regulatory_model" TEXT,
  "regulatory_triage_model" TEXT,
  "regulatory_verification_model" TEXT,
  "regulatory_service_tier" TEXT,
  "regulatory_text_verbosity" TEXT,
  "regulatory_prompt_cache_retention" TEXT,
  "regulatory_reasoning_effort" TEXT,
  "regulatory_timeout_ms" INTEGER,
  "regulatory_draft_max_output_tokens" INTEGER,
  "regulatory_verification_max_output_tokens" INTEGER,
  "regulatory_triage_max_output_tokens" INTEGER,
  "regulatory_run_budget_usd" DECIMAL(10,4),
  "regulatory_evaluation_budget_usd" DECIMAL(10,4),
  "regulatory_input_usd_per_mtok" DECIMAL(12,6),
  "regulatory_cached_input_usd_per_mtok" DECIMAL(12,6),
  "regulatory_output_usd_per_mtok" DECIMAL(12,6),
  "regulatory_flex_rate_multiplier" DECIMAL(6,4),
  "conservative_bytes_per_token" DECIMAL(6,3),
  "triage_include_unsure" BOOLEAN,
  "api_key_ciphertext" TEXT,
  "api_key_preview" TEXT,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "llm_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "llm_settings"
  ADD CONSTRAINT "llm_settings_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
