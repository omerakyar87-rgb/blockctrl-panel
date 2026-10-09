-- Website runtime referential integrity and distributed auth rate limits.
-- Safe cleanup is performed before foreign keys are enforced.

DELETE FROM "website_member_sessions" s
WHERE NOT EXISTS (SELECT 1 FROM "websites" w WHERE w."id"=s."websiteId")
   OR NOT EXISTS (SELECT 1 FROM "website_members" m WHERE m."id"=s."memberId" AND m."websiteId"=s."websiteId");

DELETE FROM "website_form_submissions" f
WHERE NOT EXISTS (SELECT 1 FROM "websites" w WHERE w."id"=f."websiteId");

UPDATE "website_form_submissions" f SET "memberId"=NULL
WHERE f."memberId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "website_members" m WHERE m."id"=f."memberId" AND m."websiteId"=f."websiteId");

DELETE FROM "website_members" m
WHERE NOT EXISTS (SELECT 1 FROM "websites" w WHERE w."id"=m."websiteId");

DELETE FROM "website_auth_settings" a
WHERE NOT EXISTS (SELECT 1 FROM "websites" w WHERE w."id"=a."websiteId");

CREATE TABLE IF NOT EXISTS "website_auth_rate_limits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "websiteId" uuid NOT NULL,
  "bucket" text NOT NULL,
  "keyHash" text NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "windowStart" timestamp NOT NULL DEFAULT now(),
  "expiresAt" timestamp NOT NULL,
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "website_auth_rate_limits_site_bucket_key_unique" UNIQUE ("websiteId","bucket","keyHash")
);
CREATE INDEX IF NOT EXISTS "website_auth_rate_limits_expiry_idx" ON "website_auth_rate_limits" ("expiresAt");

ALTER TABLE "website_auth_settings" DROP CONSTRAINT IF EXISTS "website_auth_settings_websiteId_websites_id_fk";
ALTER TABLE "website_auth_settings" ADD CONSTRAINT "website_auth_settings_websiteId_websites_id_fk" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE;

ALTER TABLE "website_members" DROP CONSTRAINT IF EXISTS "website_members_websiteId_websites_id_fk";
ALTER TABLE "website_members" ADD CONSTRAINT "website_members_websiteId_websites_id_fk" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE;

ALTER TABLE "website_member_sessions" DROP CONSTRAINT IF EXISTS "website_member_sessions_websiteId_websites_id_fk";
ALTER TABLE "website_member_sessions" ADD CONSTRAINT "website_member_sessions_websiteId_websites_id_fk" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE;
ALTER TABLE "website_member_sessions" DROP CONSTRAINT IF EXISTS "website_member_sessions_memberId_website_members_id_fk";
ALTER TABLE "website_member_sessions" ADD CONSTRAINT "website_member_sessions_memberId_website_members_id_fk" FOREIGN KEY ("memberId") REFERENCES "website_members"("id") ON DELETE CASCADE;

ALTER TABLE "website_form_submissions" DROP CONSTRAINT IF EXISTS "website_form_submissions_websiteId_websites_id_fk";
ALTER TABLE "website_form_submissions" ADD CONSTRAINT "website_form_submissions_websiteId_websites_id_fk" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE;
ALTER TABLE "website_form_submissions" DROP CONSTRAINT IF EXISTS "website_form_submissions_memberId_website_members_id_fk";
ALTER TABLE "website_form_submissions" ADD CONSTRAINT "website_form_submissions_memberId_website_members_id_fk" FOREIGN KEY ("memberId") REFERENCES "website_members"("id") ON DELETE SET NULL;

ALTER TABLE "website_auth_rate_limits" DROP CONSTRAINT IF EXISTS "website_auth_rate_limits_websiteId_websites_id_fk";
ALTER TABLE "website_auth_rate_limits" ADD CONSTRAINT "website_auth_rate_limits_websiteId_websites_id_fk" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE;
