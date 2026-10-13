-- Billing mode per tenant: "arrears" (a mes vencido: the service month is
-- invoiced on the billing day of the following month, default) or "advance"
-- (the month is invoiced on its own billing day, the previous behaviour).
-- Idempotent; safe to re-run.
--
-- DEPLOY ORDER (production): apply this file with psql BEFORE pushing the code.
ALTER TABLE "tenant_billing"
  ADD COLUMN IF NOT EXISTS "billing_mode" text NOT NULL DEFAULT 'arrears'
  CHECK ("billing_mode" IN ('advance', 'arrears'));
