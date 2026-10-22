"use server"

import { and, db, eq, locations, plans, tenants } from "@cuik/db"
import type {
  TenantConfigInput,
  WalletConfig,
  WalletConfigLocationsInput,
} from "@cuik/shared/validators"
import {
  tenantConfigSchema,
  walletConfigLocationsSchema,
  walletConfigSchema,
} from "@cuik/shared/validators"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { auth } from "@/lib/auth"
import { getTenantForUser } from "@/lib/tenant-context"
import { getMemberRole, isTenantAdmin } from "@/lib/tenant-roles"
import { syncGoogleNearby } from "@/lib/wallet/google-nearby"

/**
 * The tenant of a caller allowed to change its settings (owner or admin).
 * Server actions can be called directly, so the panel hiding these screens
 * from cashiers is not enough.
 */
async function getTenantForAdmin(userId: string) {
  const tenant = await getTenantForUser(userId)
  if (!tenant) return { tenant: null, error: "Sin comercio asignado" } as const
  const role = await getMemberRole(userId, tenant.organizationId)
  if (!isTenantAdmin(role)) {
    return {
      tenant: null,
      error: "Solo el dueño o un administrador puede cambiar la configuración",
    } as const
  }
  return { tenant, error: null } as const
}

// ── Types ───────────────────────────────────────────────────────────

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export type LocationData = {
  id: string
  name: string
  address: string | null
  active: boolean
}

export type TenantConfigData = {
  id: string
  name: string
  slug: string
  status: string
  businessType: string | null
  address: string | null
  phone: string | null
  contactEmail: string | null
  planName: string | null
  planId: string | null
  walletConfig: WalletConfig | null
}

// ── Actions ─────────────────────────────────────────────────────────

export async function getTenantConfig(): Promise<ActionResult<TenantConfigData | null>> {
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })

  if (!session) {
    return { success: false, error: "No autenticado" }
  }

  try {
    const tenant = await getTenantForUser(session.user.id)
    if (!tenant) {
      return { success: true, data: null }
    }

    const [row] = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        status: tenants.status,
        businessType: tenants.businessType,
        address: tenants.address,
        phone: tenants.phone,
        contactEmail: tenants.contactEmail,
        planName: plans.name,
        planId: tenants.planId,
        walletConfig: tenants.walletConfig,
      })
      .from(tenants)
      .leftJoin(plans, eq(tenants.planId, plans.id))
      .where(eq(tenants.id, tenant.tenantId))
      .limit(1)

    if (!row) {
      return { success: true, data: null }
    }

    return {
      success: true,
      data: {
        ...row,
        walletConfig: (row.walletConfig as WalletConfig) ?? null,
      },
    }
  } catch (err) {
    console.error("[getTenantConfig]", err)
    return { success: false, error: "Error al obtener configuración" }
  }
}

export async function saveTenantConfig(data: TenantConfigInput): Promise<ActionResult<void>> {
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })

  if (!session) {
    return { success: false, error: "No autenticado" }
  }

  const parsed = tenantConfigSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  try {
    const { tenant, error: tenantError } = await getTenantForAdmin(session.user.id)
    if (!tenant) {
      return { success: false, error: tenantError }
    }

    const result = await db
      .update(tenants)
      .set({
        name: parsed.data.name,
        businessType: parsed.data.businessType || null,
        address: parsed.data.address || null,
        phone: parsed.data.phone || null,
        contactEmail: parsed.data.contactEmail || null,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.tenantId))
      .returning({ id: tenants.id })

    if (result.length === 0) {
      return { success: false, error: "Tenant no encontrado" }
    }

    revalidatePath("/panel/configuracion")

    return { success: true, data: undefined }
  } catch (err) {
    console.error("[saveTenantConfig]", err)
    return { success: false, error: "Error al guardar configuración" }
  }
}

