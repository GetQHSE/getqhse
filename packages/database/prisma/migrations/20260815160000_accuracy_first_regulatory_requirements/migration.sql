CREATE TYPE "RegulatoryRequirementStatus" AS ENUM ('READY', 'SOURCE_REVIEW_REQUIRED', 'NOT_REQUIRED');
CREATE TYPE "RegulatoryRequirementSource" AS ENUM ('AI', 'HUMAN', 'CARRIED_FORWARD');

ALTER TABLE "regulatory_applicability_candidates"
  ADD COLUMN "requirement_text" TEXT,
  ADD COLUMN "requirement_status" "RegulatoryRequirementStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "requirement_supporting_excerpts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "requirement_issues" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "requirement_source" "RegulatoryRequirementSource",
  ADD COLUMN "requirement_edited_by_id" TEXT,
  ADD COLUMN "requirement_edited_at" TIMESTAMP(3);

ALTER TABLE "regulatory_register_entries"
  ADD COLUMN "requirement_text" TEXT,
  ADD COLUMN "requirement_source" "RegulatoryRequirementSource",
  ADD COLUMN "requirement_supporting_excerpts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "requirement_reviewed_by_id" TEXT,
  ADD COLUMN "requirement_reviewed_at" TIMESTAMP(3);

ALTER TABLE "regulatory_applicability_candidates"
  ADD CONSTRAINT "regulatory_applicability_candidates_requirement_edited_by_id_fkey"
  FOREIGN KEY ("requirement_edited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "regulatory_register_entries"
  ADD CONSTRAINT "regulatory_register_entries_requirement_reviewed_by_id_fkey"
  FOREIGN KEY ("requirement_reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
