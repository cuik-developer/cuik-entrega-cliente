import { parseTenantFeatures } from "@cuik/shared/validators"

import { errorResponse, requireAuth, requireTenantAdmin, resolveTenant } from "@/lib/api-utils"
import type { GrowthTenant } from "./store"

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type GrowthRouteContext = {
  session: { user: { id: string; role?: string }; saViewTenantId?: string | null }
  tenant: GrowthTenant & { slug: string }
  /** Super-admin "ver como el comercio": reads only, never a PII download. */
  readOnly: boolean
}

/**
 * Every merchant Growth route: signed in, the tenant exists, the user is its
 * owner or an admin (or the super-admin read-only view), and Growth is on
 * for the tenant. Returns the response to send when any of that fails.
 */
export async function growthContext(
  request: Request,
  params: Promise<{ tenant: string }>,
): Promise<{ ok: true; ctx: GrowthRouteContext } | { ok: false; response: Response }> {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return { ok: false, response: authError }
  const { tenant: slug } = await params
  const tenant = await resolveTenant(slug)
  if (!tenant) return { ok: false, response: errorResponse("Tenant not found", 404) }
  const adminError = await requireTenantAdmin(session, tenant.id)
  if (adminError) return { ok: false, response: adminError }
  if (!parseTenantFeatures(tenant.features).growth) {
    return { ok: false, response: errorResponse("Growth no está activo para este comercio", 403) }
  }
  return {
    ok: true,
    ctx: {
      session,
      readOnly: session.user.role === "super_admin" && session.saViewTenantId === tenant.id,
      tenant: { id: tenant.id, name: tenant.name, timezone: tenant.timezone, slug: tenant.slug },
    },
  }
}
