# PRD: Cuik — Plataforma de Fidelización Digital para Comercios Físicos

> **Pases de fidelización en Apple & Google Wallet. Editor visual de pases. Activación manual por Super Admin con generación IA. Todo en un monorepo.**

**Version**: 0.2.0-draft
**Author**: Gian Diego Javes × Cuik Team
**Date**: 2026-03-13
**Status**: Draft

---

## 1. Problem Statement

Los comercios físicos en Latinoamérica (cafés, barberías, veterinarias, restaurantes, tiendas) necesitan fidelizar a sus clientes pero no tienen herramientas accesibles. Las tarjetas de cartón se pierden, no generan data, y no escalan.

**Cuik resuelve esto** con tarjetas de fidelización digitales integradas en Apple & Google Wallet — sin necesidad de que el cliente descargue una app.

### El problema actual de Cuik

Cuik ya tiene un producto funcional con integraciones técnicas profundas (Apple Wallet Web Service Protocol completo, Google Wallet API directa, generación dinámica de strip images), pero la ejecución técnica necesita reorientarse:

1. **5 repos duplicados** — mv-* (single-tenant) y demo-* (multi-tenant) hacen lo mismo con variaciones menores
2. **JavaScript puro** — zero TypeScript en una plataforma con lógica de negocio compleja
3. **Zero tests** — ninguna red de seguridad
4. **Fat routes** — toda la lógica de negocio vive en handlers de API de Next.js
5. **Sin editor de pases** — la configuración es manual, sin UI para el comercio
6. **Sin panel de admin** — no hay forma de gestionar clientes, activar tenants, o ver analítica centralizada
7. **Sin onboarding** — cada nuevo comercio requiere setup manual por el equipo de Cuik
8. **Credenciales en Git** — `service_account.json` commiteado en 2 repos

### El competidor más cercano

**UEIA** (ueia.tech) es una plataforma peruana que ya ofrece:
- 4 mecánicas de fidelización (Cuik tiene 1)
- Self-service onboarding ("listo en 10 minutos")
- Prueba gratis de 14 días
- Pricing público en soles (S/69 - S/289/mes)
- Notificaciones geolocalizadas
- CRM con analítica avanzada

**Pero UEIA fue construido con Lovable/GPT Engineer** — velocidad de shipping alta, profundidad técnica limitada. Cuik tiene la profundidad técnica pero le falta velocidad de shipping y UX.

**La ventana para diferenciarse es ahora.**

---

## 2. Vision

**Cuik: la plataforma de fidelización wallet-native más completa de Latinoamérica.**

Un monorepo. Un codebase. Múltiples tenants. Editor visual de pases con drag-and-drop. Activación manual por Super Admin con generación IA. Deploy en Docker sobre VPS propio.

**Before**: 5 repos JavaScript duplicados, sin editor, sin admin, sin onboarding, cada cliente requiere setup manual.

**After**: Un monorepo TypeScript con editor visual de pases en panel SA, flujo de alta de comercios con IA, panel operativo para comercios, y deploy automatizado en Docker.

### El modelo de negocio

Cuik **NO es un SaaS self-service con cobro automático**. Es una plataforma de fidelización con **activación manual por el Super Admin (SA)**. El registro desde el landing NO crea usuario ni tenant — crea una **solicitud (lead)** que el SA revisa y gestiona.

1. El cliente potencial envía una solicitud desde el landing (formulario de contacto)
2. El Super Admin recibe la solicitud (email + notificación en panel SA)
3. El Super Admin da de alta al comercio: crea tenant, genera pase con IA (nano-banana), define tema/branding, genera credenciales de acceso
4. El Super Admin envía email al comercio con credenciales + demo funcional de 7 días
5. El comercio prueba la demo, envía assets reales (logo, colores) para el diseño final
6. El Super Admin personaliza el pase con los assets reales en el editor visual
7. El Super Admin activa el plan → comercio queda 100% funcional
8. El cobro es 100% externo (transferencia bancaria, Yape, etc.) — la app solo activa/desactiva planes y define límites

---

## 3. Target Users

### Usuarios del sistema

| Rol | Quién es | Qué hace |
|-----|----------|----------|
| **Super Admin** | Equipo Cuik | Gestiona TODO: tenants, admins, planes, configuración global, métricas de plataforma |
| **Admin** (Tenant Admin) | Dueño del comercio | Gestiona SU negocio: cajeros, clientes, pases, analítica, campañas |
| **User** (Cajero) | Empleado del comercio | Escanea QR, registra visitas, canjea premios |
| **Cliente Final** | Consumidor | Se registra, recibe pase en wallet, acumula visitas |

### Comercios target

- Cafeterías y pastelerías
- Barberías y salones de belleza
- Veterinarias y pet shops
- Restaurantes y comida rápida
- Gimnasios y studios (yoga, pilates)
- Tiendas retail y boutiques
- Autolavados
- Cualquier comercio físico con clientes recurrentes

### Mercado

- LATAM loyalty market: $4.35B (2024) → $8.7B (2029), 14.4% CAGR
- Perú: 81% smartphone penetration, Yape con 14M usuarios activos
- 70% de usuarios globales prefieren wallets que integren loyalty
- Nadie en LATAM combina Apple/Google Wallet + WhatsApp para loyalty

---

## 4. Technical Architecture

### 4.1 Technology Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| **Monorepo** | Turborepo | 2.8+ | Monorepo management con caching agresivo, pipelines composables, integración nativa con Next.js |
| **Framework** | Next.js | 16+ | App Router, Server Actions, API Routes, Middleware, SSR/SSG — frontend y backend en uno |
| **Language** | TypeScript | 5+ | Type safety en todo el stack. Zero JavaScript. |
| **UI** | Tailwind CSS 4 + shadcn/ui | 4.2+ / latest | CSS-first config, 5x faster builds, componentes accesibles copy-paste |
| **ORM** | Drizzle ORM | 1.0-beta+ | Multi-schema PostgreSQL, RLS, migraciones declarativas, type-safe, zero abstraction |
| **Database** | PostgreSQL | 16+ | Multi-schema, RLS, funciones/RPCs, JSONB, full-text search |
| **Auth** | Better Auth | 1.5+ | Multi-tenant con organizations, RBAC built-in (super_admin/admin/user), 2FA, rate limiting |
| **Validation** | Zod | 4.3+ | 14x más rápido que v3, `.toJSONSchema()` nativo, `@zod/mini` para frontend |
| **Visual Editor** | react-konva (Konva.js) | 19+ | Canvas 2D con drag-and-drop, resize, rotate, layers — editor "mini Canva" para pases |
| **DnD Toolbox** | @dnd-kit | 6.3+ | Drag-and-drop del sidebar al canvas del editor |
| **Email** | Resend + React Email | 5.0+ | Emails como componentes React con Tailwind 4, delivery confiable |
| **Image Processing** | sharp | 0.34+ | SVG→PNG para generación dinámica de strip images en pases |
| **Apple Wallet** | passkit-generator | 3.5+ | Generación y firma de .pkpass, Web Service Protocol completo |
| **Google Wallet** | google-auth-library + REST API | 10+ | Loyalty objects, JWT save links, upserts |
| **File Upload** | MinIO (S3-compatible) | latest | Self-hosted object storage para logos, stamps, backgrounds — sin dependencia externa |
| **Real-time** | Server-Sent Events (SSE) | native | Notificaciones en tiempo real al admin panel (nuevos registros, etc.) |
| **QR Scanner** | @zxing/browser | 0.1+ | Scanner de QR por cámara en el panel de cajero |
| **Deployment** | Docker + Dokploy | latest | Self-hosted PaaS sobre VPS Linux, auto-SSL, push-to-deploy |
| **CI/CD** | GitHub Actions | — | Build, test, lint, deploy automático |

### 4.2 Monorepo Structure

