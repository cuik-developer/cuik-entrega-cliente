CREATE TABLE IF NOT EXISTS "tenant_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "author_id" text REFERENCES "user"("id"),
  "content" text NOT NULL,
  "follow_up_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_notes_tenant_created_idx" ON "tenant_notes" ("tenant_id", "created_at");
