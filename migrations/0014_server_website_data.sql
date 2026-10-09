CREATE TABLE IF NOT EXISTS "server_website_data" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" text NOT NULL,
  "serverId" uuid NOT NULL REFERENCES "servers"("id") ON DELETE CASCADE,
  "source" text NOT NULL,
  "data" jsonb NOT NULL DEFAULT '{"items":[]}'::jsonb,
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  UNIQUE ("serverId", "source")
);
CREATE INDEX IF NOT EXISTS "server_website_data_updated_idx" ON "server_website_data" ("serverId", "updatedAt" DESC);