```
cuik/
├── apps/
│   ├── web/                          # Next.js 16 — la aplicación principal
│   │   ├── app/
│   │   │   ├── page.tsx              # Landing page (hero, features, pricing, CTA)
│   │   │   ├── (landing)/            # Páginas públicas adicionales
│   │   │   │   ├── registro/         # Formulario de registro de comercio → /registro
│   │   │   │   └── contacto/         # Formulario de contacto → /contacto
│   │   │   ├── (auth)/               # Auth pages
│   │   │   │   ├── login/            # → /login
│   │   │   │   ├── register/         # → /register
│   │   │   │   └── forgot-password/  # → /forgot-password
│   │   │   ├── (dashboard)/          # Panel admin comercio — URLs bajo /panel/* (protegido)
│   │   │   │   ├── layout.tsx        # Sidebar + header admin (wraps /panel/*)
│   │   │   │   └── panel/            # Segmento de URL real
│   │   │   │       ├── page.tsx      # Dashboard overview → /panel
│   │   │   │       ├── clientes/     # Gestión de clientes → /panel/clientes
│   │   │   │       ├── mi-pase/      # Vista solo lectura del pase actual → /panel/mi-pase
│   │   │   │       ├── analitica/    # CRM y analytics → /panel/analitica
│   │   │   │       ├── campanas/     # Notificaciones push → /panel/campanas
│   │   │   │       ├── cajeros/      # Gestión de cajeros (magic link) → /panel/cajeros
│   │   │   │       └── configuracion/ # Settings del tenant (solo lectura plan/tema) → /panel/configuracion
│   │   │   ├── (super-admin)/        # Panel super admin — URLs bajo /admin/* (protegido)
│   │   │   │   ├── layout.tsx        # Sidebar super admin (wraps /admin/*)
│   │   │   │   └── admin/            # Segmento de URL real
│   │   │   │       ├── tenants/      # Solicitudes + CRUD de tenants → /admin/tenants
│   │   │   │       ├── editor/       # Editor visual de pases (por tenant) → /admin/editor
│   │   │   │       ├── branding/     # Tema/branding por tenant → /admin/branding
│   │   │   │       ├── planes/       # Gestión de planes (límites, sin cobro) → /admin/planes
│   │   │   │       ├── metricas/     # Métricas de plataforma → /admin/metricas
│   │   │   │       └── configuracion/ # Config global → /admin/configuracion
│   │   │   ├── (cajero)/             # Panel de cajero — URLs bajo /cajero/* (protegido)
│   │   │   │   ├── layout.tsx        # Header + tabs cajero (wraps /cajero/*)
│   │   │   │   └── cajero/           # Segmento de URL real (login: selección comercio + PIN)
│   │   │   │       ├── escanear/     # QR scanner → /cajero/escanear
│   │   │   │       ├── buscar/       # Búsqueda de clientes → /cajero/buscar
│   │   │   │       └── historial/    # Historial de transacciones → /cajero/historial
│   │   │   ├── [tenant]/             # Rutas dinámicas por tenant → /:slug/*
│   │   │   │   ├── registro/         # Registro de clientes del comercio
│   │   │   │   └── bienvenido/       # Success page con wallet download
│   │   │   └── api/
│   │   │       ├── auth/             # Better Auth endpoints
│   │   │       ├── webhooks/         # Webhooks entrantes
│   │   │       ├── solicitudes/      # Solicitudes de comercio (leads) — público: POST, SA: GET/PATCH
│   │   │       ├── apple-wallet/     # Web Service Protocol (APNS, device registration)
│   │   │       ├── google-wallet/    # Google Wallet API
│   │   │       ├── passes/           # Generación y actualización de pases
│   │   │       ├── visits/           # Registro de visitas
│   │   │       ├── rewards/          # Canje de premios
│   │   │       ├── admin/            # Endpoints SA: tenants, planes, branding, credenciales
│   │   │       ├── clients/          # CRUD clientes
│   │   │       ├── analytics/        # Endpoints de analítica
│   │   │       ├── campaigns/        # Push notifications
│   │   │       ├── upload/           # File uploads (MinIO)
│   │   │       └── ai/              # Generación de demos con IA + investigación de comercio
│   │   ├── middleware.ts             # Auth + tenant resolution
│   │   ├── next.config.ts
│   │   └── package.json
│   └── docs/                         # Documentación (opcional, futuro)
├── packages/
│   ├── db/                           # Drizzle schema + migraciones
│   │   ├── schema/
│   │   │   ├── public.ts            # Schema público (tenants, planes, solicitudes/leads)
│   │   │   ├── auth.ts              # Better Auth tables (user, session, account, etc.) — live in public schema
│   │   │   ├── loyalty.ts           # Schema de loyalty (clients, visits, rewards)
│   │   │   ├── passes.ts            # Schema de pases (designs, templates, assets)
│   │   │   ├── campaigns.ts         # Schema de campañas (notifications, segments)
│   │   │   └── analytics.ts         # Schema de analytics (events, metrics)
│   │   ├── migrations/
│   │   ├── seed.ts
│   │   ├── index.ts                 # DB client + schema exports
│   │   └── drizzle.config.ts
│   ├── wallet/                       # Lógica de Apple/Google Wallet
│   │   ├── apple/
│   │   │   ├── generate.ts          # Generación de .pkpass
│   │   │   ├── web-service.ts       # Web Service Protocol handlers
│   │   │   ├── push.ts             # APNS push notifications
│   │   │   └── types.ts
│   │   ├── google/
│   │   │   ├── generate.ts          # Loyalty objects + save links
│   │   │   ├── upsert.ts           # Update existing objects
│   │   │   └── types.ts
│   │   └── shared/
│   │       ├── strip-generator.ts   # SVG→PNG strip image generation
│   │       ├── qr.ts               # QR code normalization
│   │       └── types.ts
│   ├── editor/                       # Lógica del editor visual de pases
│   │   ├── components/
│   │   │   ├── canvas.tsx           # Konva canvas principal
│   │   │   ├── toolbar.tsx          # Herramientas del editor
│   │   │   ├── sidebar.tsx          # Panel de elementos arrastrables
│   │   │   ├── properties.tsx       # Panel de propiedades del elemento seleccionado
│   │   │   ├── preview.tsx          # Preview en tiempo real del pase
│   │   │   └── elements/
│   │   │       ├── stamp.tsx        # Elemento sello/estampilla
│   │   │       ├── image.tsx        # Elemento imagen
│   │   │       ├── text.tsx         # Elemento texto
│   │   │       └── shape.tsx        # Elemento forma (rect, circle)
│   │   ├── hooks/
│   │   │   ├── use-editor.ts       # Estado del editor (Zustand store)
│   │   │   ├── use-history.ts      # Undo/redo
│   │   │   └── use-export.ts       # Exportar diseño a PNG/SVG
│   │   ├── types.ts
│   │   └── index.ts
│   ├── email/                        # Templates de email
│   │   ├── templates/
│   │   │   ├── welcome-client.tsx   # Bienvenida al cliente registrado
│   │   │   ├── welcome-tenant.tsx   # Bienvenida al comercio
│   │   │   ├── new-registration.tsx # Notificación al admin: nuevo registro
│   │   │   ├── trial-activated.tsx  # Trial de 7 días activado
│   │   │   ├── trial-expiring.tsx   # Trial por vencer
│   │   │   └── plan-activated.tsx   # Plan activado
│   │   └── index.ts
│   ├── ui/                           # Componentes UI compartidos (shadcn/ui)
│   │   ├── components/
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── data-table.tsx
│   │   │   ├── ... (shadcn components)
│   │   │   └── index.ts
│   │   ├── lib/
│   │   │   └── utils.ts
│   │   └── package.json
│   └── shared/                       # Tipos, constantes, utils compartidos
│       ├── types/
│       │   ├── tenant.ts
│       │   ├── user.ts
│       │   ├── pass.ts
│       │   ├── visit.ts
│       │   └── index.ts
│       ├── constants/
│       │   ├── pass-dimensions.ts   # Dimensiones fijas de pases Apple/Google
│       │   ├── roles.ts             # Roles y permisos
│       │   └── plans.ts             # Definición de planes
│       ├── validators/               # Schemas Zod compartidos
│       │   ├── tenant.ts
│       │   ├── client.ts
│       │   ├── visit.ts
│       │   └── pass-design.ts
│       └── utils/
│           ├── normalize-qr.ts
│           └── format.ts
├── docker/
│   ├── Dockerfile                    # Multi-stage build para Next.js
│   ├── Dockerfile.db                 # PostgreSQL con extensiones
│   ├── docker-compose.yml            # Dev environment completo
│   ├── docker-compose.prod.yml       # Producción
│   └── .env.example
├── turbo.json                        # Turborepo pipeline config
├── package.json                      # Root workspace
├── tsconfig.json                     # Base TypeScript config
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Lint + test + typecheck
│       └── deploy.yml                # Build + push Docker + deploy to VPS
├── CLAUDE.md                         # Instrucciones para AI agents
├── AGENTS.md                         # Coding standards para GGA
└── README.md
```

### 4.3 Database Architecture — PostgreSQL Multi-Schema

La base de datos usa **esquemas de PostgreSQL** para separar dominios lógicos, con **roles** para control de acceso a nivel de DB.

#### Schemas

```
PostgreSQL
├── public                    # Entidades de plataforma (tenants, planes, solicitudes/leads, config global)
├── auth                      # Autenticación y autorización (users, sessions, roles)
├── loyalty                   # Core de fidelización (clients, visits, rewards, cycles)
├── passes                    # Diseño y generación de pases (designs, templates, assets)
├── campaigns                 # Campañas y notificaciones (push, segments, schedules)
└── analytics                 # Eventos y métricas (visits_daily, retention, churn)
```

#### Roles de Base de Datos

| DB Role | PostgreSQL Role | Schemas Accesibles | Uso |
|---------|----------------|-------------------|-----|
| `cuik_super_admin` | SUPERUSER-like | ALL schemas, ALL operations | Migraciones, admin de plataforma |
| `cuik_admin` | Tenant-scoped | loyalty, passes, campaigns (filtered by tenant_id) | Panel de admin del comercio |
| `cuik_user` | Read-limited | loyalty (read visits, write visits via RPC) | Panel de cajero |
| `cuik_public` | Minimal | public (read plans, tenants metadata) | Landing, registro |

#### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  SCHEMA: public                                                                      │
│                                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐                       │
│  │   tenants     │    │    plans      │    │  global_config   │                       │
│  ├──────────────┤    ├──────────────┤    ├──────────────────┤                       │
│  │ id (uuid PK) │    │ id (uuid PK) │    │ key (text PK)    │                       │
│  │ slug (unique)│    │ name         │    │ value (jsonb)    │                       │
│  │ name         │◄───│ max_locations│    │ updated_at       │                       │
│  │ plan_id (FK) │    │ max_promos   │    └──────────────────┘                       │
│  │ status       │    │ max_clients  │                                                │
│  │ trial_ends_at│    │ features     │    ┌──────────────────┐                       │
│  │ activated_at │    │ (jsonb)      │    │  solicitudes      │                       │
│  │ branding     │    └──────────────┘    │  (leads)          │                       │
│  │  (jsonb)     │                        ├──────────────────┤                       │
│  │ created_at   │                        │ id (uuid PK)     │                       │
│  │ owner_id(FK) │                        │ business_name    │                       │
│  └──────────────┘                        │ business_type    │                       │
│                                          │ contact_name     │                       │
│                                          │ email            │                       │
│                                          │ phone            │                       │
│                                          │ city             │                       │
│                                          │ status (enum)    │                       │
│                                          │   pending        │                       │
│                                          │   approved       │                       │
│                                          │   rejected       │                       │
│                                          │ tenant_id (FK)   │                       │
│                                          │   (null until    │                       │
│                                          │    SA creates)   │                       │
│                                          │ notes (text)     │                       │
│                                          │ created_at       │                       │
│                                          └──────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│  SCHEMA: public (Better Auth tables — managed by Better Auth, defined in auth.ts)    │
│                                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐        │
│  │    user       │  │   session    │  │   account    │  │  organization    │        │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤  ├──────────────────┤        │
│  │ id (text PK) │  │ id (text PK) │  │ id (text PK) │  │ id (text PK)     │        │
│  │ email        │◄─│ user_id (FK) │  │ user_id (FK) │  │ name             │        │
│  │ name         │  │ token        │  │ provider_id  │  │ slug (UNIQUE)    │        │
│  │ role (text)  │  │ expires_at   │  │ password     │  │ created_at       │        │
│  │ email_verified│ │ ip_address   │  └──────────────┘  └──────────────────┘        │
│  │ banned       │  │ user_agent   │  ┌──────────────┐  ┌──────────────────┐        │
│  │ created_at   │  └──────────────┘  │   member     │  │  invitation      │        │
│  └──────────────┘                    ├──────────────┤  ├──────────────────┤        │
│                                      │ org_id (FK)  │  │ org_id (FK)      │        │
│  NOTE: Roles via user.role field:    │ user_id (FK) │  │ email            │        │
│  super_admin, admin, user (cajero)   │ role (text)  │  │ inviter_id (FK)  │        │
│  Org membership via member table     └──────────────┘  └──────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│  SCHEMA: loyalty                                                                     │
│                                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐                       │
│  │   clients     │    │    visits     │    │    rewards       │                       │
│  ├──────────────┤    ├──────────────┤    ├──────────────────┤                       │
│  │ id (uuid PK) │    │ id (uuid PK) │    │ id (uuid PK)     │                       │
│  │ tenant_id FK │◄───│ client_id FK │    │ client_id (FK)   │                       │
│  │ name         │    │ tenant_id FK │    │ tenant_id (FK)   │                       │
│  │ last_name    │    │ visit_num    │    │ cycle_number     │                       │
│  │ dni (unique/ │    │ cycle_number │    │ reward_type      │                       │
│  │   tenant)    │    │ points       │    │ status           │                       │
│  │ phone        │    │ source       │    │   pending        │                       │
│  │ email        │    │   (qr/manual)│    │   redeemed       │                       │
│  │ qr_code      │    │ registered_by│    │   expired        │                       │
│  │ status       │    │ amount       │    │ redeemed_at      │                       │
│  │   active     │    │ location_id  │    │ expires_at       │                       │
│  │   inactive   │    │ created_at   │    │ created_at       │                       │
│  │   blocked    │    └──────────────┘    └──────────────────┘                       │
│  │ total_visits │                                                                    │
│  │ current_cycle│    ┌──────────────┐    ┌──────────────────┐                       │
│  │ tier         │    │  locations    │    │   promotions     │                       │
│  │ marketing_   │    ├──────────────┤    ├──────────────────┤                       │
│  │  opt_in      │    │ id (uuid PK) │    │ id (uuid PK)     │                       │
│  │ created_at   │    │ tenant_id FK │    │ tenant_id (FK)   │                       │
│  └──────────────┘    │ name         │    │ type (enum)      │                       │
│                      │ address      │    │   stamps         │                       │
│                      │ lat/lng      │    │   discount       │                       │
│                      │ active       │    │   coupon          │                       │
│                      └──────────────┘    │   subscription   │                       │
│                                          │ config (jsonb)   │                       │
│                                          │ max_visits       │                       │
│                                          │ reward_value     │                       │
│                                          │ active           │                       │
│                                          └──────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│  SCHEMA: passes                                                                      │
│                                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐               │
│  │  pass_designs     │    │  pass_assets      │    │  pass_instances  │               │
│  ├──────────────────┤    ├──────────────────┤    ├──────────────────┤               │
│  │ id (uuid PK)     │    │ id (uuid PK)     │    │ id (uuid PK)     │               │
│  │ tenant_id (FK)   │    │ design_id (FK)   │    │ client_id (FK)   │               │
│  │ name             │◄───│ type (enum)      │    │ design_id (FK)   │               │
│  │ type (enum)      │    │   logo           │    │ serial_number    │               │
│  │   apple_store    │    │   icon           │    │ apple_pass_url   │               │
│  │   google_loyalty │    │   strip_bg       │    │ google_save_url  │               │
│  │ canvas_data      │    │   stamp          │    │ last_updated_at  │               │
│  │   (jsonb - full  │    │   background     │    │ device_tokens[]  │               │
│  │    Konva state)  │    │ url (text)       │    │ created_at       │               │
│  │ colors (jsonb)   │    │ metadata (jsonb) │    └──────────────────┘               │
│  │   bg_color       │    │   width, height  │                                       │
│  │   fg_color       │    │   position_x/y   │    ┌──────────────────┐               │
│  │   label_color    │    │ created_at       │    │  apple_devices   │               │
│  │ fields (jsonb)   │    └──────────────────┘    ├──────────────────┤               │
│  │ stamps_config    │                            │ device_lib_id    │               │
│  │   (jsonb)        │                            │ pass_type_id     │               │
│  │ is_template      │                            │ serial_number    │               │
│  │ is_active        │                            │ push_token       │               │
│  │ version          │                            │ created_at       │               │
│  │ created_at       │                            └──────────────────┘               │
│  │ updated_at       │                                                               │
│  └──────────────────┘                                                               │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│  SCHEMA: campaigns                                                                   │
│                                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐               │
│  │   campaigns      │    │ campaign_segments │    │  notifications   │               │
│  ├──────────────────┤    ├──────────────────┤    ├──────────────────┤               │
│  │ id (uuid PK)     │    │ id (uuid PK)     │    │ id (uuid PK)     │               │
│  │ tenant_id (FK)   │    │ campaign_id (FK) │    │ campaign_id (FK) │               │
│  │ name             │◄───│ filter (jsonb)   │    │ client_id (FK)   │               │
│  │ type (enum)      │    │   tier           │    │ channel (enum)   │               │
│  │   push           │    │   last_visit_ago │    │   wallet_push    │               │
│  │   wallet_update  │    │   location       │    │   email          │               │
│  │   email          │    │   visit_count    │    │ status           │               │
│  │ content (jsonb)  │    └──────────────────┘    │   sent           │               │
│  │ scheduled_at     │                            │   delivered      │               │
│  │ sent_at          │                            │   failed         │               │
│  │ status           │                            │ sent_at          │               │
│  │ created_at       │                            └──────────────────┘               │
│  └──────────────────┘                                                               │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│  SCHEMA: analytics                                                                   │
│                                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐               │
│  │  visits_daily     │    │ retention_cohorts │    │   events         │               │
│  ├──────────────────┤    ├──────────────────┤    ├──────────────────┤               │
│  │ tenant_id (FK)   │    │ tenant_id (FK)   │    │ id (uuid PK)     │               │
│  │ date             │    │ cohort_month     │    │ tenant_id (FK)   │               │
│  │ location_id (FK) │    │ month_offset     │    │ event_type       │               │
│  │ total_visits     │    │ clients_count    │    │ payload (jsonb)  │               │
│  │ unique_clients   │    │ retention_pct    │    │ created_at       │               │
│  │ new_clients      │    └──────────────────┘    └──────────────────┘               │
│  │ rewards_redeemed │                                                               │
│  │ PK(tenant,date,  │                                                               │
│  │    location)     │                                                               │
│  └──────────────────┘                                                               │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

