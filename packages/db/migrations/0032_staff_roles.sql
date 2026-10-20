-- Equipo Cuik: limited super-admin staff (user.role = 'staff') with per-area permissions,
-- and the "listo para publicar" mark a staff save leaves on a pass design. Idempotent.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "staff_permissions" text[];
ALTER TABLE "passes"."pass_designs" ADD COLUMN IF NOT EXISTS "review_requested_at" timestamp;
ALTER TABLE "passes"."pass_designs" ADD COLUMN IF NOT EXISTS "review_requested_by" text REFERENCES "user"("id") ON DELETE SET NULL;
