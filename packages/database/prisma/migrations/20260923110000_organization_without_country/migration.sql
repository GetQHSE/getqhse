-- Countries belong to projects (1 to 5 each), not to organizations.
ALTER TABLE "organizations" DROP COLUMN "country_code";
