-- Libro de Reclamaciones (DS 011-2011-PCM): Hojas de Reclamación del sitio público. Idempotente.
CREATE TABLE IF NOT EXISTS "complaints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "numero" text NOT NULL CONSTRAINT "complaints_numero_unique" UNIQUE,
  "tipo" text NOT NULL CHECK ("tipo" IN ('reclamo', 'queja')),
  "nombre" text NOT NULL,
  "documento_tipo" text NOT NULL,
  "documento" text NOT NULL,
  "domicilio" text NOT NULL,
  "telefono" text NOT NULL,
  "email" text NOT NULL,
  "menor" boolean NOT NULL DEFAULT false,
  "apoderado" text,
  "bien_tipo" text NOT NULL CHECK ("bien_tipo" IN ('producto', 'servicio')),
  "bien_descripcion" text NOT NULL,
  "monto" numeric(12, 2),
  "detalle" text NOT NULL,
  "pedido" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'answered', 'closed')),
  "due_on" date NOT NULL,
  "answer" text,
  "answered_at" timestamp,
  "answered_by" text REFERENCES "public"."user"("id") ON DELETE SET NULL,
  "email_status" text CHECK ("email_status" IN ('sent', 'failed', 'partial')),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "complaints_status_idx" ON "complaints" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "complaints_created_idx" ON "complaints" ("created_at");