#### PostgreSQL Functions (RPCs)

Migradas desde Supabase, ahora como funciones nativas de PostgreSQL:

| Function | Schema | Purpose |
|----------|--------|---------|
| `loyalty.register_visit(p_qr_code, p_location_id, p_registered_by, p_amount)` | loyalty | Registrar visita, validar límites diarios, avanzar ciclo, crear reward si completa |
| `loyalty.redeem_reward(p_reward_id, p_redeemed_by)` | loyalty | Canjear premio, validar estado y expiración |
| `loyalty.get_client_status(p_qr_code, p_tenant_id)` | loyalty | Estado completo del cliente: visitas, ciclo actual, rewards pendientes, tier |
| `analytics.refresh_daily_stats(p_tenant_id, p_date)` | analytics | Recalcular métricas diarias desde visits |
| `analytics.calculate_retention(p_tenant_id, p_cohort_month)` | analytics | Calcular cohorte de retención mensual |

#### Índices Críticos

```sql
-- Búsqueda de clientes por QR (más usado)
CREATE UNIQUE INDEX idx_clients_qr_tenant ON loyalty.clients(qr_code, tenant_id);

-- Visitas por cliente para ciclos
CREATE INDEX idx_visits_client_cycle ON loyalty.visits(client_id, cycle_number);

-- Visitas por tenant para analytics
CREATE INDEX idx_visits_tenant_date ON loyalty.visits(tenant_id, created_at);

-- Rewards pendientes
CREATE INDEX idx_rewards_pending ON loyalty.rewards(client_id, status) WHERE status = 'pending';

-- Tenant por slug (middleware resolution)
CREATE UNIQUE INDEX idx_tenants_slug ON public.tenants(slug);

-- Pass instances por cliente
CREATE INDEX idx_pass_instances_client ON passes.pass_instances(client_id);

-- Apple devices para push
CREATE INDEX idx_apple_devices_serial ON passes.apple_devices(serial_number);
```

### 4.4 Authentication & Authorization Architecture

#### Better Auth Configuration

```
Better Auth
├── Providers
│   ├── Email + Password (primary)
│   ├── Magic Link (para cajeros, simplifica acceso)
│   └── Google OAuth (opcional, futuro)
├── Organizations (= Tenants)
│   ├── Owner = Admin del comercio
│   ├── Members = Cajeros
│   └── Invitations via email
├── Roles
│   ├── super_admin → Acceso total a la plataforma
│   ├── admin → Owner del tenant, acceso a su panel
│   └── user → Cajero, acceso a scanner y búsqueda
└── Sessions
    ├── Database-backed (PostgreSQL)
    ├── HTTP-only cookies
    └── Automatic refresh
```

#### Middleware de Autorización

```
Request → Next.js Middleware
    │
    ├── /(landing)/* → Public, no auth needed
    ├── /(auth)/* → Redirect if already logged in
    ├── /[tenant]/registro/* → Public, tenant resolution only
    │
    ├── /(dashboard)/* → Requires auth + role: admin
    │   └── Resolve tenant from user's organization
    │
    ├── /(super-admin)/* → Requires auth + role: super_admin
    │
    ├── /(cajero)/* → Requires auth + role: user OR admin
    │   └── Resolve tenant from user's organization
    │
    └── /api/* → Route-level auth checks
        ├── /api/auth/* → Better Auth handles
        ├── /api/apple-wallet/* → Token-based (pass auth_secret)
        └── /api/* → Session-based + role check
```

### 4.5 Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│  VPS Linux (Hetzner / DigitalOcean / Contabo)           │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Dokploy (self-hosted PaaS)                        │ │
│  │                                                     │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │ │
│  │  │  Traefik     │  │  Next.js    │  │ PostgreSQL│ │ │
│  │  │  (reverse    │──│  (Docker)   │──│ (Docker)  │ │ │
│  │  │   proxy +    │  │  Port 3000  │  │ Port 5432 │ │ │
│  │  │   auto-SSL)  │  │             │  │           │ │ │
│  │  └─────────────┘  └─────────────┘  └───────────┘ │ │
│  │                                                     │ │
│  │  ┌─────────────┐  ┌─────────────┐                 │ │
│  │  │  MinIO       │  │  Redis      │                 │ │
│  │  │  (S3 storage)│  │  (cache +   │                 │ │
│  │  │  Port 9000   │  │   sessions) │                 │ │
│  │  └─────────────┘  │  Port 6379  │                 │ │
│  │                    └─────────────┘                 │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  DNS: cuik.app → VPS IP                                 │
│  SSL: Auto via Let's Encrypt (Traefik)                  │
│  Subdomains: *.cuik.app → same VPS                     │
└─────────────────────────────────────────────────────────┘
```

#### Docker Compose (Producción)

```yaml
# docker-compose.prod.yml (conceptual)
services:
  web:
    build:
      context: .
      dockerfile: docker/Dockerfile
      target: production
    environment:
      - DATABASE_URL=postgresql://cuik_app:${DB_PASSWORD}@db:5432/cuik
      - MINIO_ENDPOINT=minio:9000
      - REDIS_URL=redis://redis:6379
      - BETTER_AUTH_SECRET=${AUTH_SECRET}
      - APPLE_WALLET_CERT_BASE64=${APPLE_CERT}
      - APPLE_WALLET_KEY_BASE64=${APPLE_KEY}
      - GOOGLE_SERVICE_ACCOUNT=${GOOGLE_SA_JSON}
      - RESEND_API_KEY=${RESEND_KEY}
    ports:
      - "3000:3000"
    depends_on:
      - db
      - redis
      - minio

  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/init-schemas.sql:/docker-entrypoint-initdb.d/01-schemas.sql
    environment:
      - POSTGRES_DB=cuik
      - POSTGRES_USER=cuik_super_admin
      - POSTGRES_PASSWORD=${DB_PASSWORD}

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    volumes:
      - miniodata:/data
    environment:
      - MINIO_ROOT_USER=${MINIO_USER}
      - MINIO_ROOT_PASSWORD=${MINIO_PASSWORD}

volumes:
  pgdata:
  redisdata:
  miniodata:
```

#### Dockerfile (Multi-stage)

```dockerfile
# docker/Dockerfile (conceptual)
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/*/package.json ./packages/*/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
RUN pnpm turbo build --filter=web

FROM base AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

---

## 5. Core Features — Fase 1 (MVP)

### 5.1 Landing Page + Registro de Comercio

El punto de entrada. Un comercio interesado llega al landing, ve qué ofrece Cuik, y se registra.

#### Landing Page

| Sección | Contenido |
|---------|-----------|
| Hero | "Convierte visitas en clientes recurrentes" + CTA "Empezar ahora" |
| Cómo funciona | 3 pasos: 1) Envia tu solicitud 2) Te activamos con un pase personalizado 3) Tus clientes fidelizan |
| Demo interactiva | Preview de un pase real que se puede interactuar (no solo screenshot) |
| Beneficios | Data accionable, wallet nativo, sin app, QR scan |
| Verticales | Cafeterías, barberías, veterinarias, etc. con iconos |
| Diferenciadores | vs tarjetas de cartón, vs apps, vs competencia |
| Social proof | Testimonios, logos de comercios activos |
| Pricing | Planes con precios en moneda local (soles) |
| CTA final | Formulario de registro inline |

