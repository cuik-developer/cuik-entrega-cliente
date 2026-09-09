# Cuik — Arquitectura Tecnica

> Documento tecnico del sistema Cuik. Alcance: stack, estructura del monorepo, schemas de BD, flujos criticos, infra.

---

## 1. Stack

### Runtime y package manager
- **Node.js 22** (alpine en Docker, requerimiento >= 18.18)
- **pnpm 10.12.1** (workspaces)
- **Turborepo 2.8.17**
- **TypeScript 5.7.3** (strict en todos los packages)

### Framework web
- **Next.js 16.1.6** (App Router, RSC, standalone build)
- **React 19.2.4** + **React DOM 19.2.4**
- **Turbopack desactivado en build** (`TURBOPACK=0`)

### Base de datos
- **PostgreSQL 16** (docker-compose local, managed en prod)
- **Drizzle ORM 0.45.1** + **drizzle-kit 0.31.9**
- **pg driver 8.20.0** (con type parser custom para `timestamp without time zone` como UTC)

### Autenticacion
- **Better Auth 1.5.5** + `@better-auth/drizzle-adapter 1.5.5`
- Plugins: `organization` (multi-tenancy), `admin` (roles)

### UI
- **Tailwind CSS 4.2.0** + `@tailwindcss/postcss`
- **shadcn/ui** sobre **Radix UI primitives** (accordion, alert-dialog, avatar, checkbox, dialog, dropdown-menu, popover, select, tabs, toast, etc.)
- **Lucide Icons 0.564.0**
- **Recharts 2.15.0** (analytics charts)
- **react-day-picker 9.13.2** (date range picker)

### Formularios y validacion
- **react-hook-form 7.54.1** + `@hookform/resolvers 3.9.1`
- **Zod 3.24.1**

### Calidad y testing
- **Biome 2.4.6** (linter + formatter — reemplaza ESLint + Prettier)
- **Vitest 3.2.4**

### Business libs
- **passkit-generator 3.5.7** (Apple Wallet `.pkpass` — **PINNED** por workaround Symbol hack para `additionalInfoFields`)
- **jose 6.0.0** (JWT para Google Wallet save links y APNs)
- **sharp 0.34.0** (image processing para pass assets)
- **node-forge 1.3.3** (criptografia)
- **qrcode 1.5.4** + **@zxing/browser 0.1.5** + **@zxing/library 0.21.3** (QR generation/scanning)
- **ExcelJS 4.4.0** (exports)
- **MinIO 8.0.7** (S3-compatible storage)
- **Resend 4.1.2** + **@react-email/components 0.0.36** + **react-email 3.0.6** (email)
- **cron-parser 5.5.0** (cron expressions en Cuik Office)
- **date-fns 4.1.0**

### State y utilidades
- **Zustand 5.0.3** + **immer 10.1.1** (editor visual de pases)
- **nanoid 5.1.2**
- **sonner 1.7.1** (toasts)

### AI
- **Gemini API** (generacion de imagenes para pases, via `GEMINI_API_KEY`)
- **Anthropic Agent API** (Cuik Office — `anthropic-beta: agent-api-2026-03-01`)

---

## 2. Estructura del monorepo

```
cuik/
├── apps/
│   └── web/                    # Next.js 16, unica app
├── packages/
│   ├── db/                     # Drizzle ORM + schemas + migrations + seed
│   ├── shared/                 # Tipos + Zod validators + constants compartidos
│   ├── editor/                 # Editor visual de pases (Zustand)
│   ├── wallet/                 # Apple/Google Wallet (passkit-generator + jose)
│   ├── email/                  # React Email templates + Resend transport
│   └── ui/                     # Re-exports de shadcn/ui components
├── docker/                     # docker-compose.yml, Dockerfile
├── docs/                       # MANUAL_DEPLOYMENT.md y otros
├── .github/workflows/          # CI/CD (deploy.yml TODO)
├── pnpm-workspace.yaml
├── turbo.json
├── biome.json
└── .env.example
```

### apps/web

Estructura de rutas por **Route Group**:

