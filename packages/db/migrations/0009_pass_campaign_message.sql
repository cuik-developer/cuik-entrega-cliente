-- Add campaign_message to pass_instances for wallet push notifications
ALTER TABLE passes.pass_instances ADD COLUMN IF NOT EXISTS campaign_message text;
