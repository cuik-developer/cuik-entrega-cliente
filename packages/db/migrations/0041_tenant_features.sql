-- Features Cuik turns on per tenant from the super-admin (the merchant cannot
-- edit them). First one: { "adminCashier": true } shows the cashier screens
-- in the menu of the tenant's owner and admins. NULL = everything off.
-- Idempotent.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "features" jsonb;
