-- Website runtime hardening: explicit public-data permission and case-insensitive member identity uniqueness.

ALTER TABLE "server_permissions"
  ADD COLUMN IF NOT EXISTS "canWebsiteData" boolean NOT NULL DEFAULT false;

-- Normalize existing empty identities before adding partial unique indexes.
UPDATE "website_members" SET "email"=NULL WHERE "email" IS NOT NULL AND btrim("email")='';
UPDATE "website_members" SET "minecraftUsername"=NULL WHERE "minecraftUsername" IS NOT NULL AND btrim("minecraftUsername")='';

-- Stop migration with a clear conflict if duplicate identities already exist; operators should merge duplicates first.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "website_members"
    WHERE "email" IS NOT NULL
    GROUP BY "websiteId", lower("email") HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'Duplicate website member e-mail addresses exist; merge them before applying 0012.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "website_members"
    WHERE "minecraftUsername" IS NOT NULL
    GROUP BY "websiteId", lower("minecraftUsername") HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'Duplicate website member Minecraft usernames exist; merge them before applying 0012.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "website_members_site_email_ci_unique"
  ON "website_members" ("websiteId", lower("email"))
  WHERE "email" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "website_members_site_minecraft_ci_unique"
  ON "website_members" ("websiteId", lower("minecraftUsername"))
  WHERE "minecraftUsername" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "server_permissions_website_data_idx"
  ON "server_permissions" ("userId", "serverId")
  WHERE "canWebsiteData"=true;