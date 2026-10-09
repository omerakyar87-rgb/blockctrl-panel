ALTER TABLE "websites" ADD COLUMN IF NOT EXISTS "builderData" jsonb;
--> statement-breakpoint
ALTER TABLE "websites" ADD COLUMN IF NOT EXISTS "publishedAt" timestamp;
