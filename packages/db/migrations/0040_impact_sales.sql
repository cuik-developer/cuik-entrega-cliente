-- Impacto: the merchant's own sales (DNI · fecha · monto) crossed with Cuik.
-- sales_imports = one upload (file, column mapping, excluded DNIs, period);
-- sales = one purchase per row (lines already added up); impact_reports = the
-- metrics of one "corte", kept as a snapshot. Idempotent.
--
-- DEPLOY ORDER (production): apply with psql BEFORE pushing the code.

CREATE TABLE IF NOT EXISTS analytics.sales_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  file_name text NOT NULL,
  file_key text,
  status text NOT NULL DEFAULT 'mapping',
  error text,
  mapping jsonb,
  excluded_dnis jsonb,
  period_from date,
  period_to date,
  rows_total integer NOT NULL DEFAULT 0,
  orders_total integer NOT NULL DEFAULT 0,
  orders_with_dni integer NOT NULL DEFAULT 0,
  created_by text REFERENCES public."user"(id),
  created_at timestamp DEFAULT now() NOT NULL,
  processed_at timestamp
);
CREATE INDEX IF NOT EXISTS sales_imports_tenant_created_idx ON analytics.sales_imports (tenant_id, created_at);
CREATE TABLE IF NOT EXISTS analytics.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  import_id uuid NOT NULL REFERENCES analytics.sales_imports(id) ON DELETE CASCADE,
  order_ref text,
  dni text,
  customer_name text,
  phone text,
  store text,
  cashier text,
  sold_on date NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sales_tenant_dni_day_idx ON analytics.sales (tenant_id, dni, sold_on);
CREATE INDEX IF NOT EXISTS sales_tenant_day_idx ON analytics.sales (tenant_id, sold_on);
CREATE UNIQUE INDEX IF NOT EXISTS sales_tenant_order_idx ON analytics.sales (tenant_id, order_ref);
CREATE TABLE IF NOT EXISTS analytics.impact_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  import_id uuid NOT NULL REFERENCES analytics.sales_imports(id) ON DELETE CASCADE,
  phase_id uuid,
  period_from date NOT NULL,
  period_to date NOT NULL,
  summary jsonb NOT NULL,
  computed_at timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS impact_reports_tenant_period_idx ON analytics.impact_reports (tenant_id, period_to);
