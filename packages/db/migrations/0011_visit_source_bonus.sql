-- Add 'bonus' to visit_source enum for marketing opt-in bonus visits
ALTER TYPE "public"."visit_source" ADD VALUE IF NOT EXISTS 'bonus';
