-- Cashback as the reward of a stamps card: every stamp keeps a share of its
-- purchase (visits.cashback_amount), the client accumulates it on the current
-- card (clients.cashback_balance) and completing the card turns it into the
-- reward (rewards.cashback_amount). Program phases mark where a new strategy
-- starts (with a baseline snapshot) so reports compare before/after without
-- touching the history. Idempotent.
--
-- DEPLOY ORDER (production): apply this file with psql BEFORE pushing the
-- code (the client and visit queries read the new columns).

ALTER TABLE loyalty.visits ADD COLUMN IF NOT EXISTS cashback_amount numeric(10,2);
ALTER TABLE loyalty.clients ADD COLUMN IF NOT EXISTS cashback_balance numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE loyalty.rewards ADD COLUMN IF NOT EXISTS cashback_amount numeric(10,2);
CREATE TABLE IF NOT EXISTS loyalty.program_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  starts_on date NOT NULL,
  note text,
  baseline jsonb,
  created_by text REFERENCES public."user"(id),
  created_at timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS program_phases_tenant_starts_idx ON loyalty.program_phases (tenant_id, starts_on);
