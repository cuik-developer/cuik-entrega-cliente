-- Who published each pass design and when (Equipo Cuik may publish with
-- "designs_publish"). Idempotent; existing designs stay NULL until their next publish.
ALTER TABLE "passes"."pass_designs" ADD COLUMN IF NOT EXISTS "published_at" timestamp;
ALTER TABLE "passes"."pass_designs" ADD COLUMN IF NOT EXISTS "published_by" text REFERENCES "user"("id") ON DELETE SET NULL;