#### Formulario de Solicitud de Comercio (Contacto)

> **IMPORTANTE**: Este formulario es un formulario de contacto. NO crea usuario, NO crea tenant, NO crea cuenta. Los datos se guardan como una **solicitud (lead)** en una cola que el Super Admin revisa.

```
┌─────────────────────────────────────┐
│  Contáctanos para activar tu        │
│  programa de fidelización           │
│                                     │
│  Nombre del negocio: [____________] │
│  Tipo de negocio:    [Cafetería  ▼] │
│  Nombre contacto:    [____________] │
│  Email:              [____________] │
│  Teléfono/WhatsApp:  [____________] │
│  Ciudad:             [____________] │
│                                     │
│  ☐ Acepto términos y condiciones    │
│                                     │
│  [ Enviar solicitud ]               │
│                                     │
│  Nuestro equipo te contactará       │
│  para activar tu cuenta con una     │
│  demo personalizada.                │
└─────────────────────────────────────┘
```

#### Flujo post-solicitud

```
Comercio completa formulario de contacto
    │
    ▼
Sistema crea SOLICITUD (lead) — NO un tenant
    │
    ├── Email al comercio: "Recibimos tu solicitud — te contactaremos pronto"
    │
    ├── Email al Super Admin: "Nueva solicitud: {negocio} — {tipo} — {ciudad}"
    │
    └── Notificación en panel SA (SSE real-time)

    La solicitud queda en cola de "Solicitudes Pendientes" del panel SA.
    El Super Admin revisa, investiga el comercio (opcionalmente con IA),
    y decide si da de alta con demo o contacta primero.
```

**Requirements:**
- R-LANDING-01: El formulario DEBE tener máximo 6 campos (nombre, tipo, contacto, email, teléfono, ciudad)
- R-LANDING-02: El formulario DEBE enviar email de confirmación al comercio via Resend
- R-LANDING-03: El formulario DEBE notificar al Super Admin via email Y en el panel en tiempo real
- R-LANDING-04: El formulario NO DEBE crear tenant ni usuario — solo una solicitud (lead) en la tabla `solicitudes`
- R-LANDING-05: La landing DEBE ser SSR para SEO (UEIA es SPA invisible para Google — ventaja)
- R-LANDING-06: Rate limiting en solicitudes: máximo 3 por email por hora, 10 por IP por hora
- R-LANDING-07: Validación con Zod en cliente Y servidor

### 5.2 Panel de Super Admin

El panel que usa el equipo Cuik para gestionar toda la plataforma. **El Super Admin (SA) es el operador central** que controla todo el ciclo de vida de los comercios.

#### Responsabilidades del Super Admin

El SA es responsable de:

| Área | Acciones |
|------|----------|
| **Solicitudes** | Revisar solicitudes (leads) entrantes, investigar comercios con IA, aprobar o rechazar |
| **Tenants** | Crear tenants, asignar planes, activar/desactivar, cambiar status |
| **Pases** | Generar pases con IA (nano-banana), editar pases en el editor visual, publicar diseños |
| **Branding** | Definir tema/branding por tenant (colores, logo, estilo) |
| **Credenciales** | Generar usuario + contraseña para el admin del comercio |
| **Comunicación** | Enviar emails de bienvenida, credenciales, notificaciones de trial |
| **Planes** | CRUD de planes con límites (NO cobro — el cobro es externo) |
| **Métricas** | Analítica de plataforma: tenants, clientes, visitas, revenue estimado |

#### Secciones del Panel SA

| Sección | Ruta | Funcionalidad |
|---------|------|---------------|
| **Dashboard** | `/admin` | KPIs de plataforma, solicitudes pendientes, actividad reciente |
| **Solicitudes** | `/admin/tenants` | Cola de solicitudes (leads), flujo de alta de comercio |
| **Tenants** | `/admin/tenants` | Gestión de tenants activos, estados, planes |
| **Editor de Pases** | `/admin/editor` | Editor visual de pases (seleccionar tenant → editar su pase) |
| **Branding** | `/admin/branding` | Definir tema visual por tenant (colores, logo, estilo) |
| **Planes** | `/admin/planes` | CRUD de planes con límites (max clientes, max ubicaciones, features) |
| **Métricas** | `/admin/metricas` | Métricas de plataforma |
| **Configuración** | `/admin/configuracion` | Config global de la plataforma |

#### Dashboard Overview

```
┌────────────────────────────────────────────────────────────────┐
│  Dashboard SA                                                   │
│                                                                │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ │
│  │ Tenants    │ │ Clientes   │ │ Visitas    │ │ Solicitudes│ │
│  │ Activos    │ │ Totales    │ │ Hoy       │ │ Pendientes │ │
│  │    12      │ │   3,456    │ │    234     │ │     3      │ │
│  │ +2 trial  │ │ +87 sem.  │ │ +12% sem. │ │ nuevas hoy │ │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘ │
│                                                                │
│  SOLICITUDES PENDIENTES (leads)                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ ● Café Aromático    │ Cafetería  │ Lima    │ hace 2h    │ │
│  │   [Ver] [Investigar con IA] [Dar de alta] [Rechazar]    │ │
│  │ ● Pet Shop Luna     │ Veterinaria│ Cusco   │ hace 5h    │ │
│  │   [Ver] [Investigar con IA] [Dar de alta] [Rechazar]    │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  TENANTS ACTIVOS                     │ ACTIVIDAD RECIENTE      │
│  ┌────────────────────────────┐     │ ┌────────────────────┐  │
│  │ Mascota Veloz  │ Pro │ ✓ │      │ │ Visita #234 - MV   │  │
│  │ Gradual Coffee │ Basic│ ✓│      │ │ Nuevo cliente - GC  │  │
│  │ Barbería Don P │ Trial│ ⏰│     │ │ Premio canjeado - BP│  │
│  └────────────────────────────┘     │ └────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

#### Gestión de Solicitudes y Tenants

| Acción | Descripción |
|--------|-------------|
| **Ver solicitudes** | Cola de solicitudes (leads) pendientes con datos del formulario de contacto |
| **Investigar con IA** | Buscar info del comercio online (colores de marca, logo, tipo de negocio) para sugerir un diseño |
| **Dar de alta con demo** | Wizard completo: crear tenant → generar pase con IA → definir branding → generar credenciales → enviar email con demo de 7 días |
| **Dar de alta con plan** | Activar el tenant directamente con un plan (sin pasar por demo) |
| **Editar tenant** | Cambiar plan, status, configuración |
| **Desactivar/Pausar** | Pausa el tenant (clientes mantienen pases pero no acumulan) |
| **Ver métricas** | Analítica por tenant: visitas, clientes, retención |

#### Workflow de Onboarding (el flow completo)

```
SOLICITUD                   ALTA + DEMO                  DISEÑO FINAL                ACTIVACIÓN
   │                          │                             │                            │
   ▼                          ▼                             ▼                            ▼
┌─────────┐              ┌─────────┐                  ┌─────────┐                 ┌─────────┐
│ Comercio│              │ SA      │                  │ SA      │                 │ SA      │
│ envía   │──────────────│ revisa  │──────────────────│ edita   │─────────────────│ activa  │
│ solicit.│  Notificación│ y da de │  Comercio envía  │ pase con│  Plan escogido  │ con plan│
│         │              │ alta +  │  assets reales   │ assets  │                 │ final   │
│         │              │ demo 7d │                  │ reales  │                 │         │
└─────────┘              └─────────┘                  └─────────┘                 └─────────┘
     │                        │                             │                            │
     ▼                        ▼                             ▼                            ▼
 solicitud               tenant creado               SA usa el editor            status:
 en cola                 status: "trial"             visual para crear           "active"
 (lead)                  trial_ends_at:              el pase definitivo          plan_id: assigned
                         now + 7 days                con assets del              activated_at: now
                         credenciales enviadas       comercio
```

#### Investigación de Comercio con IA (Feature SA)

Cuando el SA va a dar de alta un comercio, puede usar IA para investigar el negocio online:

```
SA: "Investigar comercio" → Café Aromático, Lima
    │
    ├── Busca en Google, redes sociales
    │   ├── Colores de marca detectados: #DA4319, #FDF8EA
    │   ├── Logo encontrado: [preview]
    │   ├── Tipo de negocio: Cafetería artesanal
    │   └── Estilo sugerido: Cálido, artesanal, tonos tierra
    │
    └── SA puede usar estos datos para generar un pase más alineado
        con la identidad del comercio
