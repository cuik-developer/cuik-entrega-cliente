-- Finanzas › Contabilidad: emisor por comercio. Un comercio cuyo contrato está
-- con otra razón social (p. ej. Dfrios con Making Brands) se sigue facturando
-- por ella aunque Cuik ya emita con su propio RUC: sus facturas no crean ventas
-- de CUIK E.I.R.L. ni entran en su IGV, renta, reserva ni proyección.
-- NULL = el emisor vigente del mes (CUIK E.I.R.L. desde noviembre 2026).
--
-- DEPLOY ORDER (producción): aplicar con psql ANTES de hacer push del código.
-- Idempotente: se puede correr dos veces.

ALTER TABLE public.tenant_billing
  ADD COLUMN IF NOT EXISTS issuer_id uuid REFERENCES finance.issuers(id);
