CREATE TABLE IF NOT EXISTS "websites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" text NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "projectName" text NOT NULL,
  "template" text DEFAULT 'blank' NOT NULL,
  "description" text,
  "vercelProjectId" text,
  "deploymentId" text,
  "deploymentUrl" text,
  "productionUrl" text,
  "status" text DEFAULT 'queued' NOT NULL,
  "lastError" text,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "websites_slug_unique" ON "websites" USING btree ("slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "websites_projectName_unique" ON "websites" USING btree ("projectName");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "websites_userId_idx" ON "websites" USING btree ("userId");
