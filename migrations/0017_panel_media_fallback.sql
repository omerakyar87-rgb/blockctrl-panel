CREATE TABLE IF NOT EXISTS panel_media_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ownerUserId" text NOT NULL,
  scope text NOT NULL,
  "scopeId" text NOT NULL,
  pathname text NOT NULL UNIQUE,
  "contentType" text NOT NULL,
  "sizeBytes" integer NOT NULL,
  visibility text NOT NULL DEFAULT 'private',
  data bytea NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT panel_media_objects_visibility_check CHECK (visibility IN ('public','private')),
  CONSTRAINT panel_media_objects_size_check CHECK ("sizeBytes">0)
);

CREATE INDEX IF NOT EXISTS panel_media_objects_scope_idx
  ON panel_media_objects (scope,"scopeId","createdAt" DESC);

CREATE INDEX IF NOT EXISTS panel_media_objects_owner_idx
  ON panel_media_objects ("ownerUserId","createdAt" DESC);
