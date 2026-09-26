-- "Analyse des enjeux" follows the demo template's three tabs:
-- tab 1 deduces internal issues (INTERNAL runs), tab 2 runs SWOT and/or PESTEL,
-- tab 3 is the synthesis (SYNTHESIS runs), validated once to unlock the exports.

-- CreateEnum
CREATE TYPE "ContextAnalysisRunKind" AS ENUM ('INTERNAL', 'SYNTHESIS');

-- Analysis methods become a set; an explicit earlier choice is kept as-is.
ALTER TABLE "project_context_settings"
  ADD COLUMN "analysis_methods" "ContextAnalysisMethod"[] NOT NULL DEFAULT ARRAY['SWOT', 'PESTEL']::"ContextAnalysisMethod"[];
UPDATE "project_context_settings" SET "analysis_methods" = ARRAY["analysis_method"];
ALTER TABLE "project_context_settings" DROP COLUMN "analysis_method";

-- Existing runs are syntheses.
ALTER TABLE "context_analysis_runs"
  ADD COLUMN "kind" "ContextAnalysisRunKind" NOT NULL DEFAULT 'SYNTHESIS',
  ADD COLUMN "validated_at" TIMESTAMP(3),
  ADD COLUMN "validated_by_id" TEXT;

-- CreateIndex
CREATE INDEX "context_analysis_runs_project_id_kind_created_at_idx" ON "context_analysis_runs"("project_id", "kind", "created_at");

-- AddForeignKey
ALTER TABLE "context_analysis_runs" ADD CONSTRAINT "context_analysis_runs_validated_by_id_fkey" FOREIGN KEY ("validated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
