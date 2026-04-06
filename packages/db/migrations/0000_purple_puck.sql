CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'scheduled', 'sent', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."campaign_type" AS ENUM('push', 'wallet_update', 'email');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('wallet_push', 'email');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('sent', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."solicitud_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('pending', 'trial', 'active', 'expired', 'cancelled', 'paused');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('active', 'inactive', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."promo_type" AS ENUM('stamps', 'discount', 'coupon', 'subscription');--> statement-breakpoint
CREATE TYPE "public"."reward_status" AS ENUM('pending', 'redeemed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."visit_source" AS ENUM('qr', 'manual');--> statement-breakpoint
CREATE TYPE "public"."asset_type" AS ENUM('logo', 'icon', 'strip_bg', 'stamp', 'background');--> statement-breakpoint
CREATE TYPE "public"."pass_type" AS ENUM('apple_store', 'google_loyalty');--> statement-breakpoint
CREATE TABLE "analytics"."events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics"."retention_cohorts" (
	"tenant_id" uuid NOT NULL,
	"cohort_month" date NOT NULL,
	"month_offset" integer NOT NULL,
	"clients_count" integer DEFAULT 0 NOT NULL,
	"retention_pct" numeric(5, 2),
	CONSTRAINT "retention_cohorts_tenant_id_cohort_month_month_offset_pk" PRIMARY KEY("tenant_id","cohort_month","month_offset")
);
--> statement-breakpoint
CREATE TABLE "analytics"."visits_daily" (
	"tenant_id" uuid NOT NULL,
	"date" date NOT NULL,
	"location_id" uuid NOT NULL,
	"total_visits" integer DEFAULT 0 NOT NULL,
	"unique_clients" integer DEFAULT 0 NOT NULL,
	"new_clients" integer DEFAULT 0 NOT NULL,
	"rewards_redeemed" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "visits_daily_tenant_id_date_location_id_pk" PRIMARY KEY("tenant_id","date","location_id")
);
--> statement-breakpoint
CREATE TABLE "auth"."user" (
	"id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns"."campaign_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"filter" jsonb
);
--> statement-breakpoint
CREATE TABLE "campaigns"."campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "campaign_type" NOT NULL,
	"content" jsonb,
	"scheduled_at" timestamp,
	"sent_at" timestamp,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"status" "notification_status" NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "global_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"max_locations" integer NOT NULL,
	"max_promos" integer NOT NULL,
	"max_clients" integer NOT NULL,
	"features" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solicitudes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_name" text NOT NULL,
	"business_type" text,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"city" text,
	"status" "solicitud_status" DEFAULT 'pending' NOT NULL,
	"tenant_id" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"plan_id" uuid,
	"status" "tenant_status" DEFAULT 'pending' NOT NULL,
	"trial_ends_at" timestamp,
	"activated_at" timestamp,
	"branding" jsonb,
	"owner_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "loyalty"."clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"last_name" text,
	"dni" text,
	"phone" text,
	"email" text,
	"qr_code" text,
	"status" "client_status" DEFAULT 'active' NOT NULL,
	"total_visits" integer DEFAULT 0 NOT NULL,
	"current_cycle" integer DEFAULT 1 NOT NULL,
	"tier" text,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty"."locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"lat" numeric(10, 7),
	"lng" numeric(10, 7),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty"."promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" "promo_type" NOT NULL,
	"config" jsonb,
	"max_visits" integer,
	"reward_value" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty"."rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cycle_number" integer NOT NULL,
	"reward_type" text,
	"status" "reward_status" DEFAULT 'pending' NOT NULL,
	"redeemed_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty"."visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"visit_num" integer NOT NULL,
	"cycle_number" integer NOT NULL,
	"points" integer DEFAULT 0,
	"source" "visit_source" DEFAULT 'qr' NOT NULL,
	"registered_by" text,
	"amount" numeric(10, 2),
	"location_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passes"."apple_devices" (
	"device_lib_id" text NOT NULL,
	"pass_type_id" text NOT NULL,
	"serial_number" text NOT NULL,
	"push_token" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "apple_devices_device_lib_id_serial_number_pk" PRIMARY KEY("device_lib_id","serial_number")
);
--> statement-breakpoint
CREATE TABLE "passes"."pass_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"design_id" uuid NOT NULL,
	"type" "asset_type" NOT NULL,
	"url" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passes"."pass_designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "pass_type" NOT NULL,
	"canvas_data" jsonb,
	"colors" jsonb,
	"fields" jsonb,
	"stamps_config" jsonb,
	"is_template" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passes"."pass_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"design_id" uuid NOT NULL,
	"serial_number" text NOT NULL,
	"apple_pass_url" text,
	"google_save_url" text,
	"last_updated_at" timestamp,
	"device_tokens" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pass_instances_serial_number_unique" UNIQUE("serial_number")
);
--> statement-breakpoint
ALTER TABLE "analytics"."events" ADD CONSTRAINT "events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."retention_cohorts" ADD CONSTRAINT "retention_cohorts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."visits_daily" ADD CONSTRAINT "visits_daily_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns"."campaign_segments" ADD CONSTRAINT "campaign_segments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns"."campaigns" ADD CONSTRAINT "campaigns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns"."notifications" ADD CONSTRAINT "notifications_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns"."notifications" ADD CONSTRAINT "notifications_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "loyalty"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty"."clients" ADD CONSTRAINT "clients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty"."locations" ADD CONSTRAINT "locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty"."promotions" ADD CONSTRAINT "promotions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty"."rewards" ADD CONSTRAINT "rewards_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "loyalty"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty"."rewards" ADD CONSTRAINT "rewards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty"."visits" ADD CONSTRAINT "visits_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "loyalty"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty"."visits" ADD CONSTRAINT "visits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty"."visits" ADD CONSTRAINT "visits_registered_by_user_id_fk" FOREIGN KEY ("registered_by") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes"."pass_assets" ADD CONSTRAINT "pass_assets_design_id_pass_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "passes"."pass_designs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes"."pass_designs" ADD CONSTRAINT "pass_designs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes"."pass_instances" ADD CONSTRAINT "pass_instances_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "loyalty"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes"."pass_instances" ADD CONSTRAINT "pass_instances_design_id_pass_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "passes"."pass_designs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_qr_code_tenant_idx" ON "loyalty"."clients" USING btree ("qr_code","tenant_id");--> statement-breakpoint
CREATE INDEX "rewards_client_status_pending_idx" ON "loyalty"."rewards" USING btree ("client_id","status") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "visits_client_cycle_idx" ON "loyalty"."visits" USING btree ("client_id","cycle_number");--> statement-breakpoint
CREATE INDEX "visits_tenant_created_idx" ON "loyalty"."visits" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "apple_devices_serial_idx" ON "passes"."apple_devices" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX "pass_instances_client_idx" ON "passes"."pass_instances" USING btree ("client_id");