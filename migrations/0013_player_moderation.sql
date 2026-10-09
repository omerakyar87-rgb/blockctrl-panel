CREATE TABLE IF NOT EXISTS "player_moderation_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "serverId" uuid NOT NULL REFERENCES "servers"("id") ON DELETE CASCADE,
  "playerName" text NOT NULL,
  "note" text NOT NULL,
  "authorUserId" text NOT NULL,
  "authorName" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "player_moderation_notes_server_player_idx"
  ON "player_moderation_notes" ("serverId", lower("playerName"), "createdAt" DESC);