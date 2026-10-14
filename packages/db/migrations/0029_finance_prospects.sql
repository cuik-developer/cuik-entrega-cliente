-- CRM de prospectos (super-admin › Finanzas). Idempotente.
CREATE TABLE IF NOT EXISTS finance.prospects (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "contact_name" text,
  "phone" text,
  "email" text,
  "city" text,
  "source" text,
  "stage" text NOT NULL DEFAULT 'lead' CHECK ("stage" IN ('lead', 'demo_scheduled', 'demo_done', 'proposal', 'negotiation', 'won', 'lost', 'standby')),
  "probability" integer NOT NULL DEFAULT 20 CHECK ("probability" BETWEEN 0 AND 100),
  "plan_id" uuid REFERENCES "plans"("id") ON DELETE SET NULL,
  "monthly_amount" numeric(12, 2),
  "currency" text NOT NULL DEFAULT 'PEN' CHECK ("currency" IN ('PEN', 'USD')),
  "interval_months" integer NOT NULL DEFAULT 1 CHECK ("interval_months" IN (1, 3, 6, 12)),
  "billing_mode" text NOT NULL DEFAULT 'arrears' CHECK ("billing_mode" IN ('advance', 'arrears')),
  "expected_start_month" text,
  "expected_close_on" date,
  "demo_start_on" date,
  "demo_end_on" date,
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE SET NULL,
  "next_step" text,
  "next_step_on" date,
  "lost_reason" text,
  "notes" text,
  "created_by" text REFERENCES "public"."user"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS finance_prospects_stage_idx ON finance.prospects ("stage");
