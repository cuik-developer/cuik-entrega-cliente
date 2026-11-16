-- Finanzas: la factura con diseño Cuik (generada desde el XML de SUNAT)
-- imprime los datos para pagar y una línea de agradecimiento de cada emisor,
-- editables en Finanzas › Empresa y régimen.
--
-- DEPLOY ORDER (producción): aplicar con psql ANTES de hacer push del código.
-- Idempotente: se puede correr dos veces.

ALTER TABLE finance.issuers
  ADD COLUMN IF NOT EXISTS invoice_payment_info text,
  ADD COLUMN IF NOT EXISTS invoice_thanks text;
