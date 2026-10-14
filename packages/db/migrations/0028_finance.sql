-- Finance module (super-admin): Cuik's own money. Monthly USD rate, recurring
-- items (fixed costs / recurring incomes), one-off entries (variable costs,
-- other incomes, partner contributions and returns) and loans. Merchant
-- invoices are read from tenant_invoices; nothing here touches them.
-- Idempotent; safe to re-run.
--
-- DEPLOY ORDER (production): apply this file with psql BEFORE pushing the code.
CREATE SCHEMA IF NOT EXISTS finance;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS finance.fx_rates (
  "month" text PRIMARY KEY,
  "usd_pen" numeric(10, 4) NOT NULL,
  "updated_by" text REFERENCES "public"."user"("id"),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS finance.recurring_items (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" text NOT NULL CHECK ("type" IN ('cost', 'income')),
  "category" text NOT NULL,
  "name" text NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'PEN' CHECK ("currency" IN ('PEN', 'USD')),
  "every_months" integer NOT NULL DEFAULT 1 CHECK ("every_months" IN (1, 3, 6, 12)),
  "from_month" text NOT NULL,
  "to_month" text,
  "recognition" text NOT NULL DEFAULT 'spread' CHECK ("recognition" IN ('spread', 'cash')),
  "notes" text,
  "active" boolean NOT NULL DEFAULT true,
  "created_by" text REFERENCES "public"."user"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS finance_recurring_type_idx ON finance.recurring_items ("type", "active");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS finance.entries (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" text NOT NULL CHECK ("type" IN ('cost', 'income', 'contribution', 'return')),
  "category" text NOT NULL,
  "name" text NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'PEN' CHECK ("currency" IN ('PEN', 'USD')),
  "month" text NOT NULL,
  "months" integer NOT NULL DEFAULT 1 CHECK ("months" BETWEEN 1 AND 24),
  "recognition" text NOT NULL DEFAULT 'spread' CHECK ("recognition" IN ('spread', 'cash')),
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE SET NULL,
  "notes" text,
  "created_by" text REFERENCES "public"."user"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS finance_entries_month_idx ON finance.entries ("month", "type");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS finance.loans (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "principal" numeric(12, 2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'PEN' CHECK ("currency" IN ('PEN', 'USD')),
  "installment" numeric(12, 2) NOT NULL,
  "installments" integer NOT NULL CHECK ("installments" BETWEEN 1 AND 360),
  "first_month" text NOT NULL,
  "notes" text,
  "created_by" text REFERENCES "public"."user"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);
