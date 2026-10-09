-- statement: server metrics
CREATE TABLE IF NOT EXISTS server_metrics (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, "userId" text NOT NULL, "serverId" uuid NOT NULL, "cpuPercent" real NOT NULL DEFAULT 0, "memoryUsedMb" integer NOT NULL DEFAULT 0, "memoryTotalMb" integer NOT NULL DEFAULT 0, "diskUsedGb" real NOT NULL DEFAULT 0, "diskTotalGb" real NOT NULL DEFAULT 0, tps real, mspt real, players integer NOT NULL DEFAULT 0, "uptimeSeconds" integer NOT NULL DEFAULT 0, "createdAt" timestamptz NOT NULL DEFAULT now());
-- statement: alert rules
CREATE TABLE IF NOT EXISTS alert_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" text NOT NULL, "serverId" uuid NOT NULL, metric text NOT NULL, operator text NOT NULL, threshold real NOT NULL, enabled boolean NOT NULL DEFAULT true, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
-- statement: notifications
CREATE TABLE IF NOT EXISTS notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" text NOT NULL, "serverId" uuid, type text NOT NULL, title text NOT NULL, body text NOT NULL, "readAt" timestamptz, "createdAt" timestamptz NOT NULL DEFAULT now());
-- statement: metrics index
CREATE INDEX IF NOT EXISTS server_metrics_server_created_idx ON server_metrics ("serverId", "createdAt" DESC);