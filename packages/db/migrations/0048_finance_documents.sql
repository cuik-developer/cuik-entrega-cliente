-- Finanzas › Contabilidad, bloque 2: comprobantes emitidos (ventas) y recibidos
-- (compras) con sus archivos (PDF, XML, CDR) y proveedores. Un solo registro
-- para ambos sentidos, como account.move de Odoo. La factura de un comercio
-- sigue en tenant_invoices (cobranza: al día / vencida) y se enlaza a su
-- comprobante fiscal con document_id.
--
-- DEPLOY ORDER (producción): aplicar con psql ANTES de hacer push del código.
-- Idempotente: se puede correr dos veces. Requiere la 0047 aplicada.

-- Proveedores de Cuik (a quién le compramos). domiciled = false para los del
-- exterior (Hetzner, Apple, Google…): su IGV va por utilización de servicios.
CREATE TABLE IF NOT EXISTS finance.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'ruc' | 'dni' | 'foreign' (sin RUC peruano: número fiscal del país o vacío)
  doc_type text NOT NULL DEFAULT 'ruc' CHECK (doc_type IN ('ruc', 'dni', 'foreign')),
  doc_number text,
  name text NOT NULL,
  country text NOT NULL DEFAULT 'PE',
  domiciled boolean NOT NULL DEFAULT true,
  default_category text,
  -- 'credito' | 'sin_credito' | 'representacion' | 'no_domiciliado'
  default_igv_treatment text CHECK (default_igv_treatment IN ('credito', 'sin_credito', 'representacion', 'no_domiciliado')),
  notes text,
  updated_by text REFERENCES public."user"(id),
  updated_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_suppliers_doc_uidx
  ON finance.suppliers (doc_type, doc_number) WHERE doc_number IS NOT NULL;

-- Un comprobante: factura, boleta, nota de crédito/débito, recibo por
-- honorarios, ticket, recibo de servicios o comprobante del exterior.
-- Montos en la moneda del comprobante; fx_rate (soles por dólar) solo si es USD.
CREATE TABLE IF NOT EXISTS finance.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('sale', 'purchase')),
  -- Ventas: quién emite. Compras: a nombre de quién se recibió (Cuik).
  issuer_id uuid NOT NULL REFERENCES finance.issuers(id),
  -- Catálogo SUNAT: 01 factura, 03 boleta, 07 nota de crédito, 08 nota de débito,
  -- 02 recibo por honorarios, 12 ticket, 14 servicios públicos, 91 no domiciliado, 00 otros.
  doc_type text NOT NULL CHECK (doc_type IN ('01', '03', '07', '08', '02', '12', '14', '91', '00')),
  serie text NOT NULL,
  numero text NOT NULL,
  issue_date date NOT NULL,
  -- Mes en que cuenta para el IGV (compras: puede ser posterior a la emisión).
  tax_period text NOT NULL CHECK (tax_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES finance.suppliers(id) ON DELETE RESTRICT,
  -- Copia de la contraparte al registrar (no cambia si después cambia el comercio).
  counterparty_doc text,
  counterparty_name text NOT NULL,
  currency text NOT NULL DEFAULT 'PEN' CHECK (currency IN ('PEN', 'USD')),
  fx_rate numeric(10, 4),
  base_gravada numeric(12, 2) NOT NULL DEFAULT 0,
  base_no_gravada numeric(12, 2) NOT NULL DEFAULT 0,
  igv numeric(12, 2) NOT NULL DEFAULT 0,
  total numeric(12, 2) NOT NULL,
  igv_treatment text CHECK (igv_treatment IN ('credito', 'sin_credito', 'representacion', 'no_domiciliado')),
  renta_deductible text CHECK (renta_deductible IN ('si', 'no', 'limitado')),
  category text,
  detraccion_rate numeric(6, 4),
  detraccion_constancia text,
  -- Nota de crédito/débito → comprobante que modifica.
  related_document_id uuid REFERENCES finance.documents(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'void')),
  paid_on date,
  -- Archivos en el bucket privado (servidos solo a super-admin).
  pdf_key text,
  pdf_name text,
  xml_key text,
  xml_name text,
  cdr_key text,
  cdr_name text,
  -- Costo creado en Costos e ingresos al registrar la compra (gestión).
  entry_id uuid REFERENCES finance.entries(id) ON DELETE SET NULL,
  notes text,
  created_by text REFERENCES public."user"(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_by text REFERENCES public."user"(id),
  updated_at timestamp NOT NULL DEFAULT now(),
  CHECK (direction = 'sale' OR supplier_id IS NOT NULL),
  CHECK (currency = 'PEN' OR fx_rate IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS finance_documents_period_idx
  ON finance.documents (direction, tax_period);
CREATE INDEX IF NOT EXISTS finance_documents_tenant_idx
  ON finance.documents (tenant_id) WHERE tenant_id IS NOT NULL;
-- Un número de comprobante existe una sola vez (anulado o no: SUNAT no lo reutiliza).
CREATE UNIQUE INDEX IF NOT EXISTS finance_documents_sale_number_uidx
  ON finance.documents (issuer_id, doc_type, serie, numero) WHERE direction = 'sale';
CREATE UNIQUE INDEX IF NOT EXISTS finance_documents_purchase_number_uidx
  ON finance.documents (supplier_id, doc_type, serie, numero) WHERE direction = 'purchase';

-- La factura de cobranza de un comercio apunta a su comprobante fiscal.
ALTER TABLE public.tenant_invoices
  ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES finance.documents(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tenant_invoices_document_uidx
  ON public.tenant_invoices (document_id) WHERE document_id IS NOT NULL;
