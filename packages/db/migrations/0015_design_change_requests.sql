DO $$ BEGIN
  CREATE TYPE "public"."design_change_request_type" AS ENUM('color', 'texto', 'imagen', 'reglas', 'otro');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."design_change_request_status" AS ENUM('pending', 'in_progress', 'done', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "design_change_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "requested_by_user_id" text NOT NULL,
  "type" "design_change_request_type" DEFAULT 'otro' NOT NULL,
  "message" text NOT NULL,
  "status" "design_change_request_status" DEFAULT 'pending' NOT NULL,
  "resolved_by_user_id" text,
  "resolved_at" timestamp,
  "internal_notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "design_change_requests"
    ADD CONSTRAINT "design_change_requests_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "design_change_requests"
    ADD CONSTRAINT "design_change_requests_requested_by_user_id_user_id_fk"
    FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "design_change_requests"
    ADD CONSTRAINT "design_change_requests_resolved_by_user_id_user_id_fk"
    FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "design_change_requests_tenant_id_idx"
  ON "design_change_requests" ("tenant_id");

CREATE INDEX IF NOT EXISTS "design_change_requests_status_idx"
  ON "design_change_requests" ("status");
