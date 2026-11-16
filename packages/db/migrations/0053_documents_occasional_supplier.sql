-- Finanzas › Compras: una compra puede ser de un proveedor ocasional (un
-- almuerzo, una compra suelta): su RUC y razón social se escriben en el
-- comprobante y no se guarda en Proveedores.
--
-- 1) La regla "toda compra tiene proveedor" pasa a "toda compra tiene
--    proveedor guardado o razón social escrita".
-- 2) Un mismo comprobante de un proveedor ocasional (RUC + tipo + serie +
--    número) no se puede registrar dos veces, igual que con los guardados.
--
-- DEPLOY ORDER (producción): aplicar con psql ANTES de hacer push del código.
-- Idempotente: se puede correr dos veces.

ALTER TABLE finance.documents DROP CONSTRAINT IF EXISTS documents_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'finance.documents'::regclass
      AND conname = 'documents_purchase_party_check'
  ) THEN
    ALTER TABLE finance.documents
      ADD CONSTRAINT documents_purchase_party_check
      CHECK (direction = 'sale' OR supplier_id IS NOT NULL OR counterparty_name <> '');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS finance_documents_occasional_number_uidx
  ON finance.documents (counterparty_doc, doc_type, serie, numero)
  WHERE direction = 'purchase' AND supplier_id IS NULL AND counterparty_doc IS NOT NULL;
