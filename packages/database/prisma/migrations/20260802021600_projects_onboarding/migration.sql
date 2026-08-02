CREATE TYPE "ProjectEntityType" AS ENUM (
  'COMPANY',
  'SCHOOL',
  'UNIVERSITY',
  'INSTITUTION',
  'ASSOCIATION',
  'PUBLIC_ADMINISTRATION',
  'INDUSTRIAL_SITE',
  'OTHER'
);

CREATE TYPE "ProjectStatus" AS ENUM (
  'EMPTY',
  'PROFILE_IN_PROGRESS',
  'PROFILE_REVIEW',
  'READY_FOR_ANALYSIS',
  'ANALYSIS_IN_PROGRESS',
  'REVIEW_REQUIRED',
  'COMPLETED',
  'ARCHIVED'
);

ALTER TABLE "organizations"
  ADD COLUMN "icon" TEXT;

CREATE TABLE "projects" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "logo_url" TEXT,
  "entity_type" "ProjectEntityType" NOT NULL,
  "country_code" TEXT NOT NULL DEFAULT 'MA',
  "standard_code" TEXT NOT NULL DEFAULT 'ISO_9001',
  "description" TEXT,
  "status" "ProjectStatus" NOT NULL DEFAULT 'EMPTY',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "archived_at" TIMESTAMP(3),
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_activities" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_activities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "projects_organization_id_slug_key"
  ON "projects"("organization_id", "slug");
CREATE INDEX "projects_organization_id_idx" ON "projects"("organization_id");
CREATE INDEX "projects_created_by_id_idx" ON "projects"("created_by_id");
CREATE INDEX "projects_status_idx" ON "projects"("status");
CREATE UNIQUE INDEX "project_activities_project_id_normalized_name_key"
  ON "project_activities"("project_id", "normalized_name");
CREATE INDEX "project_activities_project_id_idx" ON "project_activities"("project_id");

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_activities"
  ADD CONSTRAINT "project_activities_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
