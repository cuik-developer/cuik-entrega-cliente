-- Add segmentation_config JSONB column to tenants table
-- Stores per-tenant segmentation threshold overrides
ALTER TABLE "tenants" ADD COLUMN "segmentation_config" jsonb;
