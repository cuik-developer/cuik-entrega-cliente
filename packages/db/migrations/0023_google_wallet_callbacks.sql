-- Google Wallet save/delete callbacks. Idempotent; safe to re-run.
--
-- DEPLOY ORDER (production): apply this file with psql BEFORE pushing the
-- code (the callback endpoint writes these columns and this table).
-- No enum changes: it can be pasted as-is, with or without BEGIN/COMMIT.

-- When Google last told us the pass was saved to / removed from a Google
-- Wallet. NULL on both = no callback yet (pass created before the class had
-- callbackOptions, or the user never saved it). Campaigns and analytics only
-- treat a pass as "not installed" when deleted_at is newer than saved_at.
ALTER TABLE "passes"."pass_instances" ADD COLUMN IF NOT EXISTS "google_saved_at" timestamp;--> statement-breakpoint
ALTER TABLE "passes"."pass_instances" ADD COLUMN IF NOT EXISTS "google_deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pass_instances_google_object_idx"
  ON "passes"."pass_instances" ("google_object_id");--> statement-breakpoint

-- Raw callback log. The nonce is Google's duplicate-delivery key.
CREATE TABLE IF NOT EXISTS "passes"."google_callback_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "nonce" text NOT NULL UNIQUE,
  "event_type" text NOT NULL,
  "object_id" text NOT NULL,
  "class_id" text,
  "exp_time_millis" bigint,
  "received_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_callback_events_object_idx"
  ON "passes"."google_callback_events" ("object_id", "received_at");
