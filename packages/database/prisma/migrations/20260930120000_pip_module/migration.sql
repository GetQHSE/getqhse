-- CreateEnum
CREATE TYPE "PipStage" AS ENUM ('INVENTORY', 'REQUIREMENTS', 'EVALUATION');

-- CreateEnum
CREATE TYPE "PipReviewStatus" AS ENUM ('PENDING', 'VALIDATED', 'MODIFIED', 'NOT_RETAINED');

-- CreateTable
CREATE TABLE "pip_states" (
    "project_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "evaluation_method" TEXT NOT NULL DEFAULT 'both',
    "inventory_fingerprint" TEXT,
    "validated_at" TIMESTAMP(3),
    "validated_by_id" TEXT,

    CONSTRAINT "pip_states_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "pip_runs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "stage" "PipStage" NOT NULL,
    "status" "ContextRunStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "output_snapshot" JSONB,
    "context_fingerprint" TEXT NOT NULL,
    "methodology_version" TEXT NOT NULL DEFAULT 'pip-v1',
    "model" TEXT,
    "triggered_by_id" TEXT NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "pip_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pip_parties" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "run_id" TEXT,
    "canonical_key" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'ai',
    "ai_proposal" JSONB,
    "effective" JSONB NOT NULL,
    "review_status" "PipReviewStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pip_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pip_requirements" (
    "id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "run_id" TEXT,
    "canonical_key" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'ai',
    "ai_proposal" JSONB,
    "effective" JSONB NOT NULL,
    "review_status" "PipReviewStatus" NOT NULL DEFAULT 'PENDING',
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allocation_reviewed" BOOLEAN NOT NULL DEFAULT false,
    "no_service_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pip_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pip_evaluations" (
    "id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "human_override" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ai_proposal" JSONB,
    "effective" JSONB NOT NULL,
    "review_status" "PipReviewStatus" NOT NULL DEFAULT 'PENDING',
    "methodology_version" TEXT NOT NULL DEFAULT 'pip-v1',
    "strategy_version" TEXT NOT NULL DEFAULT 'strategy-v1',

    CONSTRAINT "pip_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pip_clarifications" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "answer" TEXT,
    "answered_at" TIMESTAMP(3),
    "answered_by_id" TEXT,

    CONSTRAINT "pip_clarifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pip_corrections" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "previous_value" JSONB NOT NULL,
    "new_value" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pip_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pip_runs_project_id_created_at_idx" ON "pip_runs"("project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pip_parties_project_id_canonical_key_key" ON "pip_parties"("project_id", "canonical_key");

-- CreateIndex
CREATE UNIQUE INDEX "pip_requirements_party_id_canonical_key_key" ON "pip_requirements"("party_id", "canonical_key");

-- CreateIndex
CREATE UNIQUE INDEX "pip_evaluations_party_id_run_id_key" ON "pip_evaluations"("party_id", "run_id");

-- CreateIndex
CREATE UNIQUE INDEX "pip_clarifications_project_id_question_key" ON "pip_clarifications"("project_id", "question");

-- CreateIndex
CREATE INDEX "pip_corrections_project_id_entity_id_idx" ON "pip_corrections"("project_id", "entity_id");

-- AddForeignKey
ALTER TABLE "pip_states" ADD CONSTRAINT "pip_states_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_runs" ADD CONSTRAINT "pip_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_parties" ADD CONSTRAINT "pip_parties_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_parties" ADD CONSTRAINT "pip_parties_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "pip_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_requirements" ADD CONSTRAINT "pip_requirements_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "pip_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_requirements" ADD CONSTRAINT "pip_requirements_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "pip_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_evaluations" ADD CONSTRAINT "pip_evaluations_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "pip_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_clarifications" ADD CONSTRAINT "pip_clarifications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_clarifications" ADD CONSTRAINT "pip_clarifications_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "pip_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pip_corrections" ADD CONSTRAINT "pip_corrections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AI proposals and run inputs are immutable, even if a future write path is mistaken.
CREATE FUNCTION pip_preserve_ai_proposal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ai_proposal IS DISTINCT FROM OLD.ai_proposal THEN
    RAISE EXCEPTION 'PIP AI proposals are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pip_party_ai_immutable BEFORE UPDATE ON pip_parties FOR EACH ROW EXECUTE FUNCTION pip_preserve_ai_proposal();
CREATE TRIGGER pip_requirement_ai_immutable BEFORE UPDATE ON pip_requirements FOR EACH ROW EXECUTE FUNCTION pip_preserve_ai_proposal();
CREATE TRIGGER pip_evaluation_ai_immutable BEFORE UPDATE ON pip_evaluations FOR EACH ROW EXECUTE FUNCTION pip_preserve_ai_proposal();
CREATE FUNCTION pip_preserve_run_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.input_snapshot IS DISTINCT FROM OLD.input_snapshot OR
     (OLD.output_snapshot IS NOT NULL AND NEW.output_snapshot IS DISTINCT FROM OLD.output_snapshot) THEN
    RAISE EXCEPTION 'PIP run snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pip_run_snapshot_immutable BEFORE UPDATE ON pip_runs FOR EACH ROW EXECUTE FUNCTION pip_preserve_run_snapshot();
-- No two active runs for one project, including concurrent HTTP requests.
CREATE UNIQUE INDEX pip_one_active_run_per_project ON pip_runs(project_id) WHERE status IN ('DRAFT', 'RUNNING');
-- A reviewed empty allocation must be an explicit professional decision.
ALTER TABLE pip_requirements ADD CONSTRAINT pip_allocation_consistent CHECK (
  (NOT no_service_confirmed OR (allocation_reviewed AND cardinality(services) = 0)) AND
  (NOT allocation_reviewed OR no_service_confirmed OR cardinality(services) > 0)
);
ALTER TABLE pip_parties ADD CONSTRAINT pip_party_origin CHECK (origin IN ('ai', 'user'));
ALTER TABLE pip_requirements ADD CONSTRAINT pip_requirement_origin CHECK (origin IN ('ai', 'user'));
ALTER TABLE pip_states ADD CONSTRAINT pip_method_valid CHECK (evaluation_method IN ('power_interest', 'criticality', 'both'));
