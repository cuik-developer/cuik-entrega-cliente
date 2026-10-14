-- Invoices carry their own coverage: `months` of service from `period` (1, 3,
-- 6 or 12) and how the amount is recognised in the finance views ("spread":
-- month by month over the covered months; "cash": all in the month it was
-- paid). The tenant's billing_interval_months becomes the default for new
-- invoices; the billing status is computed from coverage, so a tenant can
-- change periodicity from one invoice to the next. Idempotent; safe to re-run.
--
-- DEPLOY ORDER (production): apply this file with psql BEFORE pushing the code.
ALTER TABLE "tenant_invoices"
  ADD COLUMN IF NOT EXISTS "months" integer NOT NULL DEFAULT 1
  CHECK ("months" IN (1, 3, 6, 12));--> statement-breakpoint
ALTER TABLE "tenant_invoices"
  ADD COLUMN IF NOT EXISTS "recognition" text NOT NULL DEFAULT 'spread'
  CHECK ("recognition" IN ('spread', 'cash'));--> statement-breakpoint
-- Invoices registered while the tenant was already on a longer periodicity
-- covered that many months: carry it over so nobody turns "pendiente" on deploy.
-- Only touches rows still at the default, so re-running changes nothing.
UPDATE "tenant_invoices" i
SET "months" = b."billing_interval_months"
FROM "tenant_billing" b
WHERE b."tenant_id" = i."tenant_id"
  AND b."billing_interval_months" IN (3, 6, 12)
  AND i."months" = 1
  AND i."status" <> 'void';
