import { clients, db, eq, tenants } from "@cuik/db"
import { appleConfigSchema } from "@cuik/shared/validators"
import type { AppleWalletConfig } from "@cuik/wallet/shared"
import { validateAppleEnv } from "@cuik/wallet/shared"
import { decrypt } from "../encryption"

// In-memory cache with 5-minute TTL
const CONFIG_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const configCache = new Map<string, { config: AppleWalletConfig | null; resolvedAt: number }>()

/**
 * Resolve the Apple Wallet signing config for a given tenant.
 *
 * Resolution order:
 * 1. Cached result (within TTL)
 * 2. Tenant's `apple_config` JSONB column (mode === "production")
 * 3. Global env vars via `validateAppleEnv()` (fallback)
 */
export async function getTenantAppleConfig(tenantId: string): Promise<AppleWalletConfig | null> {
  // 1. Check cache
  const cached = configCache.get(tenantId)
  if (cached && Date.now() - cached.resolvedAt < CONFIG_CACHE_TTL) {
    return cached.config
  }

  // 2. Query DB for tenant's apple_config
  const [tenant] = await db
    .select({ appleConfig: tenants.appleConfig })
    .from(tenants)
    .where(eq(tenants.id, tenantId))

  if (!tenant) {
    // Tenant not found — fallback to global
    const globalConfig = validateAppleEnv()
    configCache.set(tenantId, { config: globalConfig, resolvedAt: Date.now() })
    return globalConfig
  }

  // 3. Parse the JSONB config
  const parsed = appleConfigSchema.safeParse(tenant.appleConfig)

  if (!parsed.success || !parsed.data || parsed.data.mode !== "production") {
    // demo / configuring / null → fallback to global env vars
    const globalConfig = validateAppleEnv()
    configCache.set(tenantId, { config: globalConfig, resolvedAt: Date.now() })
    return globalConfig
  }

  const cfg = parsed.data

  // 4. Production mode — validate required fields exist before decrypting
  if (
    !cfg.signerCertBase64 ||
    !cfg.signerKeyBase64 ||
    !cfg.authSecret ||
    !cfg.passTypeId ||
    !cfg.teamId
  ) {
    console.error(
      `[getTenantAppleConfig] Tenant ${tenantId} in production mode but missing required fields`,
    )
    const globalConfig = validateAppleEnv()
    configCache.set(tenantId, { config: globalConfig, resolvedAt: Date.now() })
    return globalConfig
  }

  try {
    const signerCert = decrypt(cfg.signerCertBase64)
    const signerKey = decrypt(cfg.signerKeyBase64)
    const authSecret = decrypt(cfg.authSecret)
    const signerKeyPassphrase = cfg.signerKeyPassphrase
      ? decrypt(cfg.signerKeyPassphrase)
      : undefined

    // WWDR: use tenant override if present, otherwise fall back to env
    const wwdrBase64 = cfg.wwdrBase64
      ? decrypt(cfg.wwdrBase64)
      : (process.env.APPLE_WWDR_BASE64 ?? "")

    const config: AppleWalletConfig = {
      teamId: cfg.teamId,
      passTypeId: cfg.passTypeId,
      signerCertBase64: signerCert,
      signerKeyBase64: signerKey,
      signerKeyPassphrase,
      wwdrBase64,
      authSecret,
      webServiceUrl: process.env.APPLE_WEBSERVICE_URL ?? "",
    }

    configCache.set(tenantId, { config, resolvedAt: Date.now() })
    return config
  } catch (error) {
    console.error(`[getTenantAppleConfig] Failed to decrypt config for tenant ${tenantId}:`, error)
    // Fallback to global on decrypt failure
    const globalConfig = validateAppleEnv()
    configCache.set(tenantId, { config: globalConfig, resolvedAt: Date.now() })
    return globalConfig
  }
}

/**
 * Invalidate the cached Apple config for a tenant.
 * Call this after updating a tenant's apple_config in the DB.
 */
export function invalidateTenantAppleConfigCache(tenantId: string): void {
  configCache.delete(tenantId)
}

/**
 * Resolve the tenantId for a given client.
 * Used by the Apple Web Service Protocol to route pass updates
 * to the correct tenant's signing config.
 */
export async function resolveClientTenantId(clientId: string): Promise<string | null> {
  const [client] = await db
    .select({ tenantId: clients.tenantId })
    .from(clients)
    .where(eq(clients.id, clientId))

  return client?.tenantId ?? null
}
