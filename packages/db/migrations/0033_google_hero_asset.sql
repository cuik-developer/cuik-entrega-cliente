-- Google-only hero image for a pass design (pass_assets.type = 'google_hero'). Idempotent.
--
-- DEPLOY ORDER (production): apply this file with psql BEFORE pushing the
-- code (publishing a design with a Google strip writes the new enum value).
-- Do NOT wrap in BEGIN/COMMIT: ALTER TYPE ... ADD VALUE cannot run inside a
-- transaction block. Paste the file as-is into psql.

ALTER TYPE "public"."asset_type" ADD VALUE IF NOT EXISTS 'google_hero';
