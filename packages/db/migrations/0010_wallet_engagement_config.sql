-- Add wallet engagement configuration to tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wallet_config jsonb;
