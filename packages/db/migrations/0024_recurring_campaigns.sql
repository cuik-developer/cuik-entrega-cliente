-- Recurring campaigns ("todos los miercoles", "cada 2 jueves", "primer viernes del mes").
-- Idempotent; safe to re-run.
--
-- DEPLOY ORDER (production): apply this file with psql BEFORE pushing the code.
-- No enum changes (statuses are text + CHECK), so BEGIN/COMMIT is fine.
--
-- Model: a recurring campaign is a TEMPLATE. The scheduled-campaigns cron
-- materializes one ordinary row in campaigns.campaigns per occurrence (linked
-- through campaigns.recurring_id) and runs it through executeCampaign, so every
-- send shows up in history, reports and metrics exactly like a manual one.

CREATE TABLE IF NOT EXISTS "campaigns"."recurring_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "type" "campaign_type" NOT NULL DEFAULT 'push',

  -- Message rotation: ["texto 1", "texto 2", ...]; occurrence k sends messages[k mod n].
  -- Variables ({{client.name}}, {{points.balance}}...) resolve per client at send time.
  "messages" jsonb NOT NULL,
  "next_message_index" integer NOT NULL DEFAULT 0,

  -- Audience, re-evaluated at every occurrence. Same shape as campaign_segments.filter.
  "segment_filter" jsonb NOT NULL,

  -- Schedule, interpreted in the tenant timezone.
  --   weekly:          every `interval_weeks` weeks on each day in `weekdays` (0 = Sunday .. 6 = Saturday),
  --                    anchored on `starts_on` (defines which week is "week 1" for interval > 1)
  --   monthly_weekday: the `week_of_month`-th `weekdays[0]` of each month (1..4, -1 = last)
  "frequency" text NOT NULL CHECK ("frequency" IN ('weekly', 'monthly_weekday')),
  "interval_weeks" integer NOT NULL DEFAULT 1 CHECK ("interval_weeks" BETWEEN 1 AND 12),
  "weekdays" integer[] NOT NULL,
  "week_of_month" integer CHECK ("week_of_month" IN (1, 2, 3, 4, -1)),
  "send_hour" integer NOT NULL CHECK ("send_hour" BETWEEN 0 AND 23),
  "send_minute" integer NOT NULL DEFAULT 0 CHECK ("send_minute" BETWEEN 0 AND 59),
  "starts_on" date NOT NULL,
  "ends_on" date,
  "max_occurrences" integer CHECK ("max_occurrences" > 0),

  -- Per-client guards applied on top of the segment at send time.
  "skip_if_visited_days" integer CHECK ("skip_if_visited_days" > 0),   -- omit clients who visited in the last N days
  "min_days_since_push" integer CHECK ("min_days_since_push" > 0),     -- omit clients pushed (any campaign) in the last N days

  -- Lifecycle. paused_reason is set when the system pauses it (e.g. 3 empty sends in a row).
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'paused', 'finished')),
  "paused_reason" text,
  "empty_streak" integer NOT NULL DEFAULT 0,

  -- Cron bookkeeping. next_run_at is UTC, recomputed after every occurrence.
  "next_run_at" timestamp,
  "last_run_at" timestamp,
  "occurrences_count" integer NOT NULL DEFAULT 0,

  "created_by" text REFERENCES "public"."user"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

-- What the cron scans: active templates whose time has come.
CREATE INDEX IF NOT EXISTS "recurring_campaigns_due_idx"
  ON "campaigns"."recurring_campaigns" ("next_run_at")
  WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_campaigns_tenant_idx"
  ON "campaigns"."recurring_campaigns" ("tenant_id", "status");--> statement-breakpoint

-- Each materialized occurrence points back to its template (aggregated results per template).
ALTER TABLE "campaigns"."campaigns"
  ADD COLUMN IF NOT EXISTS "recurring_id" uuid REFERENCES "campaigns"."recurring_campaigns"("id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_recurring_idx"
  ON "campaigns"."campaigns" ("recurring_id", "sent_at")
  WHERE "recurring_id" IS NOT NULL;
