-- Product change log (Producto › Historial): who changed which pass design or
-- branding, and when. Append-only; names are snapshots. Idempotent.
CREATE TABLE IF NOT EXISTS "public"."product_changes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid REFERENCES "public"."tenants"("id") ON DELETE SET NULL,
  "tenant_name" text,
  "actor_id" text REFERENCES "public"."user"("id") ON DELETE SET NULL,
  "actor_name" text,
  "area" text NOT NULL,
  "action" text NOT NULL,
  "target_id" text,
  "target_name" text,
  "detail" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "product_changes_created_idx" ON "public"."product_changes" ("created_at");
CREATE INDEX IF NOT EXISTS "product_changes_tenant_created_idx" ON "public"."product_changes" ("tenant_id","created_at");
