-- Better Auth core tables use snake_case columns while Prisma keeps camelCase fields.
ALTER TABLE "users" RENAME COLUMN "emailVerified" TO "email_verified";
ALTER TABLE "users" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "users" RENAME COLUMN "updatedAt" TO "updated_at";
ALTER TABLE "users"
  ADD COLUMN "first_name" TEXT,
  ADD COLUMN "last_name" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'fr-MA',
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Africa/Casablanca',
  ADD COLUMN "platform_role" TEXT NOT NULL DEFAULT 'user';

ALTER TABLE "sessions" RENAME COLUMN "expiresAt" TO "expires_at";
ALTER TABLE "sessions" RENAME COLUMN "ipAddress" TO "ip_address";
ALTER TABLE "sessions" RENAME COLUMN "userAgent" TO "user_agent";
ALTER TABLE "sessions" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "sessions" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "sessions" RENAME COLUMN "updatedAt" TO "updated_at";
ALTER TABLE "sessions" ADD COLUMN "active_organization_id" TEXT;

ALTER INDEX "sessions_userId_idx" RENAME TO "sessions_user_id_idx";
ALTER TABLE "sessions"
  RENAME CONSTRAINT "sessions_userId_fkey" TO "sessions_user_id_fkey";

ALTER TABLE "accounts" RENAME COLUMN "accountId" TO "account_id";
ALTER TABLE "accounts" RENAME COLUMN "providerId" TO "provider_id";
ALTER TABLE "accounts" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "accounts" RENAME COLUMN "accessToken" TO "access_token";
ALTER TABLE "accounts" RENAME COLUMN "refreshToken" TO "refresh_token";
ALTER TABLE "accounts" RENAME COLUMN "idToken" TO "id_token";
ALTER TABLE "accounts" RENAME COLUMN "accessTokenExpiresAt" TO "access_token_expires_at";
ALTER TABLE "accounts" RENAME COLUMN "refreshTokenExpiresAt" TO "refresh_token_expires_at";
ALTER TABLE "accounts" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "accounts" RENAME COLUMN "updatedAt" TO "updated_at";

ALTER INDEX "accounts_userId_idx" RENAME TO "accounts_user_id_idx";
ALTER INDEX "accounts_providerId_accountId_key" RENAME TO "accounts_provider_id_account_id_key";
ALTER TABLE "accounts"
  RENAME CONSTRAINT "accounts_userId_fkey" TO "accounts_user_id_fkey";

ALTER TABLE "verifications" RENAME COLUMN "expiresAt" TO "expires_at";
ALTER TABLE "verifications" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "verifications" RENAME COLUMN "updatedAt" TO "updated_at";

-- Organization plugin models: organization, member, invitation.
ALTER TABLE "organizations" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "organizations" DROP COLUMN "updatedAt";
ALTER TABLE "organizations"
  ADD COLUMN "logo" TEXT,
  ADD COLUMN "metadata" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "country_code" TEXT NOT NULL DEFAULT 'MA',
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'fr-MA',
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Africa/Casablanca';

ALTER TABLE "organization_memberships" RENAME TO "members";
ALTER TABLE "members" RENAME COLUMN "organizationId" TO "organization_id";
ALTER TABLE "members" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "members" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "members" DROP COLUMN "updatedAt";
ALTER TABLE "members"
  ALTER COLUMN "role" TYPE TEXT
  USING CASE
    WHEN "role"::TEXT = 'OWNER' THEN 'owner'
    WHEN "role"::TEXT = 'ADMIN' THEN 'admin'
    ELSE 'member'
  END;
ALTER TABLE "members"
  ALTER COLUMN "role" SET DEFAULT 'member',
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

ALTER INDEX "organization_memberships_userId_idx" RENAME TO "members_user_id_idx";
ALTER INDEX "organization_memberships_organizationId_userId_key"
  RENAME TO "members_organization_id_user_id_key";
ALTER TABLE "members"
  RENAME CONSTRAINT "organization_memberships_pkey" TO "members_pkey";
ALTER TABLE "members"
  RENAME CONSTRAINT "organization_memberships_organizationId_fkey"
  TO "members_organization_id_fkey";
ALTER TABLE "members"
  RENAME CONSTRAINT "organization_memberships_userId_fkey"
  TO "members_user_id_fkey";

CREATE TABLE "invitations" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "inviter_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "role" TEXT,
  "status" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invitations_email_idx" ON "invitations"("email");
CREATE INDEX "invitations_organization_id_idx" ON "invitations"("organization_id");
ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_inviter_id_fkey"
  FOREIGN KEY ("inviter_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

DROP TYPE "MembershipRole";

-- The accepted values are also validated by Better Auth; database checks prevent bypasses.
ALTER TABLE "users"
  ADD CONSTRAINT "users_status_check"
  CHECK ("status" IN ('active', 'suspended', 'deleted')),
  ADD CONSTRAINT "users_platform_role_check"
  CHECK ("platform_role" IN (
    'user',
    'super_admin',
    'platform_admin',
    'support',
    'content_manager'
  ));
ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_status_check"
  CHECK ("status" IN ('active', 'suspended', 'archived'));
ALTER TABLE "members"
  ADD CONSTRAINT "members_role_check"
  CHECK ("role" IN ('owner', 'admin', 'member')),
  ADD CONSTRAINT "members_status_check"
  CHECK ("status" IN ('active', 'suspended'));
