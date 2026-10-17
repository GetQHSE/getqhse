-- AlterTable
ALTER TABLE "project_profile_messages" ADD COLUMN     "prompt_hash" TEXT,
ADD COLUMN     "prompt_revision_id" TEXT;

-- AlterTable
ALTER TABLE "ai_invocations" ADD COLUMN     "prompt_hash" TEXT,
ADD COLUMN     "prompt_revision_id" TEXT;

-- CreateTable
CREATE TABLE "ai_prompts" (
    "key" TEXT NOT NULL,
    "active_revision_id" TEXT,
    "generation" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_prompts_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ai_prompt_revisions" (
    "id" TEXT NOT NULL,
    "prompt_key" TEXT NOT NULL,
    "base_version" INTEGER NOT NULL,
    "template" TEXT NOT NULL,
    "template_hash" TEXT NOT NULL,
    "change_note" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_by_id" TEXT,
    "validated_at" TIMESTAMP(3),
    "validation_note" TEXT,

    CONSTRAINT "ai_prompt_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_prompt_tests" (
    "id" TEXT NOT NULL,
    "revision_id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_prompt_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_prompt_publications" (
    "id" TEXT NOT NULL,
    "prompt_key" TEXT NOT NULL,
    "revision_id" TEXT,
    "previous_revision_id" TEXT,
    "action" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_prompt_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_prompt_run_snapshots" (
    "run_key" TEXT NOT NULL,
    "policy_version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "used_prompts" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_prompt_run_snapshots_pkey" PRIMARY KEY ("run_key")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_prompts_active_revision_id_key" ON "ai_prompts"("active_revision_id");

-- CreateIndex
CREATE INDEX "ai_prompt_revisions_prompt_key_created_at_idx" ON "ai_prompt_revisions"("prompt_key", "created_at");

-- CreateIndex
CREATE INDEX "ai_prompt_tests_revision_id_created_at_idx" ON "ai_prompt_tests"("revision_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_prompt_publications_prompt_key_created_at_idx" ON "ai_prompt_publications"("prompt_key", "created_at");

-- AddForeignKey
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_active_revision_id_fkey" FOREIGN KEY ("active_revision_id") REFERENCES "ai_prompt_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_prompt_revisions" ADD CONSTRAINT "ai_prompt_revisions_prompt_key_fkey" FOREIGN KEY ("prompt_key") REFERENCES "ai_prompts"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_prompt_tests" ADD CONSTRAINT "ai_prompt_tests_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "ai_prompt_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_prompt_publications" ADD CONSTRAINT "ai_prompt_publications_prompt_key_fkey" FOREIGN KEY ("prompt_key") REFERENCES "ai_prompts"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
