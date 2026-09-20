import { db, eq, globalConfig } from "@cuik/db"

/**
 * Tenants that belong to the Cuik team (internal demos, test accounts).
 * Stored in global_config as an array of tenant ids and excluded from the
 * super-admin Métricas by default. Managed in Configuración.
 */
export const INTERNAL_TENANTS_KEY = "internal_tenant_ids"

export async function getInternalTenantIds(): Promise<string[]> {
  const rows = await db
    .select({ value: globalConfig.value })
    .from(globalConfig)
    .where(eq(globalConfig.key, INTERNAL_TENANTS_KEY))
    .limit(1)
  const v = rows[0]?.value
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
}

export async function setInternalTenantIds(ids: string[]): Promise<void> {
  const clean = [...new Set(ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))]
  await db
    .insert(globalConfig)
    .values({ key: INTERNAL_TENANTS_KEY, value: clean, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: globalConfig.key,
      set: { value: clean, updatedAt: new Date() },
    })
}
