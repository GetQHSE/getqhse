-- Multi-country veille: each discovered text keeps the country it belongs to
-- (null for ISO / international texts). Existing rows were Morocco-only.
ALTER TABLE "regulatory_applicability_candidates" ADD COLUMN "source_country_code" TEXT;
ALTER TABLE "regulatory_register_entries" ADD COLUMN "source_country_code" TEXT;

UPDATE "regulatory_applicability_candidates"
SET "source_country_code" = 'MA'
WHERE "source_type" = 'DISCOVERED_LAW' AND coalesce("source_reference", '') !~* '^\s*iso\M';

UPDATE "regulatory_register_entries"
SET "source_country_code" = 'MA'
WHERE "source_type" = 'DISCOVERED_LAW' AND coalesce("source_reference", '') !~* '^\s*iso\M';