| Grupo | Rutas | Audiencia |
|---|---|---|
| `(landing)` | `/`, `/contacto` | Publico |
| `(auth)` | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/accept-invitation/[id]` | Publico (redirige si autenticado) |
| `(cajero)` | `/cajero/escanear`, `/cajero/buscar`, `/cajero/historial` | role=`user` |
| `(dashboard)` | `/panel/*` (clientes, analitica, campanas, cajeros, mi-pase, configuracion) | role=`admin` o `super_admin` |
| `(super-admin)` | `/admin/*` (solicitudes, tenants, pases, branding, planes, metricas, configuracion, office) | role=`super_admin` |
| `[tenant]` | `/{slug}/registro`, `/{slug}/bienvenido`, `/{slug}/premios` | Publico por tenant |

**API Routes principales** (`apps/web/app/api/`):
- `/api/[tenant]/*` — endpoints por tenant (info, register-client, visits, redeem, wallet/*, analytics/*, campaigns, clients/*, tags)
- `/api/admin/*` — super-admin (solicitudes, tenants, assets, generate-assets, reports/export, reports/first-visit)
- `/api/apple-wallet/v1/[...path]` — Apple Web Service Protocol (device registrations, pass updates, logs)
- `/api/auth/*` — Better Auth
- `/api/cron/*` — scheduled jobs (office-tasks, analytics-daily, analytics-retention, campaigns-scheduled)
- `/api/public/solicitudes` — lead capture publico
- `/api/assets/[...key]` — proxy publico a MinIO
- `/api/office/*` — gestion de tasks y executions de agentes

### packages/

- **@cuik/db** — schemas Drizzle (public, loyalty, passes, analytics, campaigns, office), migrations SQL generadas, seed.ts
- **@cuik/shared** — tipos TS y validators Zod reusables; constants (roles, segmentation thresholds)
- **@cuik/editor** — editor visual de `pass.json` con Zustand + immer
- **@cuik/wallet** — `apple/` (create-pass.ts, auth-token.ts, apns.ts, web-service.ts), `google/` (loyalty-object.ts, save-link.ts, auth.ts, loyalty-class.ts), `shared/` (types, helpers)
- **@cuik/email** — templates `.tsx` con `@react-email/components`; transport Resend; `pnpm dev` corre preview en puerto 3333
- **@cuik/ui** — re-exports de componentes shadcn/ui del web

---

## 3. Scripts

### Raiz
```bash
pnpm dev           # turbo dev (Next.js en 3000)
pnpm build         # turbo build
pnpm start         # next start (apps/web)
pnpm lint          # biome check .
pnpm lint:fix      # biome check --fix .
pnpm format        # biome format --write .
pnpm typecheck     # turbo typecheck (tsc --noEmit en cada package)
```

### packages/db
```bash
pnpm db:generate   # drizzle-kit generate (genera migrations a partir de schemas)
pnpm db:migrate    # drizzle-kit migrate
pnpm db:push       # drizzle-kit push (alternativo a migrate)
pnpm db:studio     # drizzle-kit studio (UI local)
pnpm db:seed       # tsx seed.ts — fetch a /api/seed (requiere server corriendo)
```

### apps/web
```bash
pnpm dev           # next dev
pnpm build         # next build (standalone output)
pnpm test          # vitest run
pnpm test:watch    # vitest
```

---

## 4. Schemas de Base de Datos

Drizzle con schemas multiples. Un solo `DATABASE_URL` apunta al cluster, y los schemas PG logicos son:

- `public` — Better Auth + tenants + plans + solicitudes + global config
- `loyalty` — clientes, visitas, rewards, locations, promotions, CRM (notes, tags)
- `passes` — pass designs, assets, instances, apple_devices
- `analytics` — visits_daily, retention_cohorts, events
- `campaigns` — campaigns, campaign_segments, notifications
- `office` — conversations, messages, tasks, executions

### 4.1 Enums globales

| Enum | Schema | Valores |
|---|---|---|
| `tenant_status` | public | pending, trial, active, expired, cancelled, paused |
| `solicitud_status` | public | pending, approved, rejected |
| `design_change_request_type` | public | color, texto, imagen, reglas, otro |
| `design_change_request_status` | public | pending, in_progress, done, rejected |
| `client_status` | loyalty | active, inactive, blocked |
| `reward_status` | loyalty | pending, redeemed, expired |
| `visit_source` | loyalty | qr, manual, bonus |
| `promo_type` | loyalty | stamps, discount, coupon, subscription, points |
| `points_tx_type` | loyalty | earn, redeem, expire, adjust |
| `pass_type` | passes | apple_store, google_loyalty |
| `asset_type` | passes | logo, icon, strip_bg, stamp, background |
| `campaign_type` | campaigns | push, wallet_update, email |
| `campaign_status` | campaigns | draft, scheduled, sending, sent, cancelled |
| `notification_channel` | campaigns | wallet_push, email |
| `notification_status` | campaigns | sent, delivered, failed |
| `conversation_role` | office | user, agent, system, tool |
| `task_status` | office | active, paused, archived |
| `execution_status` | office | running, pending_approval, approved, rejected, failed |

### 4.2 Schema `public`

**`tenants`** — comercios
```
id uuid PK
slug text UNIQUE NOT NULL
name text NOT NULL
planId uuid → plans.id
status tenant_status DEFAULT 'pending' NOT NULL
trialEndsAt, activatedAt timestamp
branding jsonb             # colores, logo url
businessType text
address, phone, contactEmail text
registrationConfig jsonb   # campos del form de registro (DNI, email, phone required/optional)
walletConfig jsonb         # locations (array con lat/lng/name/relevantText), relevantDateEnabled
segmentationConfig jsonb   # thresholds custom (newClientDays, frequentMaxDays, etc)
appleConfig jsonb          # passTypeId, teamId, signer cert (encriptado), mode
timezone text DEFAULT 'America/Lima' NOT NULL
ownerId text → user.id
createdAt, updatedAt timestamp
```

**`plans`** — planes de precios (basico, pro, enterprise)
```
id uuid PK
name text NOT NULL
price integer DEFAULT 0
maxLocations, maxPromos, maxClients integer
features jsonb
active boolean DEFAULT true
createdAt, updatedAt timestamp
```

**`solicitudes`** — leads de demo
```
id uuid PK
businessName, contactName, email text NOT NULL
businessType, phone, city text
status solicitud_status DEFAULT 'pending'
tenantId uuid → tenants.id    # se setea cuando se aprueba
notes text
createdAt timestamp
```

**`designChangeRequests`** — pedidos de cambio de diseno de pase
```
id uuid PK
tenantId uuid → tenants.id (CASCADE DELETE)
requestedByUserId text → user.id
type design_change_request_type
message text NOT NULL
status design_change_request_status DEFAULT 'pending'
resolvedByUserId text → user.id
resolvedAt timestamp
internalNotes text
createdAt, updatedAt timestamp
```

**`globalConfig`** — key-value store para configuracion de plataforma

**Better Auth tables (tambien en public):**
- `user` (id text PK, name, email UNIQUE, emailVerified, image, **role** text DEFAULT 'user', banned, banReason, banExpires, createdAt, updatedAt)
- `session` (id, expiresAt, token UNIQUE, userId → user.id CASCADE, activeOrganizationId, impersonatedBy)
- `account` (providers, passwords hashed)
- `verification` (email verification tokens)
- `organization` (id text PK, name, slug UNIQUE, logo, metadata)
- `member` (organizationId → organization.id CASCADE, userId → user.id CASCADE, role DEFAULT 'member')
- `invitation` (organizationId, email, role, status, expiresAt, inviterId)

### 4.3 Schema `loyalty`

**`clients`**
```
id uuid PK
tenantId uuid → tenants.id
name text NOT NULL
lastName, dni, phone, email, qrCode text
status client_status DEFAULT 'active'
totalVisits integer DEFAULT 0       # acumulado historico
currentCycle integer DEFAULT 1      # ciclo stamps actual
tier text                            # nombre del tier
pointsBalance integer DEFAULT 0
marketingOptIn boolean DEFAULT false
birthday date
customData jsonb
createdAt timestamp

UNIQUE (qrCode, tenantId)
UNIQUE (email, tenantId)
INDEX (tenantId, status)
INDEX (tenantId, tier)
INDEX (tenantId, pointsBalance)
INDEX (tenantId, birthday)
```

**`visits`**
```
id uuid PK
clientId uuid → clients.id
tenantId uuid → tenants.id
visitNum integer NOT NULL           # # dentro del ciclo (1..maxVisits) para stamps; para points = total acumulado del cliente
cycleNumber integer NOT NULL        # # de ciclo al que pertenece
points integer DEFAULT 0            # puntos ganados en esta visita (solo points)
source visit_source DEFAULT 'qr'    # qr | manual | bonus
registeredBy text → user.id         # cajero
amount numeric(10,2)                # monto de la compra
locationId uuid                     # sucursal
createdAt timestamp

INDEX (clientId, cycleNumber)
INDEX (tenantId, createdAt)
```

**`rewards`**
```
id uuid PK
clientId uuid → clients.id
tenantId uuid → tenants.id
cycleNumber integer NOT NULL
rewardType text                     # copia de promotion.rewardValue
status reward_status DEFAULT 'pending'
redeemedAt, expiresAt timestamp
createdAt timestamp

PARTIAL INDEX (clientId, status) WHERE status = 'pending'
```

**`locations`** — sucursales
```
id uuid PK
tenantId uuid → tenants.id
name text NOT NULL
address text
lat, lng numeric(10,7)
active boolean DEFAULT true
createdAt timestamp
```

**`promotions`** — una promo activa por tenant define el tipo de programa
```
id uuid PK
tenantId uuid → tenants.id
type promo_type NOT NULL            # stamps | points | discount | coupon | subscription
config jsonb                        # reglas, bonuses, min purchase, tiers
maxVisits integer                   # tamano del ciclo en stamps
rewardValue text                    # nombre del premio ("Cafe gratis")
active boolean DEFAULT true
createdAt timestamp
```

**`config` (jsonb) segun tipo:**

Para `stamps`:
```json
{
  "accumulation": {
    "maxVisitsPerDay": 1,
    "minimumPurchaseAmount": null | number,
    "restrictToLocations": boolean,
    "allowedLocationIds": ["uuid"],
    "doubleStampsDays": [{ "dayOfWeek": 0-6, "hourStart": 18, "hourEnd": 22 }],
    "birthdayBonus": number | null
  },
  "stamps": {
    "maxVisitsPerDay": 1,
    "rewardExpirationDays": 30
  },
  "tiers": [{ "name": "VIP", "minVisits": 10, "maxVisits": null }]
}
```

Para `points`:
```json
{
  "points": {
    "pointsPerCurrency": 1,
    "rounding": "floor" | "round" | "ceil",
    "minimumPurchaseForPoints": null | number,
    "maxVisitsPerDay": 5,
    "dayMultipliers": [{ "dayOfWeek": 5, "hourStart": 12, "hourEnd": 15, "multiplier": 2 }],
    "birthdayMultiplier": 2
  },
  "tiers": [...]
}
```

**CRM**:
- `clientNotes` — notas por cliente (content, createdBy, tenantId)
- `clientTags` — etiquetas (name, color) con UNIQUE (tenantId, name)
- `clientTagAssignments` — composite PK (clientId, tagId), CASCADE DELETE on tag
- `rewardCatalog` — items redimibles por puntos (name, pointsCost, imageUrl, category, active, sortOrder)
- `pointsTransactions` — historial de puntos (earn/redeem/expire/adjust, links a visit o catalog item)

### 4.4 Schema `passes`

**`passDesigns`**
```
id uuid PK
tenantId uuid → tenants.id
promotionId uuid → promotions.id
name text
type pass_type                      # apple_store | google_loyalty
canvasData jsonb                    # estado del editor visual
colors jsonb                        # { primary, secondary, background, foreground, label }
fields jsonb                        # { headerFields, secondaryFields, backFields, auxiliaryFields }
stampsConfig jsonb                  # config de sellos visibles
isTemplate boolean DEFAULT false
isActive boolean DEFAULT true
version integer DEFAULT 1
createdAt, updatedAt timestamp
```

**`passAssets`** — imagenes subidas por design (logo, icon, strip_bg, stamp, background)
```
id uuid PK
designId uuid → passDesigns.id
type asset_type
url text NOT NULL                   # URL en MinIO (via /api/assets/[...key])
metadata jsonb
createdAt timestamp
```

**`passInstances`** — un pase por cliente
```
id uuid PK
clientId uuid → clients.id
designId uuid → passDesigns.id
serialNumber text UNIQUE NOT NULL   # usado en Apple WSP y Google objectId
applePassUrl text                   # /api/[tenant]/wallet/apple/[clientId]/[token] o null
googleSaveUrl text                  # https://pay.google.com/gp/v/save/{jwt}
authToken text                      # HMAC-SHA256(serialNumber) para Apple WSP
etag text                           # SHA256 del .pkpass, para If-None-Match
googleObjectId text                 # {issuerId}.{sanitizedSerial}
campaignMessage text                # mensaje a mostrar en wallet tras update
lastUpdatedAt timestamp
deviceTokens text[]                 # tokens APNs historicos (legacy, primary es apple_devices)
createdAt timestamp

INDEX (clientId)
```

> **Deteccion canonica de plataforma wallet**: Apple = `applePassUrl IS NOT NULL AND <> ''`. Google = `googleSaveUrl IS NOT NULL AND <> ''`. Prioridad Apple > Google cuando ambos.

**`appleDevices`** — registro via Apple WSP
```
deviceLibId text NOT NULL
passTypeId text NOT NULL
serialNumber text NOT NULL
pushToken text                      # APNs push token

PRIMARY KEY (deviceLibId, serialNumber)
INDEX (serialNumber)
```

### 4.5 Schema `analytics`

**`visitsDaily`** — tabla pre-agregada para analytics diarios
```
tenantId uuid → tenants.id
date date NOT NULL                  # YYYY-MM-DD en tenant.timezone (NO UTC)
locationId uuid NOT NULL
totalVisits integer DEFAULT 0
uniqueClients integer DEFAULT 0
newClients integer DEFAULT 0
rewardsRedeemed integer DEFAULT 0

PRIMARY KEY (tenantId, date, locationId)
```

**`retentionCohorts`** — pre-calculada por cron
```
tenantId uuid
cohortMonth date                    # primer dia del mes de creacion
monthOffset integer                 # 0 = mes del cohort, 1 = mes siguiente, etc
clientsCount integer
retentionPct numeric(5,2)

PRIMARY KEY (tenantId, cohortMonth, monthOffset)
```

**`events`** — event log generico (uso actual minimo)

### 4.6 Schema `campaigns`

**`campaigns`**
```
id uuid PK
tenantId uuid → tenants.id
name text NOT NULL
type campaign_type                  # push | wallet_update | email
message text                        # texto con placeholders {{client.name}} etc
content jsonb
scheduledAt, sentAt timestamp
status campaign_status DEFAULT 'draft'  # draft | scheduled | sending | sent | cancelled
createdBy text → user.id
targetCount, sentCount, deliveredCount integer DEFAULT 0
createdAt, updatedAt timestamp

INDEX (tenantId, status)
PARTIAL INDEX (tenantId, scheduledAt) WHERE status = 'scheduled'
```

**`campaignSegments`** — segmentos objetivo de la campania (segmentName + filter jsonb)

**`notifications`** — log de envios
```
id uuid PK
campaignId uuid → campaigns.id
clientId uuid → clients.id
channel notification_channel        # wallet_push | email
status notification_status          # sent | delivered | failed
error text
sentAt timestamp
```

### 4.7 Schema `office`

**`conversations`** — chats con agentes (historico)
```
id uuid PK
userId text → user.id
agentId text                        # 'luna' | 'data' | ...
sessionId text                      # id de sesion Anthropic
title text
createdAt, updatedAt timestamp
```

**`messages`** — mensajes de conversacion (conversation_role, content, metadata)

**`tasks`** — tareas programables de agentes
```
id uuid PK
type text DEFAULT 'single'          # single | collaborative
title text NOT NULL
agents jsonb                        # array ['data'] o ['luna','data']
prompt text NOT NULL                # instruccion
cronExpression text                 # null = solo manual
recipients jsonb                    # emails para envio del reporte
requiresApproval boolean DEFAULT true
status task_status DEFAULT 'active'  # active | paused | archived
lastRun, nextRun timestamptz
createdBy text → user.id
createdAt, updatedAt timestamptz

INDEX (status)
INDEX (nextRun)
```

**`executions`** — historial de runs
```
id uuid PK
taskId uuid → tasks.id (CASCADE DELETE)
status execution_status             # running | pending_approval | approved | rejected | failed
output jsonb                        # { text, attachments?: [{name, url}] }
agentLogs jsonb                     # logs de cada agente con timestamps
agentsUsed jsonb                    # array de agentIds
durationMs integer
approvedBy text → user.id
approvedAt timestamptz
createdAt timestamptz

INDEX (taskId)
INDEX (status)
```

### 4.8 Migraciones

Ubicacion: `packages/db/migrations/`. No se edita una migration ya aplicada — siempre se agrega una nueva con `pnpm db:generate`.

Lista cronologica actual:
```
0000_create_schemas.sql           # crea los 5 schemas logicos
0000_purple_puck.sql              # tablas iniciales (auth, tenants, clients, visits, passes)
0001_add_wallet_columns.sql
0002_sprint7_campaigns_crm.sql    # campaigns + clientNotes + clientTags
0003_tenant_business_profile.sql
0004_plans_price_active.sql
0005_clients_email_tenant_unique.sql
0006_add_points_support.sql       # rewardCatalog + pointsTransactions
0007_dynamic_registration_fields.sql
0008_pass_promotion_binding.sql   # promotionId en passDesigns
0009_pass_campaign_message.sql
0010_wallet_engagement_config.sql
0011_visit_source_bonus.sql       # agrega 'bonus' al enum visit_source
0012_segmentation_config.sql
0013_apple_config_per_tenant.sql
0014_tenant_timezone.sql          # tenants.timezone default 'America/Lima'
0015_design_change_requests.sql
0016_office_schema.sql
0017_office_tasks.sql
```

### 4.9 Seed

`packages/db/seed.ts` hace fetch a `/api/seed` en el server de Next.js (requiere tener `pnpm dev` corriendo). Crea planes, un super admin demo, un tenant de prueba, promociones, etc.

---

## 5. Autenticacion y roles

### 5.1 Configuracion Better Auth

`apps/web/lib/auth.ts`:
- **Drizzle adapter** sobre schema `public`
- **Email + password** habilitado (passwords hasheados en `account`)
- Reset password **fire-and-forget** (sin await para prevenir timing attacks)
- **Sesion**: 7 dias de expiracion, refresh diario
- Campo custom `user.role` (default "user", no editable desde el cliente)
- Plugins: `organization()`, `admin()`

### 5.2 Roles

`packages/shared/constants/roles.ts`:
```ts
ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  USER: "user",
}

ROLE_REDIRECTS = {
  super_admin: "/admin/tenants",
  admin: "/panel",
  user: "/cajero/escanear",
}
```

### 5.3 Proteccion de rutas

**Middleware** (`apps/web/middleware.ts`):
1. Lee `session.user.role` via `auth.api.getSession({ headers })`
2. Rutas publicas (landing, registro publico, /api/*) pasan directo
3. Rutas auth (login/register): si hay sesion → redirige a `ROLE_REDIRECTS[role]`
4. Rutas protegidas: si no hay sesion → `/login`
5. Rol insuficiente → redirige a `ROLE_REDIRECTS[role]`

Reglas:
- `/panel/*` → `admin` o `super_admin`
- `/admin/*` → solo `super_admin`
- `/cajero/*` → cualquier autenticado (membership check se hace en API)

**Helpers** (`apps/web/lib/api-utils.ts`):
- `requireAuth(request)` → `{ session, error }`
- `requireRole(session, role)` → null o errorResponse 403
- `resolveTenant(slug)` → tenant activo por slug
- `requireTenantMembership(session, tenantId)` → valida que el user sea owner o member de la org vinculada al tenant
- `parsePagination(searchParams, defaults)` → `{ page, limit, offset }`

### 5.4 Asignacion de tenant

Cuando super admin aprueba una `solicitudes` row:
1. Crea `tenants` (status=`trial`, trialEndsAt=+7d)
2. Crea `user` admin con contrasena temporal
3. Crea `organization` con `slug === tenants.slug`
4. Crea `member` vinculando user → organization (role `owner`)
5. Envia email de bienvenida con credenciales

Cuando owner invita a cajero:
1. Crea `invitation` record
2. Email con link `/accept-invitation/[id]`
3. Cajero acepta → `member` record (role `member`, user.role = `user`)

`requireTenantMembership` matching: 
- `tenants.ownerId === user.id` → OK
- Sino, busca `organization WHERE slug = tenant.slug` y `member WHERE userId = user.id AND organizationId = org.id`

---

## 6. Flujo de registro de visita end-to-end

### 6.1 UI del cajero

`apps/web/app/(cajero)/cajero/escanear/page.tsx`:

1. **Step `scan`**: selecciona sucursal (obligatorio si tenant tiene >1), abre camara con `BrowserMultiFormatReader` de `@zxing/browser`. Fallback: input manual.
2. Valida formato del QR: debe matchear `cuik:...` o `MV_...`.
3. **Step `amount`** (condicional): para `points` o `stamps` con min purchase, pide monto.
4. **Step `loading`**: espera respuesta del servidor.
5. **Step `success`** / `reward` / `already` / `error` segun `result.code`.

### 6.2 API endpoint

`POST /api/[tenant]/visits` (apps/web/app/api/[tenant]/visits/route.ts):
- Valida `requireAuth` + `resolveTenant` + `requireTenantMembership`
- Llama `registerVisit({ qrCode, tenantId, cashierId, locationId, amount })`
- Si OK o `ALREADY_SCANNED_TODAY`, dispara `triggerWalletUpdate()` fire-and-forget
- Retorna `{ success, data: result }`

### 6.3 Logica de negocio

`apps/web/lib/loyalty/register-visit.ts` — todo dentro de una transaccion Drizzle:

1. **`SELECT ... FOR UPDATE`** en `clients` por (qrCode, tenantId) → lock.
2. Lee `tenants.timezone` → usado para comparaciones "hoy" en SQL.
3. Busca promo activa:
   ```sql
   SELECT * FROM promotions WHERE tenantId = $1 AND active = true LIMIT 1
   ```
4. Si `type = 'points'` → delega a `registerPointsVisit()`.
5. Si `type = 'stamps'`:
   - Cuenta visitas de hoy **en timezone del tenant**:
     ```sql
     WHERE (visits.created_at AT TIME ZONE 'UTC' AT TIME ZONE $tz)::date 
         = (NOW() AT TIME ZONE $tz)::date
       AND source IS DISTINCT FROM 'bonus'
     ```
   - Invoca `evaluateStampRules(config, context)` (ver 6.4).
   - Si rechazado → retorna codigo (ALREADY_SCANNED_TODAY, LOCATION_NOT_ALLOWED, BELOW_MINIMUM_PURCHASE, etc.).
   - Si OK: calcula `stampsToEarn` (1 + multipliers), `newTotalVisits`, cycle transitions.
   - `INSERT INTO visits (...)`
   - `UPDATE clients SET totalVisits, currentCycle, tier`
   - Si ciclo completo → `INSERT INTO rewards (status='pending', expiresAt)` por cada ciclo completado.
6. Retorna `VisitResult` con `client`, `stamps`, `cycleComplete`, `pendingRewards`, `bonusApplied`.

Despues del commit, fire-and-forget:
```ts
updateVisitsDaily(tenantId, locationId, new Date(), {
  isNewClient, tenantTimezone
}).catch(logError)
if (cycleComplete) updateRewardsRedeemed(...).catch(logError)
```

### 6.4 Rules engine

`apps/web/lib/loyalty/rules-engine.ts`:

**`evaluateStampRules(config, context)`**:
1. Max visits/day → `MAX_VISITS_REACHED`
2. Location restrictions → `LOCATION_NOT_ALLOWED`
3. Minimum purchase → `AMOUNT_REQUIRED` o `BELOW_MINIMUM_PURCHASE`
4. Stamps to earn:
   - Base 1
   - Double stamps days (match dayOfWeek + hour) → ×2
   - Birthday bonus → × birthdayBonus
5. Retorna `{ eligible, stampsToEarn, bonusReasons }`

**`evaluatePointsRules(config, context)`**:
1. Max visits/day, location checks (igual)
2. Amount > 0 → obligatorio
3. `minimumPurchaseForPoints`
4. `rawPoints = amount × pointsPerCurrency`, redondeo (floor/round/ceil)
5. Day/hour multipliers (first match wins, no stacking)
6. Birthday multiplier (stack multiplicativo)
7. Retorna `{ eligible, pointsToEarn, bonusReasons }`

**`computeTier(config, totalVisits)`**:
- Matchea `totalVisits >= minVisits && (maxVisits == null || totalVisits <= maxVisits)`.

### 6.5 Analytics update

`apps/web/lib/analytics/update-visits-daily.ts`:

```ts
updateVisitsDaily(tenantId, locationId, date, { isNewClient, tenantTimezone })
```
- Fecha bucketeada en tz del tenant: `date.toLocaleDateString("en-CA", { timeZone: tenantTimezone })`
- `INSERT ... ON CONFLICT (tenantId, date, locationId) DO UPDATE` incrementando `totalVisits +1`, `uniqueClients +1`, `newClients +1` si aplica.

```ts
updateRewardsRedeemed(tenantId, locationId, date, tenantTimezone)
```
- Solo incrementa `rewardsRedeemed`.

### 6.6 Wallet update (fire-and-forget)

En `/api/[tenant]/visits/route.ts`, funcion `triggerWalletUpdate()`:
- Busca `passInstances` del cliente.
- Resuelve `passDesigns.fields` interpolando placeholders (`{{client.name}}`, `{{stamps.current}}`, `{{points.balance}}`, `{{rewards.pending}}`, etc.).
- Actualiza `passInstances.etag` (SHA256 del nuevo pase) y `lastUpdatedAt` → trigger de refetch desde Apple Wallet.
- Para Apple: busca `apple_devices.pushToken` por serialNumber y envia APNs silent push.
- Para Google: llama `upsertLoyaltyObject()` con el nuevo estado.

---

## 7. Wallet provisioning

### 7.1 Apple Wallet

**Generacion** (`packages/wallet/src/apple/create-pass.ts`):
- `createApplePass(params)` usa `passkit-generator 3.5.7` (PINNED).
- Tipo `storeCard`.
- Colores en `rgb(r,g,b)` (Apple rechaza hex).
- Fields desde `passDesigns.fields` con fallback hard-coded.
- Barcode QR: `PKBarcodeFormatQR`, encoding `iso-8859-1`, message = `serialNumber`.
- Imagenes: strip@2x.png (750×246), strip@1x (375×123), icon.png, logo.png.
- Firma PKCS#7 con `signerCert` + `signerKey` + `wwdr` (todos PEM).

**Autenticacion** (`packages/wallet/src/apple/auth-token.ts`):
- `generateAuthToken(serialNumber, secret)` = HMAC-SHA256(secret, serialNumber).
- Se guarda en `passInstances.authToken` y se copia al `pass.json` como `authenticationToken`.
- El Web Service Protocol lo verifica con `timingSafeEqual`.

**APNs push** (`packages/wallet/src/apple/apns.ts`):
- JWT ES256 con `jose`. Headers: `alg=ES256`, `kid=APNS_KEY_ID`.
- Payload: `{ iss: teamId, iat: now }`.
- Endpoint: `api.push.apple.com/3/device/{token}` (production); fallback a `api.sandbox.push.apple.com` si 400/410.
- Headers POST: `apns-topic: {APPLE_APNS_TOPIC}`, `apns-push-type: background`, `apns-priority: 5`, `apns-expiration: 0`.
- Body: `{}` (empty = trigger refetch).
- Status 410 → token muerto (se podria limpiar en futuro).

**Web Service Protocol** (`apps/web/app/api/apple-wallet/v1/[...path]/route.ts`):

| Metodo | Path | Handler |
|---|---|---|
| GET | `/devices/{deviceLibId}/registrations/{passTypeId}` | Lista serials actualizados desde `passesUpdatedSince`. Sin auth. |
| POST | `/devices/{deviceLibId}/registrations/{passTypeId}/{serialNumber}` | Registra device con `pushToken`. Dual auth (tenant-specific + global). |
| DELETE | `/devices/{deviceLibId}/registrations/{passTypeId}/{serialNumber}` | Unregister. |
| GET | `/passes/{passTypeId}/{serialNumber}` | Devuelve `.pkpass`. Respeta `If-None-Match` vs `passInstances.etag` → 304. |
| POST | `/log` | Recibe logs del device (debug). |

URL base: `APPLE_WEBSERVICE_URL` (sin `/v1` — Apple agrega `/v1/devices/...` automaticamente).

**Multi-tenant** (`apps/web/lib/wallet/tenant-apple-config.ts`):
- Cache 5 min.
- Modo `production`: desencripta `tenants.apple_config.signerKey/signerCert` via AES-256-GCM (`ENCRYPTION_KEY`).
- Modo `demo` o null: usa env vars globales.

### 7.2 Google Wallet

**OAuth2 service account** (`packages/wallet/src/google/auth.ts`):
- JWT RS256 con jose, scope `wallet_object.issuer`.
- Intercambio en `oauth2.googleapis.com/token` (grant_type `urn:ietf:params:oauth:grant-type:jwt-bearer`).
- Cache en memoria con refresh 5 min antes de expiracion.

**Loyalty class** (`packages/wallet/src/google/loyalty-class.ts`):
- `ensureLoyaltyClass(tenant)`:
  - classId deterministico: `{issuerId}.{sanitized-tenant-name}-Loyalty`
  - GET primero → si 404 → POST (create) → 201 o 409 se tratan como success
  - Cache de classIds confirmados en memoria del modulo
- Status inicial: `UNDER_REVIEW`.

**Loyalty object** (`packages/wallet/src/google/loyalty-object.ts`):
- `upsertLoyaltyObject(obj)`:
  - PUT primero (update) → si 404 → POST (create)
  - objectId: `{issuerId}.{serialNumber con `:` reemplazado por `-`}`
  - `loyaltyPoints.label` = "Sellos" o "Puntos" segun tipo
  - `loyaltyPoints.balance.string` con texto de progreso (ej: "3 de 8 visitas | Te faltan 5 para el premio")
  - Casos especiales: reward canjeado, reward disponible
  - `barcode`: `{ type: qrCode, value: serialNumber }`
  - `state: ACTIVE`

**Save URL** (`packages/wallet/src/google/save-link.ts`):
- `buildSaveToWalletUrl(objectPayload)`:
  - JWT RS256 con payload `{ iss: client_email, aud: google, typ: savetowallet, origins: [], payload: { loyaltyObjects: [obj] } }`
  - Expiry 24h
  - URL: `https://pay.google.com/gp/v/save/{jwt}`

**No hay callback**: el save flow de Google es unidireccional. El servidor asume que si `googleSaveUrl` existe el cliente tiene el pase (es una aproximacion — no hay confirmacion real).

### 7.3 Registro inicial del pase

`apps/web/app/api/[tenant]/register-client/route.ts`:
1. Crea `clients` row
2. Genera `serialNumber` (`cuik:{uuid}` o formato custom)
3. Crea `passInstances` row
4. Si apple configurado: genera `.pkpass` URL token-based (`/api/[tenant]/wallet/apple/[clientId]/[token]`) y guarda en `applePassUrl`
5. Si google configurado: `ensureLoyaltyClass()` + `upsertLoyaltyObject()` + `buildSaveToWalletUrl()` → `googleSaveUrl`
6. Retorna al frontend los URLs para que el usuario agregue a su wallet

---

## 8. Sistema de analytics

### 8.1 Tabla pre-agregada `visits_daily`

Cada visita registrada hace upsert via `updateVisitsDaily()` (fire-and-forget). La clave compuesta `(tenantId, date, locationId)` asegura que se acumulen contadores por dia y sucursal. La fecha se calcula en **timezone del tenant**, no UTC.

### 8.2 Summary por tenant

`apps/web/lib/analytics/compute-summary.ts` → `computeAnalyticsSummary(tenantId, { from, to })`:

Queries (todas con `AT TIME ZONE` en tz del tenant para bucketeo correcto):
1. Total visits + uniqueClients en rango (COUNT desde `visits`)
2. New clients creados en rango
3. Rewards totales creados y rewards redimidos en rango (desde `rewards`)
4. Redemption rate = redeemed / created × 100
5. avgVisitsPerClient = totalVisits / uniqueClients
6. **Top clients LIFETIME** (sin filtro de rango — intencional): `COUNT(*) FROM visits WHERE tenant_id = X GROUP BY client_id ORDER BY count DESC LIMIT 10`

### 8.3 Timezone handling (patron SQL)

Todas las queries que agrupan o filtran por dia usan:
```sql
(${visits.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tenantTz})::date
```

**Gotcha importante**: `tenantTz` NO se puede pasar como parametro Drizzle (`${tz}`) si la misma expresion aparece en `SELECT` y `GROUP BY` — Drizzle asigna `$1` y `$2` distintos, y Postgres los ve como expresiones diferentes → error "must appear in GROUP BY clause". Fix: usar `sql.raw(\`'${tz}'\`)` para inlinear el literal (con sanitizacion IANA contra inyeccion).

### 8.4 Dashboard admin (`/panel`)

`apps/web/app/(dashboard)/panel/page.tsx` ejecuta 7 queries en paralelo:
- totalClients
- Visitas hoy (timezone-aware)
- Visitas esta semana (date_trunc 'week' AT TIME ZONE tz)
- Pending rewards
- New clients hoy
- Last 10 visits
- Weekly chart (to_char con dayOfWeek)

### 8.5 Analitica tenant (`/panel/analitica`)

Llama 4 endpoints:
- `GET /api/[tenant]/analytics/summary?from=&to=` → KpiCards, TopClientsTable
- `GET /api/[tenant]/analytics/visits?from=&to=&granularity=day|week|month` → VisitsChart (date cast a `YYYY-MM-DD` text para evitar drift de timezone en cliente)
- `GET /api/[tenant]/analytics/retention?months=6` → RetentionHeatmap
- `GET /api/[tenant]/analytics/wallet-distribution` → WalletDistributionChart

### 8.6 Super admin metricas (`/admin/metricas`)

`actions.ts` (server actions):
- `getDailyVisits(days)` — platform-wide con `PLATFORM_TZ = "America/Lima"` inlined via `sql.raw`
- `getPlanDistribution()` — COUNT tenants by plan
- `getTopTenants(limit)` — ranking por visitas ultimos 30d
- `getPlatformSummary()` — totales globales

### 8.7 Retention cohorts

`apps/web/lib/analytics.ts` → `calculateRetentionCohorts(tenantId)`:
- Cohort = primer mes de creacion del cliente (`to_char(created_at, 'YYYY-MM-01')`)
- Por cada cohort y offset (0..N meses despues), cuenta cuantos del cohort tuvieron ≥1 visita en ese mes
- Upsert en `retention_cohorts`
- Se corre via cron `/api/cron/analytics-retention` (diario)

### 8.8 Wallet distribution

`GET /api/[tenant]/analytics/wallet-distribution`:
```sql
WITH client_wallets AS (
  SELECT
    c.id,
    BOOL_OR(pi.apple_pass_url IS NOT NULL AND pi.apple_pass_url <> '') AS has_apple,
    BOOL_OR(pi.google_save_url IS NOT NULL AND pi.google_save_url <> '') AS has_google
  FROM loyalty.clients c
  LEFT JOIN passes.pass_instances pi ON pi.client_id = c.id
  WHERE c.tenant_id = $1
  GROUP BY c.id
)
SELECT
  SUM(CASE WHEN has_apple THEN 1 ELSE 0 END) AS apple,
  SUM(CASE WHEN has_google AND NOT has_apple THEN 1 ELSE 0 END) AS google,
  SUM(CASE WHEN NOT has_apple AND NOT has_google THEN 1 ELSE 0 END) AS none
FROM client_wallets
```

Prioridad Apple > Google (nunca double-count).

### 8.9 Campaign effectiveness

`apps/web/lib/campaigns/campaign-effectiveness.ts`:
- Por cada campaign enviada, cuenta visitas en ventana N horas post-envio
- Se cruza con clientes del segmento objetivo
- KPI: conversion rate post-campaign

---

## 9. Cuik Office — agentes AI

### 9.1 Agentes disponibles

`apps/web/lib/office/agents.ts`:

| AgentId | Emoji | Dominio | Activo | Anthropic Agent ID |
|---|---|---|---|---|
| `luna` | 🛣️ | Marketing, copywriting, growth | ✓ | `agent_011CZwMDjy5SnqPTh9wp6wwT` |
| `data` | 🟠 | Analytics, reportes, insights | ✓ | `agent_011CZxYNvwAiodCifD4nqSLL` |
| `pixel` | 🟢 | Diseno grafico | ✗ | — |
| `dev` | 🔵 | Frontend | ✗ | — |

**Skills** (inyectados como system prompt):
- `luna` — CRO, copywriting, SEO, growth, social media, email marketing
- `data` — data quality, EDA, A/B tests, cohort analysis, storytelling, stakeholder comm

### 9.2 Orquestador

`apps/web/lib/office/orchestrator.ts` (537 lineas):

- Headers Anthropic: `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-beta: agent-api-2026-03-01`
- Lee SSE stream hasta `status_idle`
- Maneja `terminated` (si hay texto acumulado, retorna)
- Acumula `content_block_delta`

**Modo single-agent** (`executeTask`):
1. Crea session con Agent API
2. Envia prompt + skills + contexto
3. Retorna texto acumulado
4. Guarda en `executions`

**Modo collaborative** (`executeCollaborativeTask`):
- N sesiones encadenadas (output del agente N → input del N+1)
- Acumula contexto

**Flujo especial Data (2 sesiones)**:

Commits historicos documentan "dividir ejecucion Data en 2 sesiones para evitar timeout":
1. **Sesion 1 (analisis)**: recibe `DB_CONTEXT` (markdown con 13 queries de `buildReportData()`), genera analisis. Guarda en `/tmp/cuik_reporte_{taskId}.md`.
2. **Sesion 2 (Excel)**: lee el markdown, genera Excel con `openpyxl` en Python container, retorna base64. Fallback: `generateReport()` con ExcelJS si falla la sesion Python.

### 9.3 Data queries

`apps/web/lib/office/data-queries.ts` (607 lineas) — `buildReportData(tenantId)` ejecuta 13 queries en paralelo:

1. Tenant summary (clientes, visitas, rewards)
2. Weekly comparison (esta semana vs anterior)
3. Top 10 clients
4. Recent visits (50 en 14 dias)
5. Visits by day of week
6. Visits by location
7. Client segmentation (pyramid por rangos de visitas)
8. Inactive clients (30+ dias)
9. Monthly retention
10. Location weekly trend
11. Wallet adoption (Apple / Google / ninguno) — logica canonica `apple_pass_url`/`google_save_url`
12. New clients by week (52 semanas)
13. Average time between visits por segmento

`formatDataContext()` genera markdown con resumen ejecutivo para el agente.

### 9.4 Reporte Excel (9 hojas)

`apps/web/lib/office/excel-generator.ts` (695 lineas):

1. Dashboard Ejecutivo (KPIs, semaforo)
2. Patrones Temporales (dia de semana, nuevos clientes)
3. Segmentacion Clientes (piramide, inactivos)
4. Retencion (cohortes, avg time between)
5. Performance por Local (visits, trend semanal)
6. Digital & Rewards (wallet adoption, redemption rate)
7. Crecimiento (new clients, top 10, visits recientes)
8. Plan de Accion (extraido del AI narrative, seccion "plan de accion")
9. Anomalias (extraido del AI narrative, seccion "anomalias" o "alertas")

Diseno: color primario `#0E70DB`, Calibri 11pt, headers blanco sobre azul, semaforo verde/amarillo/rojo por threshold.

### 9.5 Aprobacion

`POST /api/office/executions/[id]/approve` con `{ action: "approve" | "reject" }`:
- Valida super admin
- Si approve → status `approved`, setea `approvedBy`/`approvedAt`
- Envia email con template `ReporteAprobado` de `@cuik/email` usando Resend
- Destinatarios: dedup de `task.recipients` + `tenant.contactEmail`

### 9.6 Cron jobs

Todos requieren header `x-cron-secret: ${CRON_SECRET}`:

| Ruta | Frecuencia recomendada | Funcion |
|---|---|---|
| `POST /api/cron/office-tasks` | cada 5 min | Ejecuta `tasks` activas con `nextRun <= NOW()`, recalcula `nextRun` con `cron-parser` (tz `America/Lima`) |
| `POST /api/cron/analytics-daily` | 1×/dia (3 AM) | Agrega visitas de ayer por location en `visits_daily` |
| `POST /api/cron/analytics-retention` | 1×/dia (4 AM) | `calculateRetentionCohorts()` por cada tenant activo |
| `POST /api/cron/campaigns-scheduled` | cada 5 min | Ejecuta campaigns con `scheduledAt <= NOW()` y status `scheduled` |

### 9.7 Email

`packages/email/` con **Resend 4.1.2** + **React Email**:

Templates actuales:
- `BienvenidaComercio` — al aprobar solicitud (credenciales temporales + login URL)
- `ReporteAprobado` — al aprobar ejecucion de Data agent (titulo, resumen, link descarga)

Dev preview: `cd packages/email && pnpm dev` abre server en :3333.

Vars: `RESEND_API_KEY`, `EMAIL_FROM` (dominio verificado en Resend), `EMAIL_TEST_TO` (dev — redirige todo), `SA_EMAIL`.

---

## 10. Variables de entorno

Ver `.env.example` (reproduzco descripciones — valores deben generarse por env).

### Base de datos
- **`DATABASE_URL`** — connection string Postgres

### Auth
- **`BETTER_AUTH_SECRET`** — 64 hex chars (`openssl rand -hex 32`)
- **`BETTER_AUTH_URL`** — URL publica (ej `https://app.cuik.org`)
- **`TRUSTED_ORIGINS`** — CSV de orgenes permitidos

### Apple Wallet — firma
- **`APPLE_TEAM_ID`** — 10 chars (Apple Developer)
- **`APPLE_PASS_TYPE_ID`** — formato `pass.cuik.org.default`
- **`APPLE_SIGNER_KEY_BASE64`** — clave privada PEM en base64
- **`APPLE_SIGNER_CERT_BASE64`** — certificado firmante PEM en base64
- **`APPLE_SIGNER_KEY_PASSPHRASE`** — passphrase si aplica
- **`APPLE_WWDR_BASE64`** — Apple WWDR G4 en base64
- **`APPLE_AUTH_SECRET`** — HMAC secret para WSP (64 hex chars)
- **`APPLE_WEBSERVICE_URL`** — URL base **sin /v1** (Apple agrega `/v1/devices/...`)

### Apple — APNs
- **`APPLE_APNS_KEY_ID`** — Key ID del `.p8`
- **`APPLE_APNS_TEAM_ID`** — normalmente igual a `APPLE_TEAM_ID`
- **`APPLE_APNS_P8_BASE64`** — `AuthKey_*.p8` en base64
- **`APPLE_APNS_TOPIC`** — debe coincidir con `APPLE_PASS_TYPE_ID`

### Google Wallet
- **`GOOGLE_WALLET_ISSUER_ID`** — numerico (~16 digitos)
- **`GOOGLE_WALLET_SA_JSON_B64`** — Service Account JSON completo en base64

### Storage MinIO/S3
- **`MINIO_ENDPOINT`** — host:port
- **`MINIO_ACCESS_KEY`**, **`MINIO_SECRET_KEY`**
- **`MINIO_BUCKET`** — default `cuik-assets`
- **`MINIO_USE_SSL`** — true/false
- **`MINIO_ROOT_USER`**, **`MINIO_ROOT_PASSWORD`** — solo docker-compose local

### Email
- **`RESEND_API_KEY`**
- **`EMAIL_FROM`** — ej `"Cuik <noreply@cuik.org>"` (dominio verificado)
- **`EMAIL_TEST_TO`** (opcional, dev) — redirige todos los emails
- **`SA_EMAIL`** — destinatario de notificaciones super-admin

### Redis
- **`REDIS_URL`** — connection string (cache, rate limiting, queues)

### Encriptacion
- **`ENCRYPTION_KEY`** — 64 hex chars (AES-256-GCM para encriptar `appleConfig` por tenant)

### AI
- **`GEMINI_API_KEY`** — opcional, para generacion de imagenes de pase con IA
- **`ANTHROPIC_API_KEY`** — Cuik Office (Agent API)

### Aplicacion
- **`NEXT_PUBLIC_APP_URL`** — URL publica para emails y pases
- **`NODE_ENV`** — production / development
- **`CRON_SECRET`** — 64 hex chars, header `x-cron-secret` en `/api/cron/*`

---

## 11. Infraestructura y deploy

### 11.1 docker-compose (local dev)

`docker/docker-compose.yml`:
- **postgres:16-alpine** — puerto 5432, usuario `cuik:cuik_dev`, DB `cuik_dev`, volumen `postgres_data`
- **minio:latest** — puerto 9000 (API), 9001 (console), usuario `cuik_minio:cuik_minio_secret`, volumen `minio_data`. Bucket `cuik-assets` se autocrea.
- **redis:7-alpine** — puerto 6379, volumen `redis_data`
- Health checks en todos los servicios

El servicio `app` de la web **esta comentado** — se ejecuta con `pnpm dev` en host para hot-reload.

### 11.2 Dockerfile (prod)

`docker/Dockerfile` multi-stage:

**Stage 1 `deps`** — `node:22-alpine` + `corepack enable` + `pnpm install --frozen-lockfile`

**Stage 2 `builder`** — copia todo, ejecuta `TURBOPACK=0 pnpm --filter @cuik/web build` con `NODE_OPTIONS=--max-old-space-size=512` y `NEXT_TELEMETRY_DISABLED=1`.

**Stage 3 `runner`** — `node:22-alpine` + `libc6-compat` (para sharp), usuario no-root `nextjs` (UID 1001):
- Copia `.next/standalone`, `.next/static`, `public`
- Re-instala sharp y passkit-generator con flags `--platform=linux --arch=x64`
- Copia migrations para runtime
- `EXPOSE 3000`, `CMD ["node", "apps/web/server.js"]`

`next.config.mjs`:
```js
output: "standalone"
compress: false                    // no comprimir .pkpass (ya es zip firmado)
serverExternalPackages: ["sharp", "passkit-generator"]
typescript: { ignoreBuildErrors: true }
images: { unoptimized: true }
```

### 11.3 MinIO storage

`apps/web/lib/storage.ts`:
- Cliente MinIO 8.0.7
- Paths:
  - `tenants/{tenantId}/assets/{uuid}.{ext}` — assets de pases
  - `office/reports/{executionId}.xlsx` — reportes aprobados
- Funciones: `uploadAsset(key, buffer, contentType)`, `getAsset(key)`, `deleteAsset(key)`, `getPublicUrl(key)`, `generateAssetKey(tenantId, ext)`, `ensureBucket()`
- Fallback: si `MINIO_ENDPOINT` no esta configurado, usa filesystem local `.local-storage/` (solo dev).
- Acceso publico via proxy: `GET /api/assets/[...key]` valida y streamea.

### 11.4 Deploy

Opciones documentadas en `docs/MANUAL_DEPLOYMENT.md`:

**A) Dokploy en Hetzner VPS** (recomendado):
- Ubuntu 22.04+ en VPS
- `curl -sSL https://dokploy.com/install.sh | sh` para instalar
- UI para configurar: DATABASE_URL, env vars, SSL automatico (Let's Encrypt)
- Git push → webhook → rebuild container
- Costo: ~10-25 USD/mes (VPS) + dominio

**B) Vercel** — deploy directo desde GitHub, requiere DB externa. `output: "standalone"` no es estrictamente necesario pero compatible.

**C) VPS + Docker Compose manual** — control total, mas setup.

**D) Railway** — pay-as-you-go, Postgres integrado.

### 11.5 Migraciones en deploy

No corren automaticamente en build. Ejecutar manualmente tras deploy:
```bash
cd packages/db
DATABASE_URL=... pnpm db:migrate
```

En Dokploy esto se puede configurar como `post-deploy hook`.

### 11.6 CI/CD

`.github/workflows/deploy.yml` — **placeholder, incompleto**. Estructura esperada:
1. Checkout + pnpm install
2. Build Docker image
3. Push a registry (GHCR, Docker Hub)
4. Trigger webhook Dokploy

Secrets requeridos (cuando se complete): `DOKPLOY_WEBHOOK_URL`, credenciales de registry.

---

## 12. Notas criticas (gotchas documentados)

1. **`APPLE_WEBSERVICE_URL` sin `/v1`** — Apple lo agrega automaticamente en `/v1/devices/...`.
2. **Colores en pass.json deben ser `rgb(r,g,b)`** — Apple rechaza hex.
3. **`passkit-generator 3.5.7` PINNED** — workaround Symbol hack para `additionalInfoFields`.
4. **`tenants.apple_config.authSecret` encriptado** — AES-256-GCM con `ENCRYPTION_KEY` (`apps/web/lib/encryption.ts`).
5. **Timezone en GROUP BY** — usar `sql.raw(\`'${tz}'\`)` con sanitizacion IANA, no `${tz}` como parametro Drizzle.
6. **Fechas de `visits.date` (PG `date` type)** — enviar como text (`to_char(..., 'YYYY-MM-DD')`) al cliente; `new Date("YYYY-MM-DD")` en browser parsea como UTC midnight y driftea un dia en zonas UTC-N.
7. **`pg` type parser** — `packages/db/index.ts` registra parser para OID 1114 (`timestamp without time zone`) que agrega `Z` para tratarlo como UTC.
8. **Fire-and-forget `updateVisitsDaily`** — se ejecuta despues del commit, sin await. Errores solo van a logs.
9. **No hay callback de Google Wallet save** — la adopcion Google se infiere de `googleSaveUrl IS NOT NULL`, no es confirmable.
10. **Apple device confirmation via WSP** — el registro POST en `/devices/.../registrations/...` es la unica confirmacion real de instalacion del pase.

---

*Fin de documento tecnico. Ver `Dev/FUNCIONALIDADES.md` para documentacion de producto.*
