-- Tenant billing: how and how often a tenant is invoiced.
--   billing_mode: "arrears" (a mes vencido: the service period is invoiced on the
--     billing day after it ended, default) or "advance" (invoiced on its own
--     billing day, the previous behaviour).
--   billing_interval_months: months covered by each invoice: 1 (mensual,
--     default), 3 (trimestral), 6 (semestral) or 12 (anual). `monthly_amount`
--     is the amount of each invoice; metrics divide it by the interval.
-- Idempotent; safe to re-run.
--
-- DEPLOY ORDER (production): apply this file with psql BEFORE pushing the code.
ALTER TABLE "tenant_billing"
  ADD COLUMN IF NOT EXISTS "billing_mode" text NOT NULL DEFAULT 'arrears'
  CHECK ("billing_mode" IN ('advance', 'arrears'));--> statement-breakpoint
ALTER TABLE "tenant_billing"
  ADD COLUMN IF NOT EXISTS "billing_interval_months" integer NOT NULL DEFAULT 1
  CHECK ("billing_interval_months" IN (1, 3, 6, 12));
