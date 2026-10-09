CREATE TABLE IF NOT EXISTS "server_players" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" text NOT NULL,
  "serverId" uuid NOT NULL REFERENCES "servers"("id") ON DELETE CASCADE,
  "playerUuid" text,
  "playerName" text NOT NULL,
  "playerNameKey" text NOT NULL,
  "firstSeenAt" timestamp NOT NULL DEFAULT now(),
  "lastSeenAt" timestamp,
  "lastJoinAt" timestamp,
  "lastLeaveAt" timestamp,
  "sessionStartedAt" timestamp,
  "totalPlaySeconds" integer NOT NULL DEFAULT 0,
  "isOnline" boolean NOT NULL DEFAULT false,
  "isOp" boolean NOT NULL DEFAULT false,
  "whitelisted" boolean NOT NULL DEFAULT false,
  "banned" boolean NOT NULL DEFAULT false,
  "banReason" text,
  "banExpiresAt" timestamp,
  "lastSyncAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "server_players_server_name_key" UNIQUE ("serverId","playerNameKey")
);

CREATE INDEX IF NOT EXISTS "server_players_server_online_idx"
  ON "server_players" ("serverId","isOnline");

CREATE INDEX IF NOT EXISTS "server_players_server_last_seen_idx"
  ON "server_players" ("serverId","lastSeenAt" DESC);
