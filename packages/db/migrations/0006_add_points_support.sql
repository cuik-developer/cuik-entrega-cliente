-- Phase 2: Points loyalty support

-- 1. Add "points" to promo_type enum (non-transactional in PG, must be first)
ALTER TYPE "promo_type" ADD VALUE IF NOT EXISTS 'points';--> statement-breakpoint

-- 2. Create points_tx_type enum
DO $$ BEGIN
  CREATE TYPE "points_tx_type" AS ENUM ('earn', 'redeem', 'expire', 'adjust');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- 3. Add points_balance to clients
ALTER TABLE "loyalty"."clients" ADD COLUMN IF NOT EXISTS "points_balance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- 4. Create reward_catalog table
CREATE TABLE IF NOT EXISTS "loyalty"."reward_catalog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "image_url" text,
  "points_cost" integer NOT NULL,
  "category" text,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- 5. Create points_transactions table
CREATE TABLE IF NOT EXISTS "loyalty"."points_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "amount" integer NOT NULL,
  "type" "points_tx_type" NOT NULL,
  "visit_id" uuid,
  "catalog_item_id" uuid,
  "description" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- 6. Foreign keys
ALTER TABLE "loyalty"."reward_catalog" ADD CONSTRAINT "reward_catalog_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty"."points_transactions" ADD CONSTRAINT "points_tx_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "loyalty"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty"."points_transactions" ADD CONSTRAINT "points_tx_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty"."points_transactions" ADD CONSTRAINT "points_tx_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "loyalty"."visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty"."points_transactions" ADD CONSTRAINT "points_tx_catalog_item_id_reward_catalog_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "loyalty"."reward_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- 7. Indexes
CREATE INDEX IF NOT EXISTS "points_tx_client_created_idx" ON "loyalty"."points_transactions" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "points_tx_tenant_created_idx" ON "loyalty"."points_transactions" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "points_tx_client_type_idx" ON "loyalty"."points_transactions" USING btree ("client_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reward_catalog_tenant_active_idx" ON "loyalty"."reward_catalog" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_points_balance_idx" ON "loyalty"."clients" USING btree ("tenant_id","points_balance");
