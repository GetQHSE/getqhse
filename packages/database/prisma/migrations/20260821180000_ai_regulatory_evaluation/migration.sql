CREATE TYPE "RegulatoryAiEvaluationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

ALTER TABLE "regulatory_evaluations"
  ADD COLUMN "ai_status" "RegulatoryAiEvaluationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "ai_suggested_result" "AssessmentResult",
  ADD COLUMN "ai_rationale" TEXT,
  ADD COLUMN "ai_confidence" DECIMAL(5,4),
  ADD COLUMN "ai_matched_profile_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "ai_missing_information" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "ai_remediation_plan" TEXT,
  ADD COLUMN "ai_action_title" TEXT,
  ADD COLUMN "ai_action_resources" TEXT,
  ADD COLUMN "ai_action_start_date" DATE,
  ADD COLUMN "ai_action_due_date" DATE,
  ADD COLUMN "ai_responsible" TEXT,
  ADD COLUMN "ai_effectiveness_criteria" TEXT,
  ADD COLUMN "ai_model" TEXT,
  ADD COLUMN "ai_prompt_key" TEXT,
  ADD COLUMN "ai_prompt_version" INTEGER,
  ADD COLUMN "ai_evaluated_at" TIMESTAMP(3),
  ADD COLUMN "ai_error_message" TEXT;

-- Existing baselines have no corresponding evaluation job. Mark their pending
-- human assessments as retryable instead of making clients poll indefinitely.
UPDATE "regulatory_evaluations"
SET
  "ai_status" = 'FAILED',
  "ai_error_message" = 'Relancez l’évaluation IA pour analyser cette baseline existante.'
WHERE "result" = 'NOT_ASSESSED';

CREATE INDEX "regulatory_evaluations_ai_status_updated_at_idx"
  ON "regulatory_evaluations"("ai_status", "updated_at");
