-- Early cash-out ladder ("escalera canjeable"): a stamps program may let the
-- client cash an intermediate reward (e.g. S/ 5 at stamp 5) instead of waiting
-- for the full card. Cashing spends that many stamps: the card runs on
-- total_visits - stamps_cashed, while total_visits stays the lifetime counter.
-- Rewards record their kind, the milestone, the stamps at cash-out and who
-- redeemed them (needed to undo a redemption right after it). Idempotent.
--
-- DEPLOY ORDER (production): apply this file with psql BEFORE pushing the
-- code (every client and reward query reads the new columns).

ALTER TYPE "reward_status" ADD VALUE IF NOT EXISTS 'voided';
ALTER TABLE loyalty.clients ADD COLUMN IF NOT EXISTS stamps_cashed integer NOT NULL DEFAULT 0;
ALTER TABLE loyalty.rewards ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'final';
ALTER TABLE loyalty.rewards ADD COLUMN IF NOT EXISTS milestone_at integer;
ALTER TABLE loyalty.rewards ADD COLUMN IF NOT EXISTS stamps_at_redeem integer;
ALTER TABLE loyalty.rewards ADD COLUMN IF NOT EXISTS redeemed_by text;
ALTER TABLE loyalty.rewards ADD COLUMN IF NOT EXISTS voided_at timestamp;
CREATE INDEX IF NOT EXISTS rewards_tenant_kind_idx ON loyalty.rewards (tenant_id, kind, status);