```

**Requirements:**
- R-ADMIN-01: El SA DEBE poder ver todas las solicitudes pendientes (leads) con notificaciones en tiempo real
- R-ADMIN-02: El SA DEBE poder dar de alta un tenant con demo de 7 días mediante un wizard (crear tenant → generar pase IA → definir branding → generar credenciales → enviar email)
- R-ADMIN-03: La demo DEBE generar un pase FUNCIONAL (real, con clientes que pueden registrarse y acumular visitas) usando IA (nano-banana)
- R-ADMIN-04: El SA DEBE poder generar assets visuales con IA (nano-banana) o subir assets manualmente
- R-ADMIN-05: El SA DEBE poder ver el status de todos los tenants (trial, active, expired, cancelled, paused)
- R-ADMIN-06: El SA DEBE poder cambiar el plan de un tenant en cualquier momento (el cobro es externo)
- R-ADMIN-07: Cuando un trial vence (7 días), el tenant pasa a status "expired" y sus clientes no pueden acumular visitas
- R-ADMIN-08: El SA DEBE tener acceso a métricas de plataforma: total tenants, total clientes, visitas/día, revenue estimado
- R-ADMIN-09: El SA DEBE poder investigar un comercio con IA (buscar colores, logo, tipo de negocio online) antes de dar de alta
- R-ADMIN-10: El SA DEBE poder editar pases de cualquier tenant desde el editor visual en `/admin/editor`
- R-ADMIN-11: El SA DEBE poder definir el branding (colores, logo, estilo) de cada tenant desde `/admin/branding`
- R-ADMIN-12: Las solicitudes (leads) DEBEN ser una entidad separada de los tenants en la base de datos

### 5.3 Editor Visual de Pases

**Este es el valor agregado real.** El **Super Admin** diseña el pase del comercio con un editor visual tipo "mini Canva" que genera el diseño para Apple y Google Wallet en tiempo real.

> **IMPORTANTE**: El editor vive en el panel del Super Admin (`/admin/editor`), NO en el panel del comercio. El admin del comercio puede ver su pase actual en modo solo lectura ("Mi Pase"), pero NO puede editarlo. En el futuro, se podrá dar acceso limitado de edición al comercio.

#### Arquitectura del Editor

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  EDITOR DE PASES                                                                │
│                                                                                 │
│  ┌──────────┐  ┌─────────────────────────────────┐  ┌──────────────────────┐   │
│  │ SIDEBAR  │  │         CANVAS (Konva)           │  │    PROPIEDADES       │   │
│  │          │  │                                   │  │                      │   │
│  │ Elementos│  │  ┌───────────────────────────┐   │  │ Selección: Sello #3  │   │
│  │          │  │  │     STRIP AREA             │   │  │                      │   │
│  │ 🟡 Sello │  │  │     750 × 246 px           │   │  │ Posición X: [120]   │   │
│  │ 🖼️ Imagen│  │  │                             │   │  │ Posición Y: [37]    │   │
│  │ 📝 Texto │  │  │  [🟡] [🟡] [🟡] [🟡]      │   │  │ Tamaño: [86]×[86]   │   │
│  │ 🔲 Forma │  │  │                             │   │  │ Rotación: [0°]      │   │
│  │          │  │  │    [🟡] [🟡] [🟡] [🟡]     │   │  │ Opacidad: [100%]    │   │
│  │ ─────── │  │  │                             │   │  │ Imagen: [Subir]     │   │
│  │ Templates│  │  └───────────────────────────┘   │  │                      │   │
│  │          │  │                                   │  │ ─────────────────── │   │
│  │ ☕ Café   │  │  ┌───────────────────────────┐   │  │ COLORES             │   │
│  │ 🐾 Mascota│  │  │     PREVIEW AREA           │   │  │ Fondo:  [#FDF8EA]  │   │
│  │ ✂️ Barbería│  │  │     (Apple Wallet mockup)  │   │  │ Texto:  [#DA4319]  │   │
│  │ 🍕 Comida │  │  │                             │   │  │ Label:  [#DA4319]  │   │
│  │          │  │  │  ┌─── iPhone Wallet ───┐    │   │  │                      │   │
│  │ ─────── │  │  │  │  LOGO    Café Arom. │    │   │  │ ─────────────────── │   │
│  │ Subir    │  │  │  │                     │    │   │  │ CAMPOS              │   │
│  │ archivos │  │  │  │  ┌─────────────┐   │    │   │  │ Título: [_________] │   │
│  │ [📁]     │  │  │  │  │  STRIP      │   │    │   │  │ Desc:   [_________] │   │
│  │          │  │  │  │  │  (lo que    │   │    │   │  │ Terms:  [_________] │   │
│  │          │  │  │  │  │   editamos  │   │    │   │  │                      │   │
│  │          │  │  │  │  │   arriba)   │   │    │   │  │ ─────────────────── │   │
│  │          │  │  │  │  └─────────────┘   │    │   │  │ SELLOS              │   │
│  │          │  │  │  │  Visitas: 3 de 8   │    │   │  │ Total: [8]          │   │
│  │          │  │  │  │  Premio: Café free  │    │   │  │ Filas: [2]          │   │
│  │          │  │  │  └─────────────────────┘    │   │  │ Columnas: [4]       │   │
│  │          │  │  │                             │   │  │ Gap: [14]px         │   │
│  └──────────┘  └─────────────────────────────────┘  └──────────────────────┘   │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  [↩️ Undo] [↪️ Redo] │ Zoom: [100%] │ [👁️ Preview Apple] [👁️ Preview Google]│   │
│  │  [💾 Guardar borrador] [✅ Publicar diseño]                               │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Elementos del Editor

| Elemento | Descripción | Propiedades Editables |
|----------|-------------|----------------------|
| **Sello/Estampilla** | El elemento que se muestra lleno/vacío según visitas del cliente | Imagen (PNG/SVG), tamaño, posición, opacidad lleno/vacío, animación |
| **Imagen** | Logo, background, decoraciones | URL, tamaño, posición, rotación, opacidad, crop |
| **Texto** | Labels, títulos, términos | Contenido, font, tamaño, color, posición, alineación |
| **Forma** | Rectángulos, círculos, líneas | Tipo, tamaño, color fill/stroke, border radius, posición |

#### Dimensiones Fijas del Pase (Apple Wallet)

Estas dimensiones son estándar de Apple y NO son editables:

| Asset | @1x | @2x | @3x | Editable |
|-------|-----|-----|-----|----------|
| **Strip image** | 375 × 123 px | 750 × 246 px | 1125 × 369 px | SI (es el canvas del editor) |
| **Logo** | 160 × 50 px max | 320 × 100 px max | 480 × 150 px max | SI (subir imagen) |
| **Icon** | 29 × 29 px | 58 × 58 px | 87 × 87 px | SI (subir imagen) |
| **Background** | — | — | — | NO (no aplica a storeCard) |

#### Área Editable: Strip Image (750 × 246 px @2x)

El strip es donde van los sellos/estampillas. El editor permite:

1. **Elegir background** del strip (color sólido, gradiente, o imagen)
2. **Posicionar sellos** libremente con drag-and-drop (o usar grid automático)
3. **Elegir imagen del sello** (paw, estrella, corazón, custom upload)
4. **Configurar grid** (filas × columnas, gap, posición inicial)
5. **Previsualizar** en mockup de iPhone/Android en tiempo real

#### Canvas State (Konva → JSON)

El estado del canvas se guarda como JSON en `pass_designs.canvas_data`:

```jsonc
{
  "version": 1,
  "width": 750,
  "height": 246,
  "background": {
    "type": "image", // "color" | "gradient" | "image"
    "value": "https://minio.cuik.app/assets/{tenant}/strip_bg.png"
  },
  "elements": [
    {
      "id": "stamp-1",
      "type": "stamp",
      "x": 120,
      "y": 37,
      "width": 86,
      "height": 86,
      "rotation": 0,
      "image": "https://minio.cuik.app/assets/{tenant}/stamp.png",
      "opacityFilled": 1.0,
      "opacityEmpty": 0.35,
      "slotIndex": 0
    },
    // ... más elementos
  ],
  "stamps": {
    "total": 8,
    "layout": "grid", // "grid" | "freeform"
    "rows": 2,
    "columns": 4,
    "gapX": 30,
    "gapY": 14,
    "startX": 120,
    "startY": 37
  }
}
```

#### Exportación: Canvas → Pase Real

```
Canvas (Konva JSON)
    │
    ├── Server-side render via Konva + node-canvas
    │   → Genera strip@2x.png (750×246)
    │   → Genera strip@1x.png (375×123) via sharp resize
    │
    ├── Inyecta en template Apple Wallet (.pkpass)
    │   → pass.json con colores, campos, barcode
    │   → strip.png, logo.png, icon.png
    │   → Firma con certificado Apple
    │
    └── Inyecta en Google Wallet
        → Loyalty class con colores, texts
        → Hero image URL (strip como hero)
```

**Requirements:**
- R-EDITOR-01: El editor DEBE renderizar en un canvas Konva con las dimensiones exactas del strip de Apple Wallet (750×246 @2x)
- R-EDITOR-02: Los sellos DEBEN poder posicionarse con drag-and-drop libre O usando un grid automático configurable
- R-EDITOR-03: El editor DEBE soportar subida de imágenes custom para sellos, logos, y backgrounds via MinIO
- R-EDITOR-04: El editor DEBE mostrar un preview en tiempo real del pase como se vería en un iPhone (mockup)
- R-EDITOR-05: El canvas state DEBE guardarse como JSON en la base de datos para regenerar el pase en cualquier momento
- R-EDITOR-06: El editor DEBE soportar undo/redo (mínimo 50 pasos)
- R-EDITOR-07: El editor DEBE incluir templates predefinidos por vertical (café, barbería, veterinaria, etc.)
- R-EDITOR-08: Al publicar un diseño, el sistema DEBE regenerar TODOS los pases activos de ese tenant con el nuevo diseño y enviar push de actualización
- R-EDITOR-09: El editor DEBE ser responsive y funcionar en tablets (el admin puede usarlo desde un iPad)
- R-EDITOR-10: Los colores del pase (background, foreground, label) DEBEN poder editarse con un color picker
- R-EDITOR-11: El editor DEBE poder exportar el diseño como imagen PNG para preview/compartir

### 5.4 Registro de Clientes del Comercio

Cada comercio tiene su propia URL de registro para sus clientes finales.

#### URL Pattern

```
https://cuik.app/{tenant-slug}/registro
https://cuik.app/mascota-veloz/registro
https://cuik.app/cafe-aromatico/registro
```

#### Formulario de Registro del Cliente

```
┌─────────────────────────────────────┐
│  [LOGO DEL COMERCIO]                │
│                                     │
│  Registrate en el programa de       │
│  fidelización de {Nombre Comercio}  │
│                                     │
│  Nombre:    [____________]          │
│  Apellido:  [____________]          │
│  DNI:       [____________]          │
│  Teléfono:  [____________]          │
│  Email:     [____________]          │
│                                     │
│  ☐ Acepto términos y condiciones    │
│  ☐ Acepto recibir comunicaciones    │
│    (te regalamos +1 visita bonus!)  │
│                                     │
│  [ Registrarme y obtener mi pase ]  │
└─────────────────────────────────────┘
```

#### Flujo post-registro

```
Cliente completa formulario
    │
    ▼
Validación (Zod) + Rate Limiting
    │
    ├── Crea cliente en loyalty.clients
    ├── Genera QR code: {TENANT_PREFIX}_{DNI}
    │
    ├── Genera Apple Wallet pass (.pkpass)
    │   └── Strip con sellos vacíos (desde pass_designs.canvas_data)
    │
    ├── Genera Google Wallet loyalty object
    │   └── Save link con JWT firmado
    │
    └── Redirect a /bienvenido
        ├── Botón "Agregar a Apple Wallet"
        └── Botón "Agregar a Google Wallet"
