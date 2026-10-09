ALTER TABLE websites
  ADD COLUMN IF NOT EXISTS "serverId" uuid;

ALTER TABLE website_form_submissions
  ADD COLUMN IF NOT EXISTS "serverId" uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'websites_server_id_fk') THEN
    ALTER TABLE websites
      ADD CONSTRAINT websites_server_id_fk
      FOREIGN KEY ("serverId") REFERENCES servers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'website_form_submissions_server_id_fk') THEN
    ALTER TABLE website_form_submissions
      ADD CONSTRAINT website_form_submissions_server_id_fk
      FOREIGN KEY ("serverId") REFERENCES servers(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS websites_server_id_idx
  ON websites ("serverId");

CREATE INDEX IF NOT EXISTS website_form_submissions_server_id_idx
  ON website_form_submissions ("serverId");
