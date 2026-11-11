-- POS connector (Odoo): sales arrive by API instead of a monthly file, with
-- their lines (SKU, qty, price) and the merchant's product master (category,
-- class, subclass). Each synced order is matched to the Cuik client (by DNI)
-- and to the visit registered that day at the same store. Idempotent.
--
-- DEPLOY ORDER (production): apply with psql BEFORE pushing the code.

-- One connection per tenant. The API key is AES-256-GCM encrypted (lib/encryption.ts).
CREATE TABLE IF NOT EXISTS analytics.pos_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id),
  provider text NOT NULL DEFAULT 'odoo',
  base_url text NOT NULL,
  database text NOT NULL,
  login text NOT NULL,
  api_key_enc text,
  start_date date NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  cursor jsonb,
  last_sync_at timestamp,
  last_sync_orders integer,
  last_error text,
  -- Corte options for a tenant that only uses the API (no file to inherit them from).
  retention_days integer NOT NULL DEFAULT 90,
  excluded_dnis jsonb,
  -- Per-tenant lock: a run sets it and clears it; a stale one (30 min) is taken over.
  sync_started_at timestamp,
  created_by text REFERENCES public."user"(id),
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);
ALTER TABLE analytics.pos_connections ADD COLUMN IF NOT EXISTS retention_days integer NOT NULL DEFAULT 90;
ALTER TABLE analytics.pos_connections ADD COLUMN IF NOT EXISTS excluded_dnis jsonb;
ALTER TABLE analytics.pos_connections ADD COLUMN IF NOT EXISTS sync_started_at timestamp;

-- Where a load came from: 'file' (upload) or 'pos' (connector, one row per month).
ALTER TABLE analytics.sales_imports ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'file';
-- One "Odoo · YYYY-MM" row per tenant even when two runs race for the same month.
CREATE UNIQUE INDEX IF NOT EXISTS sales_imports_pos_month_idx ON analytics.sales_imports (tenant_id, file_name) WHERE source = 'pos';

-- Synced orders carry the POS id, the instant of sale, and the Cuik client/visit they match.
ALTER TABLE analytics.sales ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'file';
ALTER TABLE analytics.sales ADD COLUMN IF NOT EXISTS pos_order_id integer;
ALTER TABLE analytics.sales ADD COLUMN IF NOT EXISTS sold_at timestamp;
ALTER TABLE analytics.sales ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES loyalty.clients(id) ON DELETE SET NULL;
ALTER TABLE analytics.sales ADD COLUMN IF NOT EXISTS visit_id uuid REFERENCES loyalty.visits(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_tenant_pos_order_idx ON analytics.sales (tenant_id, pos_order_id) WHERE pos_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_tenant_client_day_idx ON analytics.sales (tenant_id, client_id, sold_on);
CREATE UNIQUE INDEX IF NOT EXISTS sales_visit_idx ON analytics.sales (visit_id) WHERE visit_id IS NOT NULL;

-- One line per product of a synced order.
CREATE TABLE IF NOT EXISTS analytics.sale_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  sale_id uuid NOT NULL REFERENCES analytics.sales(id) ON DELETE CASCADE,
  pos_line_id integer NOT NULL,
  sku text,
  product_name text,
  odoo_category text,
  qty numeric(12,3) NOT NULL DEFAULT 0,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  discount_pct numeric(5,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS sale_lines_sale_line_idx ON analytics.sale_lines (sale_id, pos_line_id);
CREATE INDEX IF NOT EXISTS sale_lines_tenant_sku_idx ON analytics.sale_lines (tenant_id, sku);

-- The merchant's product master (SKU -> category, class, subclass), loaded from
-- a file in the super-admin; `odoo_category` is what the POS itself says.
CREATE TABLE IF NOT EXISTS analytics.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  sku text NOT NULL,
  name text,
  category text,
  class text,
  subclass text,
  odoo_category text,
  updated_at timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_sku_idx ON analytics.products (tenant_id, sku);
