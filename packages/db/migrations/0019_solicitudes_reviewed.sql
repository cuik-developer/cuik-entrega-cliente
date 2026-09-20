ALTER TABLE "solicitudes" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "solicitudes" ADD COLUMN IF NOT EXISTS "reviewed_by" text REFERENCES "user"("id");--> statement-breakpoint
UPDATE "solicitudes" SET "reviewed_at" = "created_at" WHERE "status" <> 'pending' AND "reviewed_at" IS NULL;
