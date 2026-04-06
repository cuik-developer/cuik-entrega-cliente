-- Phase 3: Dynamic registration fields

-- 1. Add birthday to clients
ALTER TABLE "loyalty"."clients" ADD COLUMN IF NOT EXISTS "birthday" date;--> statement-breakpoint

-- 2. Add custom_data to clients
ALTER TABLE "loyalty"."clients" ADD COLUMN IF NOT EXISTS "custom_data" jsonb;--> statement-breakpoint

-- 3. Add registration_config to tenants
ALTER TABLE "public"."tenants" ADD COLUMN IF NOT EXISTS "registration_config" jsonb;--> statement-breakpoint

-- 4. Index for birthday queries (birthday promotions, filtering)
CREATE INDEX IF NOT EXISTS "clients_tenant_birthday_idx" ON "loyalty"."clients" USING btree ("tenant_id","birthday");