```

**Requirements:**
- R-REGISTRO-01: El formulario DEBE usar el branding del tenant (logo, colores)
- R-REGISTRO-02: El formulario DEBE validar DNI único por tenant (permitir re-registro si ya existe → actualizar datos)
- R-REGISTRO-03: Rate limiting: 3 por DNI / 10 por IP por 10 minutos
- R-REGISTRO-04: El pase generado DEBE usar el diseño del editor (pass_designs.canvas_data)
- R-REGISTRO-05: Marketing opt-in DEBE dar +1 visita bonus (ya existente en el sistema)
- R-REGISTRO-06: La página DEBE funcionar en mobile (80%+ del tráfico será mobile)

### 5.5 Panel de Cajero

El cajero escanea QR de clientes para registrar visitas y canjear premios.

```
┌─────────────────────────────────────────────────────┐
│  🏪 Panel de Cajero — Café Aromático                │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │                                                  │ │
│  │              📷 SCANNER QR                       │ │
│  │                                                  │ │
│  │          [Apuntá la cámara al QR]               │ │
│  │                                                  │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ── o buscar manualmente ──                         │
│  DNI: [____________] [🔍 Buscar]                    │
│                                                      │
│  ─────────────────────────────────────────────────  │
│  RESULTADO:                                          │
│  ┌────────────────────────────────────────────────┐ │
│  │  👤 María García                                │ │
│  │  DNI: 12345678 │ Tier: Regular                  │ │
│  │                                                  │ │
│  │  Visitas este ciclo: ●●●●○○○○ (4 de 8)        │ │
│  │  Total visitas: 28                               │ │
│  │  Premios pendientes: 1 🎁                        │ │
│  │                                                  │ │
│  │  [✅ Registrar Visita]  [🎁 Canjear Premio]     │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ÚLTIMAS TRANSACCIONES                              │
│  • 14:32 — María García — Visita #4 registrada     │
│  • 14:15 — Carlos López — Premio canjeado           │
│  • 13:58 — Ana Ruiz — Visita #2 registrada          │
└─────────────────────────────────────────────────────┘
```

**Requirements:**
- R-CAJERO-01: El scanner QR DEBE usar la cámara del dispositivo via @zxing/browser
- R-CAJERO-02: DEBE existir búsqueda manual por DNI como fallback
- R-CAJERO-03: Al registrar visita, el pase del cliente DEBE actualizarse en Apple/Google Wallet via push
- R-CAJERO-04: El cajero DEBE ver el estado completo del cliente antes de registrar (visitas, tier, premios)
- R-CAJERO-05: El panel DEBE funcionar como PWA (installable, funciona offline para la UI, sync cuando hay conexión)
- R-CAJERO-06: Validación: máximo 1 visita por cliente por día (configurable por tenant)
- R-CAJERO-07: El cajero NO DEBE poder acceder a configuración del tenant, editor, ni analítica

### 5.6 Panel de Admin del Comercio (Dashboard)

El dueño del comercio gestiona su programa de fidelización. Su scope es **operativo** — la configuración de pases, branding y planes la gestiona el Super Admin.

#### Secciones

| Sección | Funcionalidad |
|---------|---------------|
| **Dashboard** | KPIs: clientes totales, visitas hoy/semana/mes, tasa de retención, premios canjeados |
| **Clientes** | Lista con búsqueda, filtros (tier, última visita, ciclo), detalle de cada cliente, export CSV |
| **Mi Pase** | Vista solo lectura del diseño actual del pase (el SA lo diseña y edita) |
| **Cajeros** | Invitar cajeros via magic link, gestionar accesos, ver actividad por cajero |
| **Analítica** | Gráficos: visitas por día, clientes nuevos vs recurrentes, cohortes de retención, distribución por tier |
| **Campañas** | Crear y enviar push notifications via wallet (futuro: WhatsApp) |
| **Configuración** | Info del negocio (nombre, ubicaciones, horarios). Plan y tema/branding son solo lectura (gestionados por SA) |

> **Qué NO tiene el panel del comercio**: editor de pases (está en SA), onboarding wizard (el SA hace el onboarding), botones de upgrade/facturación (el cobro es externo), edición de branding/tema.

**Requirements:**
- R-DASHBOARD-01: El dashboard DEBE mostrar KPIs actualizados en tiempo real (o con refresh < 1 min)
- R-DASHBOARD-02: La lista de clientes DEBE soportar búsqueda por nombre, DNI, teléfono
- R-DASHBOARD-03: El admin DEBE poder exportar datos de clientes a CSV
- R-DASHBOARD-04: El admin DEBE poder invitar cajeros con magic link (no necesitan crear cuenta con password)
- R-DASHBOARD-05: La analítica DEBE incluir mínimo: visitas/día, clientes nuevos/día, tasa de retención 30d
- R-DASHBOARD-06: La sección "Mi Pase" DEBE mostrar el diseño actual del pase en modo solo lectura (preview visual)
- R-DASHBOARD-07: La configuración DEBE mostrar el plan actual como badge informativo (solo lectura, sin opciones de upgrade)
- R-DASHBOARD-08: El branding/tema del comercio DEBE mostrarse como solo lectura (gestionado por SA)

---

## 6. Core Features — Fase 2 (Diferenciación)

### 6.1 Múltiples Mecánicas de Fidelización

Actualmente Cuik solo soporta estampillas. Para competir con UEIA necesita 4 mecánicas.

| Mecánica | Cómo funciona | Config en `promotions.config` (JSONB) |
|----------|---------------|---------------------------------------|
| **Estampillas** (stamps) | N visitas → premio. Ciclo se repite. | `{ max_visits: 8, reward_type: "free_item", reward_value: "1 café gratis" }` |
| **Descuentos** | Descuento % o monto fijo automático después de N visitas | `{ visits_required: 5, discount_type: "percentage", discount_value: 15 }` |
| **Cupones** | Cupones canjeables con fecha de expiración | `{ coupon_code: "VERANO25", discount_value: 10, expires_days: 30 }` |
| **Suscripciones** | Track de sesiones/clases | `{ sessions_per_month: 10, overage_price: 15 }` |

**Requirements:**
- R-MECH-01: El sistema DEBE soportar las 4 mecánicas de fidelización
- R-MECH-02: Cada tenant DEBE poder tener múltiples promociones activas simultáneamente
- R-MECH-03: La mecánica se configura por promoción, no por tenant (un café puede tener estampillas + cupones)
- R-MECH-04: El pase del cliente DEBE reflejar la mecánica activa (estampillas visibles, descuento acumulado, etc.)

### 6.2 Notificaciones Geolocalizadas

Apple Wallet soporta `relevant locations` en los pases — cuando el cliente está cerca de la tienda, el pase aparece automáticamente en el lockscreen.

```jsonc
// En pass.json
{
  "locations": [
    {
      "latitude": -12.046374,
      "longitude": -77.042793,
      "relevantText": "¡Estás cerca de Café Aromático! Te faltan 2 sellos 🎯"
    }
  ]
}
```

**Requirements:**
- R-GEO-01: Cada ubicación del tenant DEBE incluir lat/lng
- R-GEO-02: Los pases Apple Wallet DEBEN incluir las `locations` del tenant
- R-GEO-03: Google Wallet DEBE usar `messages` con locations cuando esté soportado

### 6.3 Campañas Push (Notifications)

El admin puede enviar notificaciones push a sus clientes via wallet.

```
┌─────────────────────────────────────┐
│  Nueva Campaña Push                 │
│                                     │
│  Nombre: [Promo Verano 2026]        │
│  Mensaje: [2x1 en frappés esta     │
│            semana! Mostrá tu pase]  │
│                                     │
│  Segmento:                          │
│  ○ Todos los clientes               │
│  ○ Solo tier VIP                    │
│  ○ Sin visita en 14+ días          │
│  ○ Custom (filtros avanzados)       │
│                                     │
│  Enviar: ○ Ahora  ○ Programar      │
│  Fecha: [__/__/____] Hora: [__:__] │
│                                     │
│  [ Vista previa ] [ Enviar ]        │
└─────────────────────────────────────┘
```

**Requirements:**
- R-CAMP-01: El admin DEBE poder crear campañas con mensaje, segmento, y programación
- R-CAMP-02: Las notificaciones DEBEN enviarse via Apple Wallet push (APNS) y Google Wallet message update
- R-CAMP-03: El admin DEBE poder segmentar por tier, última visita, ubicación, total visitas
- R-CAMP-04: El sistema DEBE trackear enviados/entregados/fallidos por campaña

### 6.4 Generación de Demo Funcional con IA

Cuando llega una solicitud de comercio, el **Super Admin** puede generar rápidamente una demo **funcional** usando IA. La demo NO es un mockup — es un **pase real que funciona**: los clientes pueden registrarse, acumular visitas, y canjear premios durante 7 días.

```
SA: "Dar de alta con demo" → Café Aromático (desde solicitud)
    │
    ├── Toma info de la solicitud: nombre, tipo (cafetería), ciudad (Lima)
    │
    ├── (Opcional) Investiga el comercio con IA:
    │   ├── Busca colores de marca, logo, estilo
    │   └── Sugiere diseño alineado con la identidad del negocio
    │
    ├── Genera pase con nano-banana:
    │   ├── Logo del comercio (IA generativa o encontrado online)
    │   ├── Background del strip (temática café)
    │   └── Imagen del sello (taza de café)
    │
    ├── Aplica template "Cafetería" con las imágenes generadas
    │
    ├── Crea tenant con status "trial", trial_ends_at: now + 7 días
    │
    ├── Genera credenciales (email + password) para el admin del comercio
    │
    └── Envía email al comercio con:
        ├── Credenciales de acceso al panel
        ├── URL del pase demo (funcional, listo para usar)
        └── Instrucciones: "Probá la demo. Envianos tu logo y colores para el diseño final"
```

#### Objetivo de la Demo

El comercio puede **usar la demo como si fuera el producto real**:
- Registrar clientes de prueba
- Acumular visitas
- Ver el pase en Apple/Google Wallet
- Acceder al panel de admin (dashboard, clientes, cajeros)

Después de 7 días, el pase se desactiva. Si el comercio decide contratar, envía sus assets reales al SA para el diseño personalizado.

**Requirements:**
- R-DEMO-01: El SA DEBE poder generar assets visuales con IA (nano-banana) pasando el nombre y tipo del comercio
- R-DEMO-02: El SA DEBE poder subir assets manualmente como alternativa a la generación IA
- R-DEMO-03: La demo DEBE usar un template predefinido del vertical correspondiente
- R-DEMO-04: La demo DEBE ser un pase FUNCIONAL (clientes reales pueden registrarse y acumular visitas)
- R-DEMO-05: El trial DEBE durar exactamente 7 días desde la activación
- R-DEMO-06: Al vencer el trial, el tenant pasa a "expired", los clientes no acumulan, y el SA recibe notificación
- R-DEMO-07: El SA DEBE generar credenciales (email + password auto-generada) y enviarlas por email al comercio

### 6.5 Tiers / Niveles de Cliente

```
EXPLORADOR (0-15 visitas)
    │  Beneficios: Programa básico de estampillas
    ▼
REGULAR (16-50 visitas)
    │  Beneficios: Estampillas + descuento 5% permanente
    ▼
VIP (51+ visitas)
       Beneficios: Estampillas + descuento 10% + acceso a promos exclusivas
```

**Requirements:**
- R-TIER-01: Los tiers DEBEN ser configurables por tenant (nombres, umbrales, beneficios)
- R-TIER-02: El tier DEBE mostrarse visualmente en el pase wallet
- R-TIER-03: El diseño del pase PUEDE cambiar según el tier (color diferente para VIP)
- R-TIER-04: El cambio de tier DEBE ser automático al alcanzar el umbral

---

## 7. Core Features — Fase 3 (Moat Competitivo)

Estas features son para después del MVP pero DEBEN informar decisiones de arquitectura desde ahora.

### 7.1 WhatsApp como Canal Dual

| Feature | Descripción |
|---------|-------------|
| Registro via WhatsApp | Cliente escanea QR → se abre WhatsApp con "UNIRME" → queda registrado |
| Consulta de saldo | Cliente escribe "SALDO" → recibe estado de visitas y premios |
| Notificaciones | Campañas push via WhatsApp Business API (98% tasa de apertura) |
| Confirmación de visita | Después de cada scan, mensaje WhatsApp de confirmación |

### 7.2 Coalición de Barrio

Varios comercios de la misma zona comparten un ecosistema de loyalty. El cliente acumula en uno, canjea en cualquiera.

### 7.3 Gamificación

- **Streaks**: Racha de visitas semanales con multiplicador de puntos
- **Challenges**: "Visitá 5 veces este mes → bonus extra"
- **Spin-to-Win**: Ruleta de premios al completar ciclo

### 7.4 AI Churn Prevention

Detección automática de clientes en riesgo de abandono con triggers de retención personalizados.

### 7.5 NFC Tap-to-Earn

El cliente toca su teléfono en un lector NFC en el mostrador → visita registrada automáticamente.

**Requirements (arquitectura):**
- R-FUTURE-01: El schema de DB DEBE soportar múltiples canales de comunicación (wallet, whatsapp, email) desde el diseño
- R-FUTURE-02: El sistema de visitas DEBE soportar múltiples sources (qr, nfc, manual, whatsapp)
- R-FUTURE-03: La tabla `promotions` DEBE soportar reglas de gamificación via JSONB config
- R-FUTURE-04: El multi-tenancy DEBE permitir "grupos de tenants" para coaliciones futuras

---

## 8. API Design

### 8.1 API Routes Structure

Todas las API routes usan Next.js App Router (`app/api/`) con Server Actions donde aplica.

#### Public APIs (no auth)

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/solicitudes` | Enviar solicitud de comercio desde landing (crea lead, NO tenant) |
| POST | `/api/[tenant]/register-client` | Registro de cliente del comercio |
| GET | `/api/[tenant]/info` | Info pública del tenant (nombre, logo, colores) |

