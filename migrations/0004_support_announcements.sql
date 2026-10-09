CREATE TABLE IF NOT EXISTS support_settings (
  id text PRIMARY KEY,
  title text NOT NULL DEFAULT 'Destek Merkezi',
  description text NOT NULL DEFAULT 'Destek talebi oluşturun ve destek ekibiyle iletişim kurun.',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updatedBy" text REFERENCES "user"(id) ON DELETE SET NULL,
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

INSERT INTO support_settings (id,title,description,config)
VALUES (
  'default',
  'Destek Merkezi',
  'İhtiyacınıza uygun destek türünü seçin. Talebiniz yetkili ekip tarafından incelenir.',
  '{"transition":"fade","intervalMs":5000,"media":[],"requestTypes":[{"id":"support","title":"Destek","description":"Sunucu veya panel kullanımıyla ilgili yardım alın.","color":"#10b981","icon":"headphones","enabled":true},{"id":"bug","title":"Hata bildirimi","description":"Panelde veya sunucuda karşılaştığınız teknik hatayı bildirin.","color":"#f59e0b","icon":"bug","enabled":true}]}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS announcements (
  id text PRIMARY KEY,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  "publishAt" timestamp,
  "expireAt" timestamp,
  "createdBy" text REFERENCES "user"(id) ON DELETE SET NULL,
  "updatedBy" text REFERENCES "user"(id) ON DELETE SET NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT announcements_status_check CHECK (status IN ('draft','scheduled','published','archived'))
);

CREATE INDEX IF NOT EXISTS announcements_publish_idx ON announcements (status,"publishAt","expireAt");

CREATE TABLE IF NOT EXISTS announcement_reads (
  "announcementId" text NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "readAt" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("announcementId","userId")
);
