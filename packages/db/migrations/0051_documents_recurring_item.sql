-- Finanzas: una compra puede ser el comprobante de un costo fijo (Hetzner,
-- Apple Developer…) ya registrado en Costos e ingresos, en vez de crear un
-- costo nuevo: así nada se registra dos veces, y Costos e ingresos muestra
-- qué meses de cada costo fijo ya tienen su comprobante.
--
-- DEPLOY ORDER (producción): aplicar con psql ANTES de hacer push del código.
-- Idempotente: se puede correr dos veces.

ALTER TABLE finance.documents
  ADD COLUMN IF NOT EXISTS recurring_item_id uuid REFERENCES finance.recurring_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS finance_documents_recurring_idx
  ON finance.documents (recurring_item_id) WHERE recurring_item_id IS NOT NULL;
