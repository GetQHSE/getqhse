-- CreateTable
CREATE TABLE "ro_states" (
    "project_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "branch_fingerprints" JSONB NOT NULL DEFAULT '{}',
    "validated_at" TIMESTAMP(3),
    "validated_by_id" TEXT,

    CONSTRAINT "ro_states_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "ro_runs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "branch" TEXT,
    "status" "ContextRunStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "output_snapshot" JSONB,
    "context_fingerprint" TEXT NOT NULL,
    "methodology_version" TEXT NOT NULL DEFAULT 'ro-v2',
    "model" TEXT,
    "triggered_by_id" TEXT NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "ro_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ro_items" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "canonical_key" TEXT NOT NULL,
    "source_id" TEXT,
    "source_snapshot" JSONB,
    "origin" TEXT NOT NULL DEFAULT 'ai',
    "ai_proposal" JSONB,
    "treatment_fingerprint" TEXT,
    "effective" JSONB NOT NULL,
    "review_status" "PipReviewStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ro_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ro_actions" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "canonical_key" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'ai',
    "ai_proposal" JSONB,
    "effective" JSONB NOT NULL,
    "review_status" "PipReviewStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ro_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ro_action_events" (
    "id" TEXT NOT NULL,
    "action_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ro_action_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ro_corrections" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "previous_value" JSONB NOT NULL,
    "new_value" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ro_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ro_runs_project_id_created_at_idx" ON "ro_runs"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "ro_items_project_id_source_id_idx" ON "ro_items"("project_id", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "ro_items_project_id_canonical_key_key" ON "ro_items"("project_id", "canonical_key");

-- CreateIndex
CREATE UNIQUE INDEX "ro_actions_item_id_canonical_key_key" ON "ro_actions"("item_id", "canonical_key");

-- CreateIndex
CREATE INDEX "ro_action_events_action_id_created_at_idx" ON "ro_action_events"("action_id", "created_at");

-- CreateIndex
CREATE INDEX "ro_corrections_project_id_entity_id_idx" ON "ro_corrections"("project_id", "entity_id");

-- AddForeignKey
ALTER TABLE "ro_states" ADD CONSTRAINT "ro_states_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ro_runs" ADD CONSTRAINT "ro_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ro_items" ADD CONSTRAINT "ro_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ro_actions" ADD CONSTRAINT "ro_actions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ro_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ro_action_events" ADD CONSTRAINT "ro_action_events_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "ro_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ro_corrections" ADD CONSTRAINT "ro_corrections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TRIGGER ro_item_ai_immutable BEFORE UPDATE ON ro_items FOR EACH ROW EXECUTE FUNCTION pip_preserve_ai_proposal();
CREATE TRIGGER ro_action_ai_immutable BEFORE UPDATE ON ro_actions FOR EACH ROW EXECUTE FUNCTION pip_preserve_ai_proposal();
CREATE TRIGGER ro_run_snapshot_immutable BEFORE UPDATE ON ro_runs FOR EACH ROW EXECUTE FUNCTION pip_preserve_run_snapshot();
CREATE UNIQUE INDEX ro_one_active_run_per_project ON ro_runs(project_id) WHERE status IN ('DRAFT','RUNNING');
ALTER TABLE ro_runs ADD CONSTRAINT ro_stage_valid CHECK (stage IN ('GENERATION','TREATMENT'));
ALTER TABLE ro_runs ADD CONSTRAINT ro_branch_valid CHECK ((stage='GENERATION' AND branch IN ('context_issue','pip_requirement')) OR (stage='TREATMENT' AND branch IS NULL));
ALTER TABLE ro_items ADD CONSTRAINT ro_origin_valid CHECK (origin IN ('ai','user'));
ALTER TABLE ro_actions ADD CONSTRAINT ro_action_origin_valid CHECK (origin IN ('ai','user'));
ALTER TABLE ro_action_events ADD CONSTRAINT ro_event_kind_valid CHECK (kind IN ('progress','effectiveness'));
CREATE FUNCTION ro_preserve_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'R&O audit and execution events are append-only'; END; $$;
CREATE TRIGGER ro_events_immutable BEFORE UPDATE ON ro_action_events FOR EACH ROW EXECUTE FUNCTION ro_preserve_event();
CREATE TRIGGER ro_audit_immutable BEFORE UPDATE ON ro_corrections FOR EACH ROW EXECUTE FUNCTION ro_preserve_event();
