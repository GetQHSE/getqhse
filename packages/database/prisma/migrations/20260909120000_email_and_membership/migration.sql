CREATE TYPE "EmailType" AS ENUM (
  'ORGANIZATION_INVITATION',
  'REGULATORY_CLARIFICATION_REQUIRED',
  'REGULATORY_REVIEW_READY',
  'REGULATORY_IMPACT',
  'REGULATORY_ANALYSIS_FAILED',
  'REGULATORY_ACTION_DUE_SOON',
  'REGULATORY_ACTION_OVERDUE'
);

CREATE TYPE "EmailDeliveryStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'SENT',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "email_settings" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "brevo_api_key_ciphertext" TEXT,
  "brevo_api_key_preview" TEXT,
  "organization_invitation_template_id" INTEGER,
  "regulatory_clarification_required_template_id" INTEGER,
  "regulatory_review_ready_template_id" INTEGER,
  "regulatory_impact_template_id" INTEGER,
  "regulatory_analysis_failed_template_id" INTEGER,
  "regulatory_action_due_soon_template_id" INTEGER,
  "regulatory_action_overdue_template_id" INTEGER,
  "template_metadata" JSONB,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_deliveries" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "invitation_id" TEXT,
  "recipient_user_id" TEXT,
  "type" "EmailType" NOT NULL,
  "event_key" TEXT NOT NULL,
  "recipient_email" TEXT NOT NULL,
  "recipient_name" TEXT,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "template_id" INTEGER NOT NULL,
  "parameters" JSONB NOT NULL,
  "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "brevo_message_id" TEXT,
  "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_error" TEXT,
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_deliveries_event_key_type_recipient_email_key"
  ON "email_deliveries"("event_key", "type", "recipient_email");
CREATE INDEX "email_deliveries_status_next_attempt_at_idx"
  ON "email_deliveries"("status", "next_attempt_at");
CREATE INDEX "email_deliveries_organization_id_created_at_idx"
  ON "email_deliveries"("organization_id", "created_at");
CREATE INDEX "email_deliveries_invitation_id_created_at_idx"
  ON "email_deliveries"("invitation_id", "created_at");

ALTER TABLE "email_settings"
  ADD CONSTRAINT "email_settings_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_deliveries"
  ADD CONSTRAINT "email_deliveries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_deliveries"
  ADD CONSTRAINT "email_deliveries_invitation_id_fkey"
  FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_deliveries"
  ADD CONSTRAINT "email_deliveries_recipient_user_id_fkey"
  FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
