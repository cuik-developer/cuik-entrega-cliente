-- Inferred visit links: a POS sale without DNI (guest, blank, non-DNI document)
-- paired with the Cuik visit of the same store minutes later, by amount or by
-- being the only candidate. `link_kind` says how a sale got its visit so the
-- corte and later screens can tell exact, inferred and manual links apart.
--
-- DEPLOY ORDER (production): apply with psql BEFORE pushing the code.

-- 'dni' | 'inferred_amount' | 'inferred_time' | 'manual'; null = no link.
ALTER TABLE analytics.sales ADD COLUMN IF NOT EXISTS link_kind text;

-- Links made so far were all exact (same DNI, same day).
UPDATE analytics.sales SET link_kind = 'dni'
WHERE visit_id IS NOT NULL AND link_kind IS NULL;

-- Per-tenant options of the inferred pass.
ALTER TABLE analytics.pos_connections
  ADD COLUMN IF NOT EXISTS infer_links boolean NOT NULL DEFAULT true;
ALTER TABLE analytics.pos_connections
  ADD COLUMN IF NOT EXISTS infer_window_minutes integer NOT NULL DEFAULT 20;
