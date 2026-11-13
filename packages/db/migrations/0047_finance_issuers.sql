-- Finanzas › Contabilidad, bloque 1: emisor (razón social que factura por Cuik),
-- régimen tributario versionado por mes, UIT por año y dos datos fiscales nuevos
-- del comercio. Desde noviembre 2026 factura CUIK E.I.R.L. (RUC 20606652055);
-- Making Brands queda como emisor histórico hasta octubre 2026.
--
-- DEPLOY ORDER (producción): aplicar con psql ANTES de hacer push del código.
-- Idempotente: se puede correr dos veces (las semillas no pisan lo editado).

-- Razones sociales que emiten los comprobantes de Cuik, con su vigencia.
-- from_month null = sin fecha de inicio; to_month null = vigente.
CREATE TABLE IF NOT EXISTS finance.issuers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruc text NOT NULL UNIQUE CHECK (ruc ~ '^\d{11}$'),
  razon_social text NOT NULL,
  nombre_comercial text,
  domicilio_fiscal text,
  from_month text CHECK (from_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  to_month text CHECK (to_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  notes text,
  updated_by text REFERENCES public."user"(id),
  updated_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  CHECK (from_month IS NULL OR to_month IS NULL OR from_month <= to_month)
);

-- Régimen y tasas del emisor desde un mes (el vigente es el último from_month <= mes).
-- Nada de tasas en el código: todo sale de aquí y lo valida el contador.
CREATE TABLE IF NOT EXISTS finance.tax_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_id uuid NOT NULL REFERENCES finance.issuers(id) ON DELETE CASCADE,
  from_month text NOT NULL CHECK (from_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  regime text NOT NULL CHECK (regime IN ('rmt', 'rer', 'general')),
  igv_rate numeric(6, 4) NOT NULL DEFAULT 0.18,
  -- Pago a cuenta mensual (RMT / General) o cuota definitiva (RER), sobre ingresos netos.
  monthly_rate numeric(6, 4) NOT NULL,
  -- Impuesto anual por tramos de renta neta en UIT: [{"upToUit":15,"rate":0.10},{"upToUit":null,"rate":0.295}].
  -- Vacío en RER (no hay regularización anual).
  annual_brackets jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Tope de gastos de representación: % de ingresos brutos del año, con máximo en UIT.
  representation_cap_pct numeric(6, 4) NOT NULL DEFAULT 0.005,
  representation_cap_uit numeric(8, 2) NOT NULL DEFAULT 40,
  validated_by_accountant boolean NOT NULL DEFAULT false,
  validated_at timestamp,
  notes text,
  updated_by text REFERENCES public."user"(id),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (issuer_id, from_month)
);

-- Valor de la UIT por año (lo carga el titular o el contador).
CREATE TABLE IF NOT EXISTS finance.uit_values (
  year integer PRIMARY KEY CHECK (year BETWEEN 2000 AND 2100),
  value numeric(10, 2) NOT NULL CHECK (value > 0),
  updated_by text REFERENCES public."user"(id),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- Datos fiscales nuevos del comercio. Todas las tarifas actuales incluyen IGV.
ALTER TABLE public.tenant_billing
  ADD COLUMN IF NOT EXISTS amount_includes_igv boolean NOT NULL DEFAULT true;
ALTER TABLE public.tenant_billing
  ADD COLUMN IF NOT EXISTS is_retention_agent boolean NOT NULL DEFAULT false;

-- Semillas: Making Brands (histórico, hasta oct 2026) y CUIK E.I.R.L. (desde nov 2026).
INSERT INTO finance.issuers (ruc, razon_social, domicilio_fiscal, from_month, to_month, notes)
VALUES (
  '20602048196', 'MAKING BRANDS S.R.L.',
  'Calle Palma Real N.° 175, Int. 402, La Molina, Lima, Perú',
  NULL, '2026-10',
  'Emisor histórico: facturó a los comercios hasta octubre 2026.'
)
ON CONFLICT (ruc) DO NOTHING;

INSERT INTO finance.issuers (ruc, razon_social, nombre_comercial, domicilio_fiscal, from_month, notes)
VALUES (
  '20606652055', 'CUIK E.I.R.L.', 'Cuik',
  'Av. Velasco Astete N.° 1879, Santiago de Surco, Lima, Perú',
  '2026-11',
  'RUC propio reactivado; emite desde noviembre 2026. Activo y habido.'
)
ON CONFLICT (ruc) DO NOTHING;

-- MYPE Tributario desde nov 2026: 1 % mensual y 10 % / 29.5 % anual (15 UIT). Por validar con el contador.
INSERT INTO finance.tax_profiles (issuer_id, from_month, regime, igv_rate, monthly_rate, annual_brackets, notes)
SELECT id, '2026-11', 'rmt', 0.18, 0.01,
  '[{"upToUit":15,"rate":0.10},{"upToUit":null,"rate":0.295}]'::jsonb,
  'Régimen MYPE Tributario según ficha RUC. Tasas por validar con el contador.'
FROM finance.issuers WHERE ruc = '20606652055'
ON CONFLICT (issuer_id, from_month) DO NOTHING;
