-- Apple Wallet: columna passes.pass_instances.apple_removed_at (migración 0031). Idempotente: se puede pegar dos veces.
-- Una sentencia por línea para que la terminal web de Dokploy no la parta. Pegar en psql, base cuik_prod.
-- Verificación al final: debe listar apple_removed_at (timestamp without time zone, nullable).
ROLLBACK;
ALTER TABLE passes.pass_instances ADD COLUMN IF NOT EXISTS apple_removed_at timestamp;
SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'passes' AND table_name = 'pass_instances' AND column_name IN ('google_saved_at', 'google_deleted_at', 'apple_removed_at') ORDER BY column_name;
