-- Prompt-cache reads are billed at a tenth of the fresh input rate. They arrive inside the
-- provider's input token count, so the ledger records them separately to price them correctly
-- instead of charging the whole prompt at the fresh rate.
ALTER TABLE "regulatory_analysis_runs"
  ADD COLUMN "cached_input_tokens" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "regulatory_model_calls"
  ADD COLUMN "cached_input_tokens" INTEGER;
