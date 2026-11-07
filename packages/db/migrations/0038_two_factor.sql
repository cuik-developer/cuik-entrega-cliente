-- Verificación en dos pasos (Better Auth two-factor plugin): authenticator app
-- mandatory for the Cuik team. Secret and backup codes are stored encrypted.
-- Idempotent.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "two_factor_enabled" boolean DEFAULT false;
CREATE TABLE IF NOT EXISTS "two_factor" ("id" text PRIMARY KEY, "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE, "secret" text NOT NULL, "backup_codes" text NOT NULL, "verified" boolean DEFAULT true, "failed_verification_count" integer DEFAULT 0, "locked_until" timestamp);
CREATE INDEX IF NOT EXISTS "two_factor_user_idx" ON "two_factor" ("user_id");
