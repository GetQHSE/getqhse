-- CreateTable
CREATE TABLE "scope_states" (
    "project_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "declaration" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scope_states_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "scope_verifications" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "decision" JSONB NOT NULL,
    "author_id" TEXT NOT NULL,
    "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scope_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scope_statements" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER,
    "statement" TEXT NOT NULL,
    "non_applicable" JSONB NOT NULL,
    "ai_proposal" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "verification_id" TEXT NOT NULL,
    "source_snapshot" JSONB NOT NULL,
    "model" TEXT,
    "professionally_modified" BOOLEAN NOT NULL DEFAULT false,
    "generated_at" TIMESTAMP(3),
    "validated_at" TIMESTAMP(3),
    "validated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scope_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scope_runs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" "ContextRunStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "output_snapshot" JSONB,
    "model" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "scope_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scope_corrections" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "previous_value" JSONB NOT NULL,
    "new_value" JSONB NOT NULL,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scope_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scope_verifications_project_id_reviewed_at_idx" ON "scope_verifications"("project_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "scope_statements_project_id_status_idx" ON "scope_statements"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "scope_statements_project_id_version_key" ON "scope_statements"("project_id", "version");

-- CreateIndex
CREATE INDEX "scope_runs_project_id_created_at_idx" ON "scope_runs"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "scope_corrections_project_id_created_at_idx" ON "scope_corrections"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "scope_states" ADD CONSTRAINT "scope_states_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scope_verifications" ADD CONSTRAINT "scope_verifications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scope_statements" ADD CONSTRAINT "scope_statements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scope_runs" ADD CONSTRAINT "scope_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scope_corrections" ADD CONSTRAINT "scope_corrections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One active generation per project. AI and historical decision evidence are immutable.
CREATE UNIQUE INDEX scope_runs_one_active ON scope_runs(project_id) WHERE status IN ('DRAFT', 'RUNNING');
CREATE TRIGGER scope_ai_proposal_immutable BEFORE UPDATE ON scope_statements FOR EACH ROW EXECUTE FUNCTION pip_preserve_ai_proposal();
CREATE TRIGGER scope_run_snapshot_immutable BEFORE UPDATE ON scope_runs FOR EACH ROW EXECUTE FUNCTION pip_preserve_run_snapshot();
CREATE FUNCTION scope_preserve_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Scope professional decisions and audit events are immutable'; END; $$;
CREATE TRIGGER scope_verification_immutable BEFORE UPDATE ON scope_verifications FOR EACH ROW EXECUTE FUNCTION scope_preserve_audit();
CREATE TRIGGER scope_correction_immutable BEFORE UPDATE ON scope_corrections FOR EACH ROW EXECUTE FUNCTION scope_preserve_audit();
CREATE FUNCTION scope_preserve_validated_statement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'VALIDATED' THEN
    RAISE EXCEPTION 'Validated scope versions are immutable';
  END IF;
  IF NEW.status NOT IN ('DRAFT', 'VALIDATED') OR
     (NEW.status = 'VALIDATED' AND (NEW.version IS NULL OR NEW.validated_at IS NULL OR NEW.validated_by_id IS NULL)) THEN
    RAISE EXCEPTION 'Invalid scope statement status';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER scope_validated_immutable BEFORE UPDATE ON scope_statements FOR EACH ROW EXECUTE FUNCTION scope_preserve_validated_statement();
ALTER TABLE scope_statements ADD CONSTRAINT scope_statement_status CHECK (
  (status = 'DRAFT' AND version IS NULL AND validated_at IS NULL AND validated_by_id IS NULL) OR
  (status = 'VALIDATED' AND version > 0 AND validated_at IS NOT NULL AND validated_by_id IS NOT NULL)
);
