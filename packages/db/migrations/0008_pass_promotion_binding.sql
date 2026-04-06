-- Pass-Promotion Binding: link pass_designs to promotions

-- 1. Add promotion_id FK (nullable — existing designs have no promotion)
ALTER TABLE "passes"."pass_designs" ADD COLUMN IF NOT EXISTS "promotion_id" UUID REFERENCES "loyalty"."promotions"("id");--> statement-breakpoint

-- 2. Index for querying designs by promotion
CREATE INDEX IF NOT EXISTS "pass_designs_promotion_idx" ON "passes"."pass_designs" USING btree ("promotion_id");
