-- Output language of a project's AI generations and deliverables; fixed at creation.
ALTER TABLE "projects" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'fr';
ALTER TABLE "projects" ADD CONSTRAINT "projects_language_check" CHECK ("language" IN ('fr', 'en', 'ar'));
