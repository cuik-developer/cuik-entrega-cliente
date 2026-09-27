-- Archive + anonymize clients. Idempotent; safe to re-run.
--
-- DEPLOY ORDER (production): apply this file with psql BEFORE pushing the
-- code (the new code writes the new enum values and selects the new columns).
-- Do NOT wrap in BEGIN/COMMIT: ALTER TYPE ... ADD VALUE cannot run inside a
-- transaction block. Paste the file as-is into psql.

ALTER TYPE "client_status" ADD VALUE IF NOT EXISTS 'archived';--> statement-breakpoint
ALTER TYPE "client_status" ADD VALUE IF NOT EXISTS 'deleted';--> statement-breakpoint

-- When the admin archived the client (the purge cron anonymizes 30 days
-- later) and when the personal data was actually wiped.
ALTER TABLE "loyalty"."clients" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "loyalty"."clients" ADD COLUMN IF NOT EXISTS "anonymized_at" timestamp;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "clients_archived_idx"
  ON "loyalty"."clients" ("tenant_id", "archived_at")
  WHERE "status" = 'archived';
