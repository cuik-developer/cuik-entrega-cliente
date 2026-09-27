-- Points expiration: each earn row becomes a "lot" with its own remaining
-- balance and expiry. Idempotent; safe to re-run.
--
-- DEPLOY ORDER (production): backup -> apply this file with psql -> run the
-- verification query at the bottom -> then push the code. The new code selects
-- these columns; deploying it first breaks points redemption and history.
-- Apply at a quiet hour (e.g. 3 AM) so no earn row is inserted mid-backfill.

ALTER TABLE "loyalty"."points_transactions"
  ADD COLUMN IF NOT EXISTS "remaining" integer;--> statement-breakpoint
ALTER TABLE "loyalty"."points_transactions"
  ADD COLUMN IF NOT EXISTS "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "loyalty"."points_transactions"
  ADD COLUMN IF NOT EXISTS "warned_at" timestamp;--> statement-breakpoint

-- Backfill "remaining" on existing earn lots so that, per client, the sum of
-- open lots equals points_balance. The balance is assigned to the NEWEST lots
-- (older ones are treated as already consumed, i.e. FIFO). expires_at stays
-- NULL: existing points only get a date when a policy is activated.
WITH lots AS (
  SELECT t.id, t.client_id, t.amount,
         COALESCE(SUM(t.amount) OVER (
           PARTITION BY t.client_id
           ORDER BY t.created_at DESC, t.id DESC
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
         ), 0) AS newer
  FROM "loyalty"."points_transactions" t
  WHERE t.type = 'earn' AND t.amount > 0
)
UPDATE "loyalty"."points_transactions" p
SET remaining = GREATEST(0, LEAST(l.amount, c.points_balance - l.newer))
FROM lots l
JOIN "loyalty"."clients" c ON c.id = l.client_id
WHERE p.id = l.id AND p.remaining IS NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "points_tx_open_lots_client_idx"
  ON "loyalty"."points_transactions" ("client_id", "expires_at", "created_at")
  WHERE "type" = 'earn' AND "remaining" > 0;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "points_tx_open_lots_tenant_idx"
  ON "loyalty"."points_transactions" ("tenant_id", "expires_at")
  WHERE "type" = 'earn' AND "remaining" > 0;

-- Verification (must return zero rows):
-- SELECT c.id, c.points_balance, COALESCE(SUM(t.remaining), 0) AS en_lotes
-- FROM loyalty.clients c
-- LEFT JOIN loyalty.points_transactions t ON t.client_id = c.id AND t.type = 'earn'
-- GROUP BY c.id, c.points_balance
-- HAVING c.points_balance <> COALESCE(SUM(t.remaining), 0);
