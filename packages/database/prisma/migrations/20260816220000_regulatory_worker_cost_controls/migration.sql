ALTER TYPE "RegulatoryAnalysisStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';

CREATE TYPE "RegulatoryModelCallStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT');

UPDATE "regulatory_analysis_runs" SET "input_tokens" = 0 WHERE "input_tokens" IS NULL;
UPDATE "regulatory_analysis_runs" SET "output_tokens" = 0 WHERE "output_tokens" IS NULL;

ALTER TABLE "regulatory_analysis_runs"
  ALTER COLUMN "input_tokens" SET DEFAULT 0,
  ALTER COLUMN "input_tokens" SET NOT NULL,
  ALTER COLUMN "output_tokens" SET DEFAULT 0,
  ALTER COLUMN "output_tokens" SET NOT NULL,
  ADD COLUMN "reasoning_tokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "budget_micro_usd" INTEGER NOT NULL DEFAULT 1000000,
  ADD COLUMN "spent_micro_usd" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reserved_micro_usd" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "completed_provisions" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "total_provisions" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "regulatory_applicability_candidates"
  ADD COLUMN "classification_revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "clarification_question" TEXT;

CREATE TABLE "regulatory_model_calls" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "provision_id" TEXT NOT NULL,
  "clarification_revision" INTEGER NOT NULL DEFAULT 0,
  "stage" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "model" TEXT NOT NULL,
  "status" "RegulatoryModelCallStatus" NOT NULL DEFAULT 'RUNNING',
  "reserved_micro_usd" INTEGER NOT NULL,
  "cost_micro_usd" INTEGER,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "reasoning_tokens" INTEGER,
  "latency_ms" INTEGER,
  "error_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "regulatory_model_calls_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "regulatory_model_calls_run_id_created_at_idx"
  ON "regulatory_model_calls"("run_id", "created_at");

ALTER TABLE "regulatory_model_calls"
  ADD CONSTRAINT "regulatory_model_calls_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "regulatory_analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "regulatory_model_calls_provision_id_fkey"
  FOREIGN KEY ("provision_id") REFERENCES "document_provisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
