-- Üye rolündeki kullanıcıların kendi oluşturduğu sunucularda sahiplik erişimini kalıcılaştırır.
-- Legacy runtime-DDL kurulumlarında unique constraint bulunmasa da güvenle çalışır.

ALTER TABLE "server_permissions" ADD COLUMN IF NOT EXISTS "ownerUserId" text;

UPDATE "server_permissions" p
SET
  "ownerUserId" = s."userId",
  "canStart" = true,
  "canStop" = true,
  "canRestart" = true,
  "canConsole" = true,
  "canFiles" = true,
  "canBackup" = true,
  "canReset" = true,
  "canViewLostItems" = true,
  "canManageLostItems" = true,
  "sections" = '["overview","settings","console","logs","players","software","files","worlds","backups","network","integrations","security"]'::jsonb
FROM "servers" s
JOIN "user" u ON u."id" = s."userId"
WHERE p."userId" = s."userId"
  AND p."serverId" = s."id"
  AND lower(COALESCE(u."role", 'member')) = 'member'
  AND s."status" <> 'deleted';

INSERT INTO "server_permissions" (
  "userId","ownerUserId","serverId","canStart","canStop","canRestart","canConsole","canFiles","canBackup","canReset","canViewLostItems","canManageLostItems","sections"
)
SELECT
  s."userId",s."userId",s."id",true,true,true,true,true,true,true,true,true,
  '["overview","settings","console","logs","players","software","files","worlds","backups","network","integrations","security"]'::jsonb
FROM "servers" s
JOIN "user" u ON u."id" = s."userId"
WHERE lower(COALESCE(u."role", 'member')) = 'member'
  AND s."status" <> 'deleted'
  AND NOT EXISTS (
    SELECT 1 FROM "server_permissions" p
    WHERE p."userId" = s."userId" AND p."serverId" = s."id"
  );
