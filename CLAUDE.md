# Cuik — Convenciones de desarrollo

## Archivos protegidos

Antes de modificar cualquier archivo listado en [.claude/PROTECTED.md](.claude/PROTECTED.md), MUESTRA el cambio propuesto y ESPERA aprobacion explicita del usuario. Estos archivos afectan produccion directamente (firma de pases, autenticacion, schema de BD, logica de negocio core).

## Stack

- Monorepo: Turborepo + pnpm workspaces
- Framework: Next.js 16 (App Router, RSC)
- Lenguaje: TypeScript 5.7 (strict)
- UI: Tailwind CSS 4 + shadcn/ui
- ORM: Drizzle (PostgreSQL, multi-schema)
- Auth: Better Auth
- Lint/Format: Biome

## Convenciones

- Usar `pnpm` (no npm/yarn)
- Typecheck antes de commit: `npx tsc --noEmit -p <package>/tsconfig.json`
- No modificar `pnpm-lock.yaml` manualmente
- Commits en ingles, formato conventional commits
- No agregar dependencias sin justificacion

## Apple Wallet

- `APPLE_WEBSERVICE_URL` debe ser la URL base sin `/v1` — Apple agrega `/v1/devices/...` automaticamente
- Los colores en pass.json deben ser `rgb(r,g,b)`, NO hex — Apple rechaza hex
- `passkit-generator` esta pineado a 3.5.7 por un workaround de Symbol hack para `additionalInfoFields`
- El `authSecret` de cada tenant se encripta con AES-256-GCM (`apps/web/lib/encryption.ts`) antes de guardarse en `tenants.apple_config`

## Base de datos

- Schemas: `public` (tenants, plans), `loyalty` (clients, visits, rewards), `passes` (designs, instances, devices), `analytics`, `campaigns`
- Migraciones: `packages/db/migrations/` — nunca editar migraciones ya aplicadas
- Seed: `pnpm db:seed` o GET `/api/seed`

## Variables de entorno

- Nunca crear, modificar, ni commitear archivos `.env`
- Las env vars se documentan en `docs/MANUAL_DEPLOYMENT.md`
