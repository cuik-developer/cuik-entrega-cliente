-- Which bonus the rules engine applied to a visit ("birthday" | "special_hour";
-- null = none). Shown as the visit's Origen in the cashier history and the
-- visits export. Idempotent.
--
-- DEPLOY ORDER (production): apply this file with psql BEFORE pushing the
-- code (register-visit writes the new column).

ALTER TABLE loyalty.visits ADD COLUMN IF NOT EXISTS bonus_kind text;

-- Backfill points visits: the applied bonus was already recorded on the earn
-- transaction (metadata.bonusReasons). Stamps visits never stored it.
UPDATE loyalty.visits v SET bonus_kind = CASE WHEN pt.metadata->'bonusReasons' ? 'birthday_multiplier' THEN 'birthday' ELSE 'special_hour' END FROM loyalty.points_transactions pt WHERE pt.visit_id = v.id AND pt.type = 'earn' AND v.bonus_kind IS NULL AND v.source <> 'bonus' AND jsonb_typeof(pt.metadata->'bonusReasons') = 'array' AND jsonb_array_length(pt.metadata->'bonusReasons') > 0;
