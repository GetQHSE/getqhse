ALTER TABLE "regulatory_analysis_runs" ADD COLUMN "missing_laws" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "regulatory_model_calls" ALTER COLUMN "provision_id" DROP NOT NULL;
