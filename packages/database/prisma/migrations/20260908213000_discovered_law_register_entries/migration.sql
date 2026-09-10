CREATE TYPE "RegulatorySourceType" AS ENUM ('PLATFORM_PROVISION', 'DISCOVERED_LAW');

ALTER TABLE "regulatory_applicability_candidates"
  ALTER COLUMN "provision_id" DROP NOT NULL,
  ADD COLUMN "source_type" "RegulatorySourceType" NOT NULL DEFAULT 'PLATFORM_PROVISION',
  ADD COLUMN "source_reference" TEXT,
  ADD COLUMN "source_title" TEXT,
  ADD COLUMN "source_url" TEXT;

ALTER TABLE "regulatory_register_entries"
  ALTER COLUMN "provision_id" DROP NOT NULL,
  ADD COLUMN "source_type" "RegulatorySourceType" NOT NULL DEFAULT 'PLATFORM_PROVISION',
  ADD COLUMN "source_reference" TEXT,
  ADD COLUMN "source_title" TEXT,
  ADD COLUMN "source_url" TEXT;
