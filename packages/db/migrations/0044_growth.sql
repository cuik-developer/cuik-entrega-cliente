-- Cuik Growth, fase 1: reglas por comercio, estadísticas por cliente, audiencias
-- calculadas cada noche, envíos con seguimiento por cliente, ventas atribuidas
-- (enlace a la venta real del POS, nunca copia) y "No contactar".
-- Definición: docs/GROWTH_PRODUCTO.md. El módulo se enciende por comercio con
-- tenants.features.growth = true (super-admin › comercio › Funciones), sin SQL.
--
-- DEPLOY ORDER (producción): aplicar con psql ANTES de hacer push del código.
-- Idempotente: se puede correr dos veces.

CREATE SCHEMA IF NOT EXISTS growth;

-- Parámetros y términos que Cuik fija por comercio (el comercio los ve, no los edita).
CREATE TABLE IF NOT EXISTS growth.tenant_rules (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id),
  cooldown_days integer NOT NULL DEFAULT 14,        -- días sin volver a sugerir a un contactado
  max_early_days integer NOT NULL DEFAULT 7,        -- adelanto máximo sobre la fecha esperada
  min_purchases integer NOT NULL DEFAULT 3,         -- compras mínimas para usar su propio intervalo
  risk_factor numeric(4,2) NOT NULL DEFAULT 1.5,    -- "en riesgo" = más de factor × intervalo sin comprar
  attribution_days integer NOT NULL DEFAULT 10,     -- ventana de atribución desde el check "Enviado"
  control_pct integer NOT NULL DEFAULT 10,          -- % de cada envío sorteado como control
  min_control integer NOT NULL DEFAULT 30,          -- menos que esto en control = resultado "orientativo"
  fee_fixed numeric(12,2) NOT NULL DEFAULT 199,     -- fijo mensual (S/)
  fee_variable_pct numeric(5,2),                    -- % sobre venta atribuida; null = sin variable
  pilot_months integer NOT NULL DEFAULT 2,
  starts_on date,                                   -- inicio del servicio / piloto
  audiences_off jsonb NOT NULL DEFAULT '[]'::jsonb, -- slugs de audiencias apagadas para este comercio
  updated_by text REFERENCES public."user"(id),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- Ritmo y preferencias de cada cliente con compras en el POS (cálculo nocturno).
CREATE TABLE IF NOT EXISTS growth.client_stats (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  client_id uuid NOT NULL REFERENCES loyalty.clients(id) ON DELETE CASCADE,
  purchases integer NOT NULL DEFAULT 0,             -- días distintos con compra (toda la historia)
  purchases_12m integer NOT NULL DEFAULT 0,
  spend_12m numeric(12,2) NOT NULL DEFAULT 0,
  first_purchase_on date,
  last_purchase_on date,
  last_store text,
  interval_days numeric(6,1),                       -- mediana de sus últimos intervalos
  interval_source text,                             -- 'own' | 'category' | 'tenant'
  habitual_weekday smallint,                        -- 0 = domingo … 6 = sábado (hora local), null = sin día claro
  expected_on date,                                 -- última compra + intervalo
  suggested_on date,                                -- día sugerido para escribirle (día habitual antes, máx. max_early_days)
  species text,                                     -- 'perro' | 'gato' | null (por lo que compra)
  main_category text,                               -- clave de categoría con más gasto ('gato:alimento_humedo')
  main_product_sku text,
  main_product_name text,
  main_brand text,
  stores_12m integer NOT NULL DEFAULT 0,
  categories jsonb NOT NULL DEFAULT '{}'::jsonb,    -- { clave: { orders, spend, lastOn } } últimos 12 meses
  computed_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_id)
);
CREATE INDEX IF NOT EXISTS client_stats_tenant_expected_idx ON growth.client_stats (tenant_id, expected_on);

-- Quién está en cada audiencia y desde qué día puede sugerirse (cálculo nocturno).
CREATE TABLE IF NOT EXISTS growth.audience_members (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  audience text NOT NULL,                           -- slug: 'recompra', 'en_riesgo', 'gato_sin_arena', …
  client_id uuid NOT NULL REFERENCES loyalty.clients(id) ON DELETE CASCADE,
  ready_on date,                                    -- día desde el que le toca; null = cualquier día
  detail jsonb,                                     -- { product, brand, missing, … } para el mensaje
  computed_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, audience, client_id)
);
CREATE INDEX IF NOT EXISTS audience_members_tenant_audience_ready_idx
  ON growth.audience_members (tenant_id, audience, ready_on);

