-- Protección de datos: prueba del consentimiento de cada cliente (Ley 29733).
-- Una fila cada vez que un cliente acepta el aviso de privacidad del programa
-- al inscribirse, o da o retira la autorización de promociones (WhatsApp,
-- correo) desde la página de preferencias. Solo se agregan filas; la purga de
-- clientes archivados las borra junto con la persona.
--
-- DEPLOY ORDER (producción): aplicar con psql ANTES de hacer push del código.
-- Idempotente: se puede correr dos veces.

CREATE TABLE IF NOT EXISTS loyalty.consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  client_id uuid NOT NULL REFERENCES loyalty.clients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('privacy', 'marketing')),
  granted boolean NOT NULL,
  version text NOT NULL,
  source text NOT NULL CHECK (source IN ('registro', 'preferencias')),
  ip text,
  user_agent text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consent_events_client_idx
  ON loyalty.consent_events (tenant_id, client_id, kind, created_at);
