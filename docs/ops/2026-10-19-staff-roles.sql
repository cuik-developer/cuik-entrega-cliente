-- Equipo Cuik: columnas user.staff_permissions y passes.pass_designs.review_requested_at/_by (migración 0032). Idempotente: se puede pegar dos veces.
-- Una sentencia por línea para que la terminal web de Dokploy no la parta. Pegar en psql, base cuik_prod.
-- Verificación al final: debe listar las tres columnas (staff_permissions ARRAY, review_requested_at timestamp, review_requested_by text), todas nullable.
ROLLBACK;
ALTER TABLE public."user" ADD COLUMN IF NOT EXISTS staff_permissions text[];
ALTER TABLE passes.pass_designs ADD COLUMN IF NOT EXISTS review_requested_at timestamp;
ALTER TABLE passes.pass_designs ADD COLUMN IF NOT EXISTS review_requested_by text REFERENCES public."user"(id) ON DELETE SET NULL;
SELECT table_schema, table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE (table_schema = 'public' AND table_name = 'user' AND column_name = 'staff_permissions') OR (table_schema = 'passes' AND table_name = 'pass_designs' AND column_name IN ('review_requested_at', 'review_requested_by')) ORDER BY table_name, column_name;
