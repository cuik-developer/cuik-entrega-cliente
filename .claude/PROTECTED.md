# Archivos Protegidos — NO MODIFICAR sin aprobacion explicita

## Regla general
Antes de editar cualquier archivo de esta lista, MUESTRA el cambio propuesto y ESPERA aprobacion.

## Core Apple Wallet (firma y generacion de pases)
- `packages/wallet/src/apple/create-pass.ts`
- `packages/wallet/src/apple/strip-image.ts`
- `packages/wallet/src/apple/web-service.ts`
- `packages/wallet/src/apple/apns.ts`
- `packages/wallet/src/shared/types.ts`
- `apps/web/app/api/apple-wallet/v1/[...path]/route.ts`
- `apps/web/lib/wallet/tenant-apple-config.ts`
- `apps/web/lib/encryption.ts`
- `apps/web/app/api/admin/tenants/[id]/apple-config/route.ts`

## Google Wallet
- `packages/wallet/src/google/loyalty-object.ts`
- `packages/wallet/src/google/*.ts`

## Autenticacion y seguridad
- `apps/web/lib/auth.ts`
- `apps/web/lib/auth-client.ts`
- `apps/web/lib/api-utils.ts` (requireAuth, requireTenantMembership, resolveTenant)
- `apps/web/middleware.ts`

## Schema de base de datos (migraciones pueden romper produccion)
- `packages/db/schema/*.ts`
- `packages/db/migrations/*.sql`
- `packages/db/drizzle.config.ts`

## Registro de visitas (logica de negocio core)
- `apps/web/app/api/[tenant]/visits/route.ts`
- `apps/web/lib/loyalty/register-visit.ts`
- `apps/web/lib/loyalty/redeem-reward.ts`
- `apps/web/lib/loyalty/redeem-points.ts`
- `packages/shared/validators/visit-schema.ts`
- `packages/shared/validators/pass-design-schema.ts`

## Registro de clientes
- `apps/web/app/api/[tenant]/register-client/route.ts`

## Endpoints de wallet para clientes
- `apps/web/app/api/[tenant]/wallet/apple/[clientId]/route.ts`
- `apps/web/app/api/[tenant]/wallet/apple/[clientId]/[token]/route.ts`
- `apps/web/app/api/[tenant]/wallet/google/*/route.ts`

## Cajero (escaneo QR y flujo de visita)
- `apps/web/app/(cajero)/cajero/escanear/page.tsx`

## Cron jobs (batch operations)
- `apps/web/app/api/cron/analytics-daily/route.ts`
- `apps/web/app/api/cron/analytics-retention/route.ts`
- `apps/web/app/api/cron/campaigns-scheduled/route.ts`

## Configuracion de produccion
- `docker/Dockerfile`
- `apps/web/next.config.mjs`
- `turbo.json`
- `biome.json`
- `pnpm-workspace.yaml`

## Configuracion de paquetes
- `package.json` (raiz y de cada package)
- `pnpm-lock.yaml`
- `tsconfig.json` (raiz)

## Variables de entorno
- `.env*` (nunca crear, modificar ni leer archivos .env)

## Assets y certificados
- Nunca eliminar ni sobreescribir archivos en MinIO
- Nunca modificar certificados Apple/Google en la DB directamente

## Archivos de convencion
- `CLAUDE.md`
- `.claude/PROTECTED.md`
