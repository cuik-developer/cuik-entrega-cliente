-- Tenant billing (super-admin): fiscal data, monthly amount, billing day and a
-- manual log of issued invoices. Idempotent; safe to re-run.
--
-- DEPLOY ORDER (production): apply this file with psql BEFORE pushing the code.
-- No enum changes (statuses are text + CHECK): BEGIN/COMMIT is fine.

-- One row per tenant. The amount is the exact monthly fee agreed with the
-- merchant (independent of the plan's list price).
CREATE TABLE IF NOT EXISTS "tenant_billing" (
  "tenant_id" uuid PRIMARY KEY REFERENCES "tenants"("id") ON DELETE CASCADE,
  "ruc" text,
  "razon_social" text,
  "direccion_fiscal" text,
  "billing_email" text,
  "contacto_pagos" text,
  "monthly_amount" numeric(12, 2),
  "currency" text NOT NULL DEFAULT 'PEN' CHECK ("currency" IN ('PEN', 'USD')),
  -- Day the service with the merchant started (not the signup/activation date).
  -- Billing periods run monthly from here; "meses trabajando" counts from it too.
  "service_start_on" date,
  -- Optional override of the billing day (1..28). Null = day of service_start_on (capped at 28).
  "billing_day" integer CHECK ("billing_day" BETWEEN 1 AND 28),
  "notes" text,
  "updated_by" text REFERENCES "public"."user"("id"),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

-- Invoices are issued outside Cuik (SUNAT / facturador) and only recorded here.
CREATE TABLE IF NOT EXISTS "tenant_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  -- Billing period the invoice covers, "YYYY-MM" of its due date.
  "period" text NOT NULL CHECK ("period" ~ '^[0-9]{4}-[0-9]{2}$'),
  "issued_on" date NOT NULL,
  "number" text,
  "amount" numeric(12, 2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'PEN' CHECK ("currency" IN ('PEN', 'USD')),
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'paid', 'void')),
  "paid_on" date,
  "note" text,
  -- Files kept in the private storage bucket (served only to super-admins).
  "invoice_file_key" text,
  "invoice_file_name" text,
  "receipt_file_key" text,
  "receipt_file_name" text,
  "created_by" text REFERENCES "public"."user"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_invoices_tenant_issued_idx"
  ON "tenant_invoices" ("tenant_id", "issued_on" DESC);--> statement-breakpoint
-- At most one non-void invoice per tenant and period.
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_invoices_tenant_period_uidx"
  ON "tenant_invoices" ("tenant_id", "period")
  WHERE "status" <> 'void';
