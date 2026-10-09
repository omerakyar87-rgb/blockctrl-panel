CREATE TABLE IF NOT EXISTS "website_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "websiteId" uuid NOT NULL,
  "email" text NOT NULL,
  "name" text NOT NULL,
  "passwordHash" text NOT NULL,
  "minecraftUsername" text,
  "status" text NOT NULL DEFAULT 'active',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
-- Legacy installations can contain duplicate identities. Keep lookup indexes non-unique here;
-- 0012 normalizes identities, performs explicit duplicate checks and then enforces uniqueness.
CREATE INDEX IF NOT EXISTS "website_members_site_email_idx" ON "website_members" ("websiteId",lower("email"));

CREATE TABLE IF NOT EXISTS "website_member_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "websiteId" uuid NOT NULL,
  "memberId" uuid NOT NULL,
  "tokenHash" text NOT NULL UNIQUE,
  "expiresAt" timestamp NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "website_member_sessions_member_idx" ON "website_member_sessions" ("websiteId","memberId","expiresAt");

CREATE TABLE IF NOT EXISTS "website_form_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "websiteId" uuid NOT NULL,
  "memberId" uuid,
  "formType" text NOT NULL DEFAULT 'contact',
  "pageSlug" text NOT NULL DEFAULT '',
  "senderName" text,
  "senderEmail" text,
  "subject" text,
  "message" text NOT NULL DEFAULT '',
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'new',
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "website_form_submissions_site_idx" ON "website_form_submissions" ("websiteId","createdAt" DESC);
