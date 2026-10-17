CREATE TYPE "AiPromptSource" AS ENUM ('CODE', 'DATABASE');

CREATE TABLE "ai_prompt_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "source" "AiPromptSource" NOT NULL DEFAULT 'DATABASE',
    "generation" INTEGER NOT NULL DEFAULT 0,
    "updated_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_prompt_settings_pkey" PRIMARY KEY ("id")
);
