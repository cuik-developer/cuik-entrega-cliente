-- Strip del pase Apple: de 750×246 a 750×288 (store card = 375×144 pt).
-- Hasta ahora iOS escalaba nuestro strip un 17 % (288/246) y recortaba 64 px por lado.
-- Esta migración aplica esa misma transformación a los números guardados de cada
-- grilla de sellos, para que con el lienzo nuevo cada comercio se vea igual que hoy.
--
-- Se corre UNA vez en producción, antes de desplegar el código que cambia las constantes.
-- Formula: iOS escalaba (x 288/246) y luego recortaba 64 px por lado en la imagen ya
-- escalada, por eso offsetX' = offsetX*s - 64 (no (offsetX-64)*s). Las Y no se recortan.
-- Marca stripVersion = 2 y aborta si la tabla de respaldo ya existe (una sola corrida).
-- Excluye el tenant "cuik" (Don Clarito), que se rediseña sobre el lienzo nuevo.
--
-- Uso:  \i docs/ops/2026-10-13-strip-288-migration.sql   (dentro de psql, en cuik_prod)
-- Reversión: UPDATE passes.pass_designs d SET stamps_config = b.stamps_config, canvas_data = b.canvas_data
--            FROM passes.pass_designs_strip_backup_20261013 b WHERE b.id = d.id;

BEGIN;

-- Guard: this migration must run once. A second run would double-scale any row whose
-- stripVersion marker was dropped by a later editor save.
DO $$
BEGIN
  IF to_regclass('passes.pass_designs_strip_backup_20261013') IS NOT NULL THEN
    RAISE EXCEPTION 'La migracion ya se corrio (existe passes.pass_designs_strip_backup_20261013). Abortando.';
  END IF;
END $$;

CREATE TABLE passes.pass_designs_strip_backup_20261013 AS
SELECT d.id, d.stamps_config, d.canvas_data, now() AS backed_up_at
FROM passes.pass_designs d
WHERE d.stamps_config IS NOT NULL
  AND jsonb_typeof(d.stamps_config) = 'object'
  AND d.stamps_config->>'stripVersion' IS NULL
  AND NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = d.tenant_id AND t.slug = 'cuik');

CREATE OR REPLACE FUNCTION pg_temp.migrate_strip_cfg(c jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  WITH v AS (
    SELECT 288.0 / 246.0 AS s,
           (750.0 * 288.0 / 246.0 - 750.0) / 2 AS crop,
           coalesce((c->>'stampSize')::numeric, 63)  AS size,
           coalesce((c->>'offsetX')::numeric, 197)   AS ox,
           coalesce((c->>'offsetY')::numeric, 23)    AS oy,
           coalesce((c->>'gapX')::numeric, 98)       AS gx,
           coalesce((c->>'gapY')::numeric, 73)      AS gy
  )
  SELECT c
    || jsonb_build_object(
         'stampSize', round(size * s),
         'offsetX',   round(ox * s - crop),
         'offsetY',   round(oy * s),
         'gapX',      round(gx * s),
         'gapY',      round(gy * s),
         'rowOffsets', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                     'x', round(coalesce((o->>'x')::numeric, 0) * s),
                     'y', round(coalesce((o->>'y')::numeric, 0) * s)) ORDER BY ord)
            FROM jsonb_array_elements(coalesce(c->'rowOffsets', '[]'::jsonb)) WITH ORDINALITY AS t(o, ord)
         ), '[]'::jsonb),
         'stripVersion', 2)
  FROM v;
$$;

UPDATE passes.pass_designs d
SET stamps_config = pg_temp.migrate_strip_cfg(d.stamps_config),
    canvas_data = CASE
      WHEN d.canvas_data ? 'stampsConfig'
        THEN jsonb_set(d.canvas_data, '{stampsConfig}', pg_temp.migrate_strip_cfg(d.canvas_data->'stampsConfig'))
      ELSE d.canvas_data END,
    updated_at = now()
WHERE d.stamps_config IS NOT NULL
  AND jsonb_typeof(d.stamps_config) = 'object'
  AND d.stamps_config->>'stripVersion' IS NULL
  AND NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = d.tenant_id AND t.slug = 'cuik');

-- Revisión: una fila por diseño migrado.
SELECT t.slug, d.is_active, d.stamps_config
FROM passes.pass_designs d JOIN tenants t ON t.id = d.tenant_id
WHERE d.stamps_config->>'stripVersion' = '2'
ORDER BY t.slug, d.is_active DESC;

COMMIT;
