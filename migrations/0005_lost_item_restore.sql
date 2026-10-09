-- Kayıp eşya geri verme yaşam döngüsü.
-- Tekrarlı çalıştırılabilir: mevcut kurulumlarda eksik sütunları güvenle ekler.
ALTER TABLE lost_items ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE lost_items ADD COLUMN IF NOT EXISTS "restoreCommandId" uuid;
ALTER TABLE lost_items ADD COLUMN IF NOT EXISTS "restoreRequestedAt" timestamp;
ALTER TABLE lost_items ADD COLUMN IF NOT EXISTS "restoredAt" timestamp;
ALTER TABLE lost_items ADD COLUMN IF NOT EXISTS "restoredByUserId" text;
ALTER TABLE lost_items ADD COLUMN IF NOT EXISTS "restoreError" text;

CREATE INDEX IF NOT EXISTS lost_items_server_status_idx ON lost_items ("serverId", status);
CREATE INDEX IF NOT EXISTS lost_items_restore_command_idx ON lost_items ("restoreCommandId");
CREATE INDEX IF NOT EXISTS lost_items_occurred_at_idx ON lost_items ("serverId", "occurredAt" DESC);
