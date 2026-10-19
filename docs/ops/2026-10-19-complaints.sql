-- Libro de Reclamaciones: tabla public.complaints (migración 0030). Idempotente: se puede pegar dos veces.
-- Una sentencia por línea para que la terminal web de Dokploy no la parta. Pegar en psql, base cuik_prod.
-- Verificación al final: \d public.complaints
CREATE TABLE IF NOT EXISTS public.complaints (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS numero text NOT NULL CONSTRAINT complaints_numero_unique UNIQUE;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS tipo text NOT NULL CHECK (tipo IN ('reclamo', 'queja'));
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS nombre text NOT NULL;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS documento_tipo text NOT NULL;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS documento text NOT NULL;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS domicilio text NOT NULL;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS telefono text NOT NULL;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS email text NOT NULL;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS menor boolean NOT NULL DEFAULT false;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS apoderado text;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS bien_tipo text NOT NULL CHECK (bien_tipo IN ('producto', 'servicio'));
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS bien_descripcion text NOT NULL;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS monto numeric(12, 2);
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS detalle text NOT NULL;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS pedido text NOT NULL;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'closed'));
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS due_on date NOT NULL;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS answer text;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS answered_at timestamp;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS answered_by text REFERENCES public."user"(id) ON DELETE SET NULL;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS email_status text CHECK (email_status IN ('sent', 'failed', 'partial'));
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now();
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS complaints_status_idx ON public.complaints (status);
CREATE INDEX IF NOT EXISTS complaints_created_idx ON public.complaints (created_at);
