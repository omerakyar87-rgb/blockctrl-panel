-- Website authentication, member access and storage normalization
-- Idempotent: preserves existing members and sessions.

ALTER TABLE "website_members" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "website_members" ADD COLUMN IF NOT EXISTS "playerUuid" text;
ALTER TABLE "website_members" ADD COLUMN IF NOT EXISTS "serverId" uuid;
ALTER TABLE "website_members" ADD COLUMN IF NOT EXISTS "authSource" text NOT NULL DEFAULT 'email';
ALTER TABLE "website_members" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'member';
ALTER TABLE "website_members" ADD COLUMN IF NOT EXISTS "allowedPages" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "website_members" ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "website_members" ADD COLUMN IF NOT EXISTS "lastLoginAt" timestamp;

-- Normalize empty identities before indexing. Case-insensitive uniqueness is enforced in 0012
-- after an explicit duplicate check so legacy installations fail with a clear message.
UPDATE "website_members" SET "email"=NULL WHERE "email" IS NOT NULL AND btrim("email")='';
UPDATE "website_members" SET "minecraftUsername"=NULL WHERE "minecraftUsername" IS NOT NULL AND btrim("minecraftUsername")='';
DROP INDEX IF EXISTS "website_members_site_email_idx";
DROP INDEX IF EXISTS "website_members_site_mc_idx";
CREATE INDEX IF NOT EXISTS "website_members_site_email_idx" ON "website_members" ("websiteId",lower("email")) WHERE "email" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "website_members_site_mc_idx" ON "website_members" ("websiteId",lower("minecraftUsername")) WHERE "minecraftUsername" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "website_members_site_status_idx" ON "website_members" ("websiteId","status","authSource");

CREATE TABLE IF NOT EXISTS "website_auth_settings" (
  "websiteId" uuid PRIMARY KEY,
  "registrationMode" text NOT NULL DEFAULT 'website',
  "loginMode" text NOT NULL DEFAULT 'email',
  "serverId" uuid,
  "sessionDays" integer NOT NULL DEFAULT 30,
  "defaultRole" text NOT NULL DEFAULT 'member',
  "serverBridgeEnabled" boolean NOT NULL DEFAULT false,
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "website_member_sessions" ADD COLUMN IF NOT EXISTS "ipAddress" text;
ALTER TABLE "website_member_sessions" ADD COLUMN IF NOT EXISTS "userAgent" text;
ALTER TABLE "website_member_sessions" ADD COLUMN IF NOT EXISTS "lastSeenAt" timestamp NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS "website_member_sessions_expiry_idx" ON "website_member_sessions" ("websiteId","expiresAt");