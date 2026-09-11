CREATE TYPE "RegulatoryAnalysisReviewOutcome" AS ENUM ('SUBMITTED', 'SKIPPED');

CREATE TABLE "regulatory_analysis_reviews" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "reviewed_by_id" TEXT NOT NULL,
  "outcome" "RegulatoryAnalysisReviewOutcome" NOT NULL,
  "rating" INTEGER,
  "comment" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "regulatory_analysis_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "regulatory_analysis_reviews_rating_check" CHECK (
    ("outcome" = 'SUBMITTED' AND "rating" BETWEEN 0 AND 5)
    OR ("outcome" = 'SKIPPED' AND "rating" IS NULL AND "comment" IS NULL)
  )
);

CREATE UNIQUE INDEX "regulatory_analysis_reviews_run_id_key"
  ON "regulatory_analysis_reviews"("run_id");
CREATE INDEX "regulatory_analysis_reviews_organization_id_outcome_created_at_idx"
  ON "regulatory_analysis_reviews"("organization_id", "outcome", "created_at");
CREATE INDEX "regulatory_analysis_reviews_outcome_created_at_idx"
  ON "regulatory_analysis_reviews"("outcome", "created_at");

ALTER TABLE "regulatory_analysis_reviews"
  ADD CONSTRAINT "regulatory_analysis_reviews_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "regulatory_analysis_runs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "regulatory_analysis_reviews"
  ADD CONSTRAINT "regulatory_analysis_reviews_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "regulatory_analysis_reviews"
  ADD CONSTRAINT "regulatory_analysis_reviews_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
