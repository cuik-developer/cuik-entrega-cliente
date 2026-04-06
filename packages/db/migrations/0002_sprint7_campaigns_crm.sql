-- Sprint 7: Campaign extensions + CRM tables

-- Add "sending" to campaign_status enum
ALTER TYPE "public"."campaign_status" ADD VALUE IF NOT EXISTS 'sending' BEFORE 'sent';--> statement-breakpoint

-- Campaigns table extensions
ALTER TABLE "campaigns"."campaigns" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "campaigns"."campaigns" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "campaigns"."campaigns" ADD COLUMN "target_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns"."campaigns" ADD COLUMN "sent_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns"."campaigns" ADD COLUMN "delivered_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns"."campaigns" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint

-- Campaign segments extension
ALTER TABLE "campaigns"."campaign_segments" ADD COLUMN "segment_name" text;--> statement-breakpoint

-- Notifications extension
ALTER TABLE "campaigns"."notifications" ADD COLUMN "error" text;--> statement-breakpoint

-- FK for campaigns.created_by -> user.id
ALTER TABLE "campaigns"."campaigns" ADD CONSTRAINT "campaigns_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- CRM: client_notes table
CREATE TABLE IF NOT EXISTS "loyalty"."client_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "content" text NOT NULL,
  "created_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- CRM: client_tags table
CREATE TABLE IF NOT EXISTS "loyalty"."client_tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "color" text DEFAULT '#6b7280',
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- CRM: client_tag_assignments table
CREATE TABLE IF NOT EXISTS "loyalty"."client_tag_assignments" (
  "client_id" uuid NOT NULL,
  "tag_id" uuid NOT NULL,
  "assigned_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "client_tag_assignments_client_id_tag_id_pk" PRIMARY KEY("client_id","tag_id")
);--> statement-breakpoint

-- Indexes: CRM tables
CREATE INDEX IF NOT EXISTS "client_notes_client_tenant_idx" ON "loyalty"."client_notes" USING btree ("client_id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "client_tags_tenant_name_idx" ON "loyalty"."client_tags" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_tag_assignments_tag_id_idx" ON "loyalty"."client_tag_assignments" USING btree ("tag_id");--> statement-breakpoint

-- Indexes: campaigns performance
CREATE INDEX IF NOT EXISTS "campaigns_tenant_status_idx" ON "campaigns"."campaigns" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_tenant_scheduled_idx" ON "campaigns"."campaigns" USING btree ("tenant_id","scheduled_at") WHERE "status" = 'scheduled';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_campaign_status_idx" ON "campaigns"."notifications" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_client_sent_idx" ON "campaigns"."notifications" USING btree ("client_id","sent_at");--> statement-breakpoint

-- Indexes: loyalty segment queries
CREATE INDEX IF NOT EXISTS "clients_tenant_status_idx" ON "loyalty"."clients" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_tenant_tier_idx" ON "loyalty"."clients" USING btree ("tenant_id","tier");--> statement-breakpoint

-- Foreign keys for CRM tables
ALTER TABLE "loyalty"."client_notes" ADD CONSTRAINT "client_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "loyalty"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty"."client_notes" ADD CONSTRAINT "client_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty"."client_notes" ADD CONSTRAINT "client_notes_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty"."client_tags" ADD CONSTRAINT "client_tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty"."client_tag_assignments" ADD CONSTRAINT "client_tag_assignments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "loyalty"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty"."client_tag_assignments" ADD CONSTRAINT "client_tag_assignments_tag_id_client_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "loyalty"."client_tags"("id") ON DELETE cascade ON UPDATE no action;