#### Apple Wallet Web Service Protocol

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/apple-wallet/v1/devices/{deviceId}/registrations/{passTypeId}/{serialNumber}` | Device registration |
| DELETE | `/api/apple-wallet/v1/devices/{deviceId}/registrations/{passTypeId}/{serialNumber}` | Device unregistration |
| GET | `/api/apple-wallet/v1/devices/{deviceId}/registrations/{passTypeId}` | Get serial numbers |
| GET | `/api/apple-wallet/v1/passes/{passTypeId}/{serialNumber}` | Get latest pass |
| POST | `/api/apple-wallet/v1/log` | Log errors |

#### Authenticated APIs — Cajero (role: user)

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/visits/register` | Registrar visita (QR scan) |
| POST | `/api/rewards/redeem` | Canjear premio |
| GET | `/api/clients/search?q=` | Buscar cliente por DNI/nombre |
| GET | `/api/clients/[id]` | Detalle del cliente |

#### Authenticated APIs — Admin (role: admin)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/dashboard/stats` | KPIs del dashboard |
| GET/PUT | `/api/tenant/settings` | Config del tenant (info del negocio — plan y branding son solo lectura) |
| CRUD | `/api/clients` | Gestión de clientes |
| GET | `/api/clients/export` | Export CSV de clientes |
| CRUD | `/api/team` | Gestión de cajeros (invitar via magic link, revocar) |
| CRUD | `/api/locations` | Ubicaciones del comercio |
| CRUD | `/api/promotions` | Promociones y mecánicas |
| GET | `/api/pass-designs/current` | Ver diseño actual del pase (solo lectura — "Mi Pase") |
| CRUD | `/api/campaigns` | Campañas push |
| POST | `/api/campaigns/[id]/send` | Enviar campaña |
| GET | `/api/analytics/visits` | Analytics de visitas |
| GET | `/api/analytics/retention` | Cohortes de retención |

#### Authenticated APIs — Super Admin (role: super_admin)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/admin/solicitudes` | Listar solicitudes pendientes (leads) |
| PATCH | `/api/admin/solicitudes/[id]` | Actualizar estado de solicitud (aprobar, rechazar) |
| CRUD | `/api/admin/tenants` | Gestión de tenants (creación manual por SA) |
| POST | `/api/admin/tenants/[id]/activate-trial` | Activar trial 7 días con demo funcional |
| POST | `/api/admin/tenants/[id]/activate-plan` | Activar con plan (cobro externo) |
| POST | `/api/admin/tenants/[id]/deactivate` | Desactivar/pausar tenant |
| POST | `/api/admin/tenants/[id]/credentials` | Generar credenciales para admin del comercio |
| CRUD | `/api/admin/plans` | Gestión de planes (límites, sin cobro) |
| CRUD | `/api/admin/pass-designs` | Diseños de pases por tenant |
| POST | `/api/admin/pass-designs/[id]/publish` | Publicar diseño y regenerar pases |
| PUT | `/api/admin/tenants/[id]/branding` | Definir tema/branding del tenant |
| GET | `/api/admin/metrics` | Métricas de plataforma |
| POST | `/api/ai/generate-assets` | Generar assets con nano-banana |
| POST | `/api/ai/research-business` | Investigar comercio con IA (colores, logo, tipo) |

#### File Upload

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/upload` | Upload a MinIO (logos, stamps, backgrounds) |
| DELETE | `/api/upload/[key]` | Eliminar archivo |

### 8.2 Server Actions (preferidos sobre API routes para mutaciones desde el frontend)

```typescript
// Ejemplo conceptual
"use server"

export async function registerVisit(formData: FormData) {
  // Validar con Zod
  // Verificar auth + role
  // Llamar RPC loyalty.register_visit()
  // Trigger push notification
  // Revalidar cache
}
```

---

## 9. User Experience

### 9.1 Flujos Principales

#### Flujo 1: Comercio envía solicitud y recibe demo

```
Comercio llega al landing
    │
    ▼
Completa formulario de contacto (6 campos) → Crea SOLICITUD (lead)
    │
    ▼
Recibe email: "Recibimos tu solicitud — te contactamos pronto"
    │                              │
    │                    SA ve notificación en panel
    │                              │
    │                              ▼
    │                    SA revisa solicitud
    │                    (opcionalmente investiga con IA)
    │                              │
    │                              ▼
    │                    SA: "Dar de alta con demo"
    │                              │
    │                    ┌─────────┴─────────┐
    │                    │ Opción A: IA      │ Opción B: Manual │
    │                    │ nano-banana genera│ SA sube assets   │
    │                    │ logo + stamp + bg │                   │
    │                    └─────────┬─────────┘
    │                              │
    │                    SA crea tenant + genera pase + credenciales
    │                              │
    │                    Tenant status: "trial" (7 días)
    │                              │
    ▼                              ▼
Comercio recibe email: credenciales + demo funcional
    │
    ▼
Comercio prueba la demo (pase real, clientes pueden registrarse)
    │
    ▼ (dentro de 7 días)
Comercio envía assets reales (logo, colores) al SA
    │
    ▼
SA diseña pase final en el editor visual con assets reales
    │
    ▼
SA activa con plan → status: "active" (cobro externo)
```

#### Flujo 2: Cliente final se registra y usa el pase

```
Cliente ve QR/URL en el comercio
    │
    ▼
Entra a cuik.app/{tenant}/registro
    │
    ▼
Completa formulario (5 campos)
    │
    ├── Se genera Apple Wallet .pkpass
    ├── Se genera Google Wallet save link
    │
    ▼
Página de bienvenida con botones:
    [Agregar a Apple Wallet] [Agregar a Google Wallet]
    │
    ▼
Pase en su wallet con sellos vacíos
    │
    ▼ (en cada visita)
Muestra QR al cajero → Cajero escanea → Visita registrada
    │
    ├── Pase se actualiza via push (sello se llena)
    ├── Si completa ciclo → reward creado → notificación
    │
    ▼ (al completar ciclo)
Cliente muestra reward al cajero → Cajero canjea → Nuevo ciclo empieza
```

#### Flujo 3: SA diseña pase en el editor

```
SA entra a Panel SA → Editor de Pases → Selecciona tenant
    │
    ▼
Elige template o empieza desde cero
    │
    ├── Sube logo del comercio (assets reales enviados por el comercio)
    ├── Elige/sube imagen de sellos
    ├── Configura background del strip
    │
    ▼
Arrastra sellos al canvas (o usa grid automático)
    │
    ├── Posiciona con drag-and-drop
    ├── Ajusta tamaño y posición en panel de propiedades
    ├── Ve preview en mockup de iPhone en tiempo real
    │
    ▼
Configura colores (bg, fg, label) con color picker
    │
    ▼
Configura campos del pase (título, descripción, términos)
    │
    ▼
[Guardar borrador] → guardado automático cada 30s
    │
    ▼
[Publicar] → Confirmar → Regenera todos los pases activos del tenant
```

### 9.2 Responsive Design

| Pantalla | Comportamiento |
|----------|---------------|
| **Landing** | Full responsive, mobile-first |
| **Registro cliente** | Mobile-first (80%+ del tráfico) |
| **Panel cajero** | Mobile-first (usa teléfono/tablet en el mostrador) |
| **Dashboard admin** | Desktop-first, responsive en tablet |
| **Editor de pases** | Desktop-first, funcional en tablet landscape |
| **Super admin** | Desktop only |

---

## 10. Security

### 10.1 Principios

| Principio | Implementación |
|-----------|---------------|
| **Zero credentials in code** | Todas las credenciales en variables de entorno. NO más service_account.json en el repo. |
| **Principle of least privilege** | Cada DB role solo accede a lo que necesita. Cajeros no ven config. |
| **Rate limiting everywhere** | En registro, login, API mutations, file uploads |
| **Input validation** | Zod en cliente Y servidor. Nunca confiar en el frontend. |
| **CSRF protection** | Better Auth incluye protección CSRF built-in |
| **SQL injection prevention** | Drizzle ORM con parameterized queries (no raw SQL user-facing) |
| **XSS prevention** | React escapa por defecto. CSP headers. |
| **File upload safety** | Validar MIME type, tamaño máximo, sanitizar nombres |
| **Audit trail** | Toda acción de admin queda registrada en analytics.events |

### 10.2 Secretos Requeridos (Variables de Entorno)

```env
# Database
DATABASE_URL=postgresql://cuik_app:PASSWORD@db:5432/cuik

# Auth
BETTER_AUTH_SECRET=random-secret-256bit
BETTER_AUTH_URL=https://cuik.app

# Apple Wallet
APPLE_WALLET_PASS_TYPE_ID=pass.app.cuik.loyalty
APPLE_WALLET_TEAM_ID=XXXXXXXXXX
APPLE_WALLET_CERT_BASE64=base64-encoded-cert
APPLE_WALLET_KEY_BASE64=base64-encoded-key
APPLE_WALLET_KEY_PASSPHRASE=passphrase

# Google Wallet
GOOGLE_SERVICE_ACCOUNT_JSON=json-string
GOOGLE_WALLET_ISSUER_ID=1234567890

# Email
RESEND_API_KEY=re_xxxxxxxxx

# Storage
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=key
MINIO_SECRET_KEY=secret
MINIO_BUCKET=cuik-assets

# Redis
REDIS_URL=redis://redis:6379