-- Un envío: foto de una audiencia + plantilla + canal.
CREATE TABLE IF NOT EXISTS growth.sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  audience text NOT NULL,
  name text NOT NULL,                               -- "En riesgo · 12 nov"
  template_key text NOT NULL,
  template_text text NOT NULL,                      -- plantilla con variables tal como se usó
  channel text NOT NULL DEFAULT 'whatsapp',         -- 'whatsapp' (1 a 1 desde Cuik) | 'export' (lista para Whatzapper)
  sender_name text,                                 -- {cajero}: quién escribe
  snapshot_total integer NOT NULL DEFAULT 0,        -- clientes en la foto (incluye control)
  control_pct integer NOT NULL DEFAULT 10,
  attribution_days integer NOT NULL DEFAULT 10,     -- copiado de las reglas al crear (no cambia después)
  status text NOT NULL DEFAULT 'open',              -- 'open' | 'closed'
  created_by text REFERENCES public."user"(id),
  created_at timestamp NOT NULL DEFAULT now(),
  closed_at timestamp
);
CREATE INDEX IF NOT EXISTS sends_tenant_created_idx ON growth.sends (tenant_id, created_at);

-- Una fila por cliente del envío, con su estado y el texto exacto.
CREATE TABLE IF NOT EXISTS growth.send_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id uuid NOT NULL REFERENCES growth.sends(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  client_id uuid NOT NULL REFERENCES loyalty.clients(id) ON DELETE CASCADE,
  position integer NOT NULL,                        -- orden sugerido
  status text NOT NULL DEFAULT 'pending',           -- 'pending' | 'opened' | 'sent' | 'replied' | 'skipped' | 'control' | 'blocked'
  message_text text,                                -- mensaje ya resuelto (lo que se envió)
  opened_at timestamp,
  sent_at timestamp,                                -- el check "Enviado": arranca atribución y cooldown
  sent_by text REFERENCES public."user"(id),
  replied_at timestamp,
  UNIQUE (send_id, client_id)
);
CREATE INDEX IF NOT EXISTS send_recipients_tenant_client_sent_idx
  ON growth.send_recipients (tenant_id, client_id, sent_at);
CREATE INDEX IF NOT EXISTS send_recipients_send_status_idx ON growth.send_recipients (send_id, status);

-- Venta real del POS atribuida a un envío (una venta, un envío; nunca se copia la venta).
CREATE TABLE IF NOT EXISTS growth.attributed_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  recipient_id uuid NOT NULL REFERENCES growth.send_recipients(id) ON DELETE CASCADE,
  send_id uuid NOT NULL REFERENCES growth.sends(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES loyalty.clients(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL UNIQUE REFERENCES analytics.sales(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  sold_on date NOT NULL,                            -- día local de la venta (base del cierre mensual)
  days_after integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attributed_sales_tenant_sold_idx ON growth.attributed_sales (tenant_id, sold_on);
CREATE INDEX IF NOT EXISTS attributed_sales_send_idx ON growth.attributed_sales (send_id);

-- "No contactar": la mascota falleció, pidió no recibir, número equivocado, otro. Reversible.
CREATE TABLE IF NOT EXISTS growth.contact_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  client_id uuid NOT NULL REFERENCES loyalty.clients(id) ON DELETE CASCADE,
  reason text NOT NULL,                             -- 'pet_died' | 'asked_no_contact' | 'wrong_number' | 'other'
  note text,
  created_by text REFERENCES public."user"(id),
  created_at timestamp NOT NULL DEFAULT now(),
  lifted_by text REFERENCES public."user"(id),
  lifted_at timestamp
);
-- Un solo bloqueo vigente por cliente.
CREATE UNIQUE INDEX IF NOT EXISTS contact_blocks_active_client_idx
  ON growth.contact_blocks (client_id) WHERE lifted_at IS NULL;
CREATE INDEX IF NOT EXISTS contact_blocks_tenant_idx ON growth.contact_blocks (tenant_id, lifted_at);
