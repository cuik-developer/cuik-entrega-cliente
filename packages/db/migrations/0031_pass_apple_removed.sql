-- Apple Wallet: when the pass was removed from the last device (unregister callback). Idempotent.
ALTER TABLE "passes"."pass_instances" ADD COLUMN IF NOT EXISTS "apple_removed_at" timestamp;
