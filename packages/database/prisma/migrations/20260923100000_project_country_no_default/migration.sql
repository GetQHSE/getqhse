-- Projects choose their countries at creation: no implicit Morocco default.
ALTER TABLE "projects" ALTER COLUMN "country_code" DROP DEFAULT;
