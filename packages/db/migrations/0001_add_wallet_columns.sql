ALTER TABLE "passes"."pass_instances" ADD COLUMN "auth_token" text;--> statement-breakpoint
ALTER TABLE "passes"."pass_instances" ADD COLUMN "etag" text;--> statement-breakpoint
ALTER TABLE "passes"."pass_instances" ADD COLUMN "google_object_id" text;