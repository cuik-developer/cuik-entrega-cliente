-- Finanzas › Contabilidad, bloque 4: periodos mensuales (abierto / cerrado) y
-- cierre del contador. Un periodo cerrado bloquea sus comprobantes; guarda lo
-- que calculó el panel y lo que declaró el contador (PDT 621), la reserva de
-- renta anual efectivamente separada en el banco y la constancia.
--
-- DEPLOY ORDER (producción): aplicar con psql ANTES de hacer push del código.
-- Idempotente: se puede correr dos veces. Requiere 0047 y 0048 aplicadas.

CREATE TABLE IF NOT EXISTS finance.tax_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_id uuid NOT NULL REFERENCES finance.issuers(id),
  month text NOT NULL CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  -- Vencimiento del PDT 621 según el cronograma SUNAT (último dígito del RUC).
  due_date date,
  -- Reserva para la renta anual separada en el banco: cuándo y cuánto.
  reserve_moved_on date,
  reserve_amount numeric(12, 2),
  -- Lo que calculó el panel al cerrar y lo que declaró el contador (por código).
  panel_snapshot jsonb,
  declared jsonb,
  -- Constancia de la declaración (PDF) en el bucket privado.
  constancia_key text,
  constancia_name text,
  notes text,
  closed_at timestamp,
  closed_by text REFERENCES public."user"(id),
  reopened_reason text,
  updated_by text REFERENCES public."user"(id),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (issuer_id, month),
  CHECK (reserve_amount IS NULL OR reserve_amount >= 0)
);

-- Cada importación del cierre del contador (la última es la vigente; quedan
-- las anteriores como historial). summary: montos por código; lines: el
-- registro de ventas y compras del contador, una fila por comprobante.
CREATE TABLE IF NOT EXISTS finance.accountant_closes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES finance.tax_periods(id) ON DELETE CASCADE,
  file_key text,
  file_name text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  imported_by text REFERENCES public."user"(id),
  imported_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_accountant_closes_period_idx
  ON finance.accountant_closes (period_id, imported_at DESC);
