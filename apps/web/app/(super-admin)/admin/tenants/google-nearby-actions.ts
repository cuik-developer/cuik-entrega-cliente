"use server"

import { db, eq, tenants } from "@cuik/db"
import { walletConfigSchema } from "@cuik/shared/validators"
import { headers } from "next/headers"

import { auth } from "@/lib/auth"
import {
  type GoogleNearbyStatus,
  readGoogleNearbyStatus,
  syncGoogleNearby,
} from "@/lib/wallet/google-nearby"

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

async function requireSuperAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return "No autenticado"
  if ((session.user.role ?? "user") !== "super_admin") {
    return "No autorizado — se requiere super_admin"
  }
  return null
}

async function loadTenant(tenantId: string) {
  const [row] = await db
    .select({ name: tenants.name, walletConfig: tenants.walletConfig })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  return row ?? null
}

/** Read-only: what Google has for the tenant's nearby notifications vs. Cuik. */
export async function getGoogleNearbyStatus(
  tenantId: string,
): Promise<ActionResult<GoogleNearbyStatus>> {
  const error = await requireSuperAdmin()
  if (error) return { success: false, error }
  const tenant = await loadTenant(tenantId)
  if (!tenant) return { success: false, error: "Comercio no encontrado" }
  return { success: true, data: await readGoogleNearbyStatus(tenant.name, tenant.walletConfig) }
}

/** Send the Geolocalizadas locations to Google again, then re-read the status. */
export async function resyncGoogleNearby(
  tenantId: string,
): Promise<ActionResult<GoogleNearbyStatus>> {
  const error = await requireSuperAdmin()
  if (error) return { success: false, error }
  const tenant = await loadTenant(tenantId)
  if (!tenant) return { success: false, error: "Comercio no encontrado" }
  const sync = await syncGoogleNearby(
    tenant.name,
    walletConfigSchema.parse(tenant.walletConfig ?? {}),
  )
  if (!sync.ok) return { success: false, error: sync.error }
  return { success: true, data: await readGoogleNearbyStatus(tenant.name, tenant.walletConfig) }
}
