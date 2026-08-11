-- Extend the existing watch without replacing any published data.
ALTER TYPE "RegulatoryAnalysisStatus" ADD VALUE IF NOT EXISTS 'SUPERSEDED';

CREATE TYPE "RegulatoryChangeType" AS ENUM ('ADDED', 'UNCHANGED', 'MODIFIED', 'REMOVAL_PROPOSED');
CREATE TYPE "RegulatoryDecisionSource" AS ENUM ('SYSTEM', 'HUMAN');
CREATE TYPE "RegulatoryRunTrigger" AS ENUM ('MANUAL', 'DOCUMENT_REVISION');
CREATE TYPE "RegulatorySyncEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "project_regulatory_watches"
  ADD COLUMN "last_checked_at" TIMESTAMP(3),
  ADD COLUMN "last_successful_sync_at" TIMESTAMP(3);

ALTER TABLE "regulatory_analysis_runs"
  ADD COLUMN "base_baseline_id" TEXT,
  ADD COLUMN "trigger_type" "RegulatoryRunTrigger" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "trigger_key" TEXT,
  ADD COLUMN "trigger_document_version_id" TEXT,
  ADD COLUMN "superseded_at" TIMESTAMP(3);

UPDATE "regulatory_analysis_runs" SET "trigger_key" = "id" WHERE "trigger_key" IS NULL;
ALTER TABLE "regulatory_analysis_runs" ALTER COLUMN "trigger_key" SET NOT NULL;

ALTER TABLE "regulatory_applicability_candidates"
  ADD COLUMN "previous_entry_id" TEXT,
  ADD COLUMN "change_type" "RegulatoryChangeType" NOT NULL DEFAULT 'ADDED',
  ADD COLUMN "change_summary" TEXT,
  ADD COLUMN "requires_review" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "decision_source" "RegulatoryDecisionSource";

-- Existing decisions were necessarily made by a reviewer in the former workflow.
UPDATE "regulatory_applicability_candidates"
SET "decision_source" = 'HUMAN'
WHERE "decision" IS NOT NULL;

ALTER TABLE "regulatory_baselines" ADD COLUMN "previous_baseline_id" TEXT;

ALTER TABLE "regulatory_register_entries"
  ADD COLUMN "previous_entry_id" TEXT,
  ADD COLUMN "change_type" "RegulatoryChangeType" NOT NULL DEFAULT 'ADDED';

ALTER TABLE "regulatory_evaluations"
  ADD COLUMN "previous_evaluation_id" TEXT,
  ADD COLUMN "requires_reevaluation" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "regulatory_evaluation_evidence" ADD COLUMN "carried_from_evidence_id" TEXT;
ALTER TABLE "regulatory_evaluation_actions" ADD COLUMN "carried_from_action_id" TEXT;

CREATE TABLE "regulatory_sync_events" (
  "id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "previous_version_id" TEXT NOT NULL,
  "published_version_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "status" "RegulatorySyncEventStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "affected_watch_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "regulatory_sync_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "regulatory_analysis_runs_watch_id_trigger_key_key"
  ON "regulatory_analysis_runs"("watch_id", "trigger_key");
CREATE UNIQUE INDEX "regulatory_sync_events_published_version_id_key"
  ON "regulatory_sync_events"("published_version_id");
CREATE INDEX "regulatory_sync_events_status_created_at_idx"
  ON "regulatory_sync_events"("status", "created_at");

ALTER TABLE "regulatory_analysis_runs"
  ADD CONSTRAINT "regulatory_analysis_runs_base_baseline_id_fkey"
  FOREIGN KEY ("base_baseline_id") REFERENCES "regulatory_baselines"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "regulatory_analysis_runs_trigger_document_version_id_fkey"
  FOREIGN KEY ("trigger_document_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "regulatory_applicability_candidates"
  ADD CONSTRAINT "regulatory_applicability_candidates_previous_entry_id_fkey"
  FOREIGN KEY ("previous_entry_id") REFERENCES "regulatory_register_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "regulatory_baselines"
  ADD CONSTRAINT "regulatory_baselines_previous_baseline_id_fkey"
  FOREIGN KEY ("previous_baseline_id") REFERENCES "regulatory_baselines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "regulatory_register_entries"
  ADD CONSTRAINT "regulatory_register_entries_previous_entry_id_fkey"
  FOREIGN KEY ("previous_entry_id") REFERENCES "regulatory_register_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "regulatory_evaluations"
  ADD CONSTRAINT "regulatory_evaluations_previous_evaluation_id_fkey"
  FOREIGN KEY ("previous_evaluation_id") REFERENCES "regulatory_evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "regulatory_evaluation_evidence"
  ADD CONSTRAINT "regulatory_evaluation_evidence_carried_from_evidence_id_fkey"
  FOREIGN KEY ("carried_from_evidence_id") REFERENCES "regulatory_evaluation_evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "regulatory_evaluation_actions"
  ADD CONSTRAINT "regulatory_evaluation_actions_carried_from_action_id_fkey"
  FOREIGN KEY ("carried_from_action_id") REFERENCES "regulatory_evaluation_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "regulatory_sync_events"
  ADD CONSTRAINT "regulatory_sync_events_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "regulatory_sync_events_previous_version_id_fkey"
  FOREIGN KEY ("previous_version_id") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "regulatory_sync_events_published_version_id_fkey"
  FOREIGN KEY ("published_version_id") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "regulatory_sync_events_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