# AI (opcional, para generación de demos)
NANO_BANANA_API_KEY=key-if-needed
```

---

## 11. Testing Strategy

| Layer | Tool | Qué se testea |
|-------|------|---------------|
| **Unit** | Vitest | Lógica de negocio pura: cálculo de ciclos, validaciones Zod, formateo de QR, tier resolution |
| **Integration** | Vitest + PostgreSQL test container | RPCs de PostgreSQL, Drizzle queries, wallet generation pipeline |
| **Component** | Vitest + Testing Library | Componentes React: formularios, dashboard widgets, editor elements |
| **E2E** | Playwright | Flujos completos: registro → scan → reward, admin → editor → publicar |
| **API** | Vitest + supertest | Endpoints: auth, visits, rewards, tenants |

**Requirements:**
- R-TEST-01: Coverage mínimo: 80% en packages/ (lógica de negocio), 60% en apps/web
- R-TEST-02: TODOS los RPCs de PostgreSQL DEBEN tener tests de integración
- R-TEST-03: El pipeline de generación de pases (canvas → strip → .pkpass) DEBE tener tests E2E
- R-TEST-04: CI DEBE correr lint + typecheck + tests en cada PR

---

## 12. Non-Functional Requirements

### 12.1 Performance

- R-PERF-01: Landing page DEBE cargar en < 2 segundos (LCP) en 3G rápido
- R-PERF-02: Registro de visita (scan → response) DEBE completar en < 500ms
- R-PERF-03: Generación de pase (.pkpass) DEBE completar en < 3 segundos
- R-PERF-04: El editor DEBE renderizar a 60fps en un dispositivo moderno
- R-PERF-05: El dashboard DEBE cargar KPIs en < 1 segundo

### 12.2 Scalability

- R-SCALE-01: El sistema DEBE soportar 100 tenants simultáneos en la Fase 1
- R-SCALE-02: El sistema DEBE soportar 10,000 clientes por tenant
- R-SCALE-03: El sistema DEBE soportar 1,000 visitas/día por tenant
- R-SCALE-04: PostgreSQL partitioning DEBE considerarse para analytics si supera 10M rows

### 12.3 Reliability

- R-REL-01: Uptime target: 99.5% (máximo ~3.6 horas downtime/mes)
- R-REL-02: Backups automáticos de PostgreSQL cada 6 horas
- R-REL-03: Backups de MinIO (assets) cada 24 horas
- R-REL-04: Health checks en Docker para restart automático
- R-REL-05: Si la generación de pase falla, DEBE reintentar hasta 3 veces con backoff

### 12.4 Accessibility

- R-ACC-01: La landing y páginas de registro DEBEN cumplir WCAG 2.1 AA
- R-ACC-02: El panel de cajero DEBE ser usable con teclado (para cuando la cámara no funciona)
- R-ACC-03: shadcn/ui components tienen accesibilidad built-in — mantenerla

---

## 13. Migration Strategy — Del Estado Actual al Monorepo

### 13.1 Qué se preserva del codebase actual

| Componente | Repo origen | Acción |
|-----------|-------------|--------|
| Apple Wallet Web Service Protocol | demo-cajero-panel | Migrar a `packages/wallet/apple/` con TypeScript |
| Google Wallet integration | demo-registro-clientes | Migrar a `packages/wallet/google/` con TypeScript |
| SVG→PNG strip generation | demo-cajero-panel | Migrar a `packages/wallet/shared/strip-generator.ts` |
| QR normalization | demo-cajero-panel | Migrar a `packages/shared/utils/normalize-qr.ts` |
| Supabase RPCs | Supabase dashboard | Migrar a PostgreSQL functions en `packages/db/migrations/` |
| Multi-tenancy middleware | demo-cajero-panel | Reimplementar con Better Auth organizations |
| Rate limiting logic | demo-registro-clientes | Migrar y mejorar con Redis |
| Landing page | cuik-landing | Rediseñar en el monorepo con shadcn/ui |

### 13.2 Qué se descarta

| Componente | Por qué |
|-----------|---------|
| Repos mv-* (Mascota Veloz) | Reemplazados por multi-tenancy real |
| JavaScript | Migración completa a TypeScript |
| Supabase como DB host | Migración a PostgreSQL self-hosted |
| styled-jsx e inline styles | Migración a Tailwind CSS 4 |
| Fat routes | Separación en domain/service/handler layers |
| service_account.json en repo | Variables de entorno |

### 13.3 Migration Phases

```
Phase 0: Setup                    Phase 1: Core
   │                                │
   ├── Monorepo scaffold            ├── DB schema + migrations
   ├── Docker compose               ├── Auth (Better Auth)
   ├── CI/CD pipeline               ├── Wallet packages (migrar)
   ├── shadcn/ui setup              ├── Registro de clientes
   └── Turborepo config             ├── Panel de cajero
                                    └── Landing page
Phase 2: Admin                    Phase 3: Editor
   │                                │
   ├── Super admin panel            ├── Editor Konva (en panel SA)
   ├── Solicitudes (leads)          ├── Templates por vertical
   ├── Tenant management (SA)       ├── Export canvas → pase
   ├── Branding por tenant          ├── Publish + regenerar
   ├── Demo generation (IA)         └── File uploads (MinIO)
   ├── AI business research
   └── Admin comercio (operativo)

Phase 4: Diferenciación
   │
   ├── Múltiples mecánicas
   ├── Geo-notifications
   ├── Campañas push
   ├── Tiers/niveles
   └── Analytics avanzada
```

---

## 14. Relationship to SDD & Engram

Este proyecto usa **Spec-Driven Development (SDD)** para la implementación y **Engram** para memoria persistente.

### SDD en Cuik

Cada fase de migración se implementa como un "change" de SDD:

| SDD Change | Phase | Description |
|-----------|-------|-------------|
| `cuik-monorepo-setup` | 0 | Scaffold del monorepo, Docker, CI |
| `cuik-db-schema` | 1 | Schema PostgreSQL multi-esquema con Drizzle |
| `cuik-auth` | 1 | Better Auth con roles y organizations |
| `cuik-wallet-migration` | 1 | Migrar Apple/Google Wallet a packages/wallet |
| `cuik-client-registration` | 1 | Registro de clientes del comercio |
| `cuik-cashier-panel` | 1 | Panel de cajero con QR scanner |
| `cuik-landing` | 1 | Landing page con registro de comercio |
| `cuik-super-admin` | 2 | Panel de super admin |
| `cuik-tenant-onboarding` | 2 | Workflow de onboarding con demo IA |
| `cuik-admin-dashboard` | 2 | Dashboard del admin del comercio |
| `cuik-pass-editor` | 3 | Editor visual de pases con Konva |
| `cuik-mechanics` | 4 | Múltiples mecánicas de fidelización |
| `cuik-campaigns` | 4 | Sistema de campañas push |
| `cuik-tiers` | 4 | Tiers y niveles de cliente |

### Engram en Cuik

- **Topic keys**: `cuik/*` para decisiones de arquitectura, `sdd/cuik-*/` para artefactos SDD
- **Cross-session context**: Decisiones técnicas, bugs encontrados, patrones establecidos
- **AI agent memory**: Convenciones de código, stack decisions, migration progress

---

## 15. Success Metrics

| Metric | Target (6 meses post-launch) |
|--------|------------------------------|
| Tenants activos | 20+ |
| Clientes registrados total | 5,000+ |
| Visitas registradas/mes | 15,000+ |
| Tiempo registro→primer pase | < 30 segundos |
| Tiempo scan→visita registrada | < 1 segundo |
| Uptime | 99.5%+ |
| Tasa de retención de tenants | 70%+ a 3 meses |
| Landing → registro comercio conversion | 5%+ |

---

## 16. Open Questions

1. **Pricing**: ¿Cuáles son los planes exactos y precios en soles? ¿Competir directamente con UEIA (S/69-289) o ir por debajo?
2. **Apple Developer Account**: ¿Se usa la cuenta existente o se necesita una nueva para el nuevo dominio?
3. **Dominio**: ¿`cuik.app`? ¿`cuik.io`? ¿`getcuik.com`? Impacta subdomains y URLs de registro.
4. **Mascota Veloz**: ¿Se migra como el primer tenant del nuevo sistema o se mantiene en paralelo durante la transición?
5. **WhatsApp Business API**: ¿Prioridad para Fase 2 o Fase 3? Requiere Meta Business verification.
6. **nano-banana para demos**: ¿Cuál es el flujo exacto de generación? ¿Se genera desde el panel admin o hay un CLI?
7. **Certificados Apple Wallet**: ¿Se necesitan nuevos certificados para el nuevo Pass Type ID?
8. **MinIO vs UploadThing**: MinIO es self-hosted (sin costo recurrente) pero requiere setup. ¿El equipo prefiere simplicidad (UploadThing) o control (MinIO)?
9. **Redis**: ¿Necesario desde el inicio o se puede empezar con in-memory cache y agregar Redis después?
10. **Backups**: ¿Estrategia de backup del VPS? ¿Snapshots del proveedor, rsync externo, o S3-compatible offsite?

---

## Appendix A: Competitive Landscape Summary

| Plataforma | Origen | Modelo | Wallet | Pricing | Cuik Advantage |
|-----------|--------|--------|--------|---------|----------------|
| **UEIA** | Perú | SaaS self-service | Apple + Google | S/69-289/mes | Integración wallet más profunda, editor visual, acompañamiento personalizado por SA |
| **Loopy Loyalty** | Global | SaaS self-service | Apple + Google | $25-95/mes | Pricing LATAM, acompañamiento, español nativo |
| **PassKit** | Global | API-first enterprise | Apple + Google | ~$59/mes + per-pass | Más accesible para SMBs, no requiere dev team |
| **Stamp Me** | Global | App + wallet | Apple + Google | $29-119/mes | Sin necesidad de app propia |
| **Square Loyalty** | USA | POS-integrated | NO | $49/mes/ubicación | Wallet nativo, independiente del POS |

---

## Appendix B: Pass Dimensions Reference

### Apple Wallet (storeCard)

| Asset | @1x | @2x | @3x | Notes |
|-------|-----|-----|-----|-------|
| Strip | 375×123 | **750×246** | 1125×369 | Canvas del editor |
| Logo | 160×50 max | 320×100 max | 480×150 max | Aspect ratio libre |
| Icon | 29×29 | 58×58 | 87×87 | Cuadrado |
| Thumbnail | 90×90 | 180×180 | 270×270 | No usado en storeCard |

### Stamp Grid (default layout en strip @2x: 750×246)

| Param | Default | Editable |
|-------|---------|----------|
| Stamp size | 86×86 px | SI |
| Grid | 4 cols × 2 rows | SI |
| Start X (top row) | 120 px | SI |
| Start Y (top row) | 37 px | SI |
| Gap X | 30 px | SI |
| Gap Y | 14 px | SI |
| Stamps total | 8 | SI (por promoción) |

### Google Wallet (Loyalty Object)

| Field | Type | Editable |
|-------|------|----------|
| Hero image | URL (750×246 recommended) | SI (mismo strip que Apple) |
| Logo | URL (660×660 max) | SI |
| Program name | Text | SI |
| Account name | Text (per client) | Auto |
| Loyalty points | Balance (text) | Auto |
| Text modules | Custom fields | SI |
| Barcode | QR Code | Auto |
| Locations | Lat/Lng array | SI |
| Messages | Push text | SI (campañas) |

---

## Appendix C: Email Templates Required

| Template | Trigger | To |
|----------|---------|----|
| `solicitud-recibida` | Comercio envía solicitud | Email del comercio |
| `nueva-solicitud-alert` | Comercio envía solicitud | Super Admin |
| `credenciales-comercio` | SA da de alta con demo | Email del comercio (incluye credenciales + URL demo) |
| `trial-activated` | SA activa demo | Email del comercio |
| `trial-expiring` | 2 días antes de vencer trial | Email del comercio + SA |
| `plan-activated` | SA activa plan | Email del comercio |
| `welcome-client` | Cliente se registra en comercio | Email del cliente (si proporcionó) |
| `reward-earned` | Cliente completa ciclo | Email del cliente |
| `campaign-blast` | Admin envía campaña email | Segmento seleccionado |

---

*Documento generado el 2026-03-12, actualizado el 2026-03-13. Basado en: análisis de 5 repos existentes (cuik-developer), investigación de mercado (20+ competidores), análisis de UEIA, dimensiones técnicas de Apple/Google Wallet, research de tecnologías modernas (2026), y correcciones de modelo de negocio (v0.2.0).*