export async function saveWalletConfig(
  data: WalletConfigLocationsInput,
): Promise<ActionResult<{ googleWarning: string | null }>> {
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })

  if (!session) {
    return { success: false, error: "No autenticado" }
  }

  const parsed = walletConfigLocationsSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  try {
    const { tenant, error: tenantError } = await getTenantForAdmin(session.user.id)
    if (!tenant) {
      return { success: false, error: tenantError }
    }

    const [before] = await db
      .select({ walletConfig: tenants.walletConfig })
      .from(tenants)
      .where(eq(tenants.id, tenant.tenantId))
      .limit(1)
    const locationsBefore = walletConfigSchema.safeParse(before?.walletConfig ?? {}).data?.locations

    const result = await db
      .update(tenants)
      .set({
        walletConfig: parsed.data,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.tenantId))
      .returning({ id: tenants.id })

    if (result.length === 0) {
      return { success: false, error: "Tenant no encontrado" }
    }

    revalidatePath("/panel/campanas/geolocalizadas")

    // Android nearby notifications use the same locations: update the Google
    // class only when the list actually changed (an empty list clears it).
    let googleWarning: string | null = null
    if (JSON.stringify(locationsBefore ?? []) !== JSON.stringify(parsed.data.locations)) {
      const sync = await syncGoogleNearby(tenant.tenantName, walletConfigSchema.parse(parsed.data))
      if (!sync.ok) {
        console.error("[saveWalletConfig] Google nearby sync failed:", sync.error)
        googleWarning =
          "Se guardó, pero no se pudo actualizar Google Wallet. Intenta guardar de nuevo en unos minutos."
      }
    }

    return { success: true, data: { googleWarning } }
  } catch (err) {
    console.error("[saveWalletConfig]", err)
    return { success: false, error: "Error al guardar configuracion de wallet" }
  }
}

// ── Location (sucursal) actions ─────────────────────────────────────

export async function getLocations(): Promise<ActionResult<LocationData[]>> {
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })

  if (!session) {
    return { success: false, error: "No autenticado" }
  }

  try {
    const tenant = await getTenantForUser(session.user.id)
    if (!tenant) {
      return { success: false, error: "Sin comercio asignado" }
    }

    const rows = await db
      .select({
        id: locations.id,
        name: locations.name,
        address: locations.address,
        active: locations.active,
      })
      .from(locations)
      .where(eq(locations.tenantId, tenant.tenantId))

    return { success: true, data: rows }
  } catch (err) {
    console.error("[getLocations]", err)
    return { success: false, error: "Error al obtener sucursales" }
  }
}

export async function addLocation(
  name: string,
  address: string,
): Promise<ActionResult<LocationData>> {
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })

  if (!session) {
    return { success: false, error: "No autenticado" }
  }

  if (!name.trim()) {
    return { success: false, error: "El nombre es obligatorio" }
  }

  try {
    const { tenant, error: tenantError } = await getTenantForAdmin(session.user.id)
    if (!tenant) {
      return { success: false, error: tenantError }
    }

    const [row] = await db
      .insert(locations)
      .values({
        tenantId: tenant.tenantId,
        name: name.trim(),
        address: address.trim() || null,
      })
      .returning({
        id: locations.id,
        name: locations.name,
        address: locations.address,
        active: locations.active,
      })

    revalidatePath("/panel/configuracion")
    return { success: true, data: row }
  } catch (err) {
    console.error("[addLocation]", err)
    return { success: false, error: "Error al agregar sucursal" }
  }
}

export async function deleteLocation(locationId: string): Promise<ActionResult<void>> {
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })

  if (!session) {
    return { success: false, error: "No autenticado" }
  }

  try {
    const { tenant, error: tenantError } = await getTenantForAdmin(session.user.id)
    if (!tenant) {
      return { success: false, error: tenantError }
    }

    const result = await db
      .delete(locations)
      .where(and(eq(locations.id, locationId), eq(locations.tenantId, tenant.tenantId)))
      .returning({ id: locations.id })

    if (result.length === 0) {
      return { success: false, error: "Sucursal no encontrada" }
    }

    revalidatePath("/panel/configuracion")
    return { success: true, data: undefined }
  } catch (err) {
    console.error("[deleteLocation]", err)
    return { success: false, error: "Error al eliminar sucursal" }
  }
}

export async function toggleLocation(
  locationId: string,
  active: boolean,
): Promise<ActionResult<void>> {
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })

  if (!session) {
    return { success: false, error: "No autenticado" }
  }

  try {
    const { tenant, error: tenantError } = await getTenantForAdmin(session.user.id)
    if (!tenant) {
      return { success: false, error: tenantError }
    }

    const result = await db
      .update(locations)
      .set({ active })
      .where(and(eq(locations.id, locationId), eq(locations.tenantId, tenant.tenantId)))
      .returning({ id: locations.id })

    if (result.length === 0) {
      return { success: false, error: "Sucursal no encontrada" }
    }

    revalidatePath("/panel/configuracion")
    return { success: true, data: undefined }
  } catch (err) {
    console.error("[toggleLocation]", err)
    return { success: false, error: "Error al actualizar sucursal" }
  }
}
