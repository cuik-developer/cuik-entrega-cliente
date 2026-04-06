CREATE UNIQUE INDEX IF NOT EXISTS "clients_email_tenant_idx" ON "loyalty"."clients" ("email", "tenant_id");
