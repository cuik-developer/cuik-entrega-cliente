"use server"

import { and, db, eq, ne, passDesigns, tenants } from "@cuik/db"
import type { PassDesignConfigV2 } from "@cuik/shared/types/editor"
import type { TenantBranding } from "@cuik/shared/validators"
import { tenantBrandingSchema } from "@cuik/shared/validators"
import { getConfigVersion } from "@cuik/shared/validators/pass-design-schema"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { auth } from "@/lib/auth"

// ── Types ───────────────────────────────────────────────────────────

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

// ── Auth helper for server actions ──────────────────────────────────

async function requireSuperAdmin() {
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })

  if (!session) {
    return { session: null, error: "No autenticado" } as const
  }

  const role = session.user.role ?? "user"
  if (role !== "super_admin") {
    return { session: null, error: "No autorizado — se requiere super_admin" } as const
  }

  return { session, error: null } as const
}

// ── Actions ─────────────────────────────────────────────────────────

export async function getBranding(tenantId: string): Promise<ActionResult<TenantBranding | null>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  try {
    const [tenant] = await db
      .select({ branding: tenants.branding })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)

    if (!tenant) {
      return { success: false, error: "Tenant no encontrado" }
    }

    if (!tenant.branding) {
      return { success: true, data: null }
    }

    const parsed = tenantBrandingSchema.safeParse(tenant.branding)
    if (!parsed.success) {
      return { success: true, data: null }
    }

    return { success: true, data: parsed.data }
  } catch (err) {
    console.error("[getBranding]", err)
    return { success: false, error: "Error al obtener branding" }
  }
}

export async function saveBranding(
  tenantId: string,
  config: TenantBranding,
): Promise<ActionResult<void>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  const parsed = tenantBrandingSchema.safeParse(config)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  try {
    const result = await db
      .update(tenants)
      .set({
        branding: parsed.data,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning({ id: tenants.id })

    if (result.length === 0) {
      return { success: false, error: "Tenant no encontrado" }
    }

    revalidatePath("/admin/branding")

    return { success: true, data: undefined }
  } catch (err) {
    console.error("[saveBranding]", err)
    return { success: false, error: "Error al guardar branding" }
  }
}

export async function getPublishedPassColors(
  tenantId: string,
): Promise<ActionResult<{ suggestedPrimary: string; suggestedAccent: string } | null>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  try {
    const [design] = await db
      .select({
        canvasData: passDesigns.canvasData,
        colors: passDesigns.colors,
      })
      .from(passDesigns)
      .where(and(eq(passDesigns.tenantId, tenantId), eq(passDesigns.isActive, true)))
      .limit(1)

    if (!design) {
      return { success: true, data: null }
    }

    // Try to extract colors from the design
    // V2 config has colors at the top level, V1 uses denormalized colors column
    const configVersion = getConfigVersion(design.canvasData)

    let backgroundColor: string | undefined
    let foregroundColor: string | undefined

    if (configVersion === "v2") {
      const v2Config = design.canvasData as PassDesignConfigV2
      backgroundColor = v2Config.colors?.backgroundColor
      foregroundColor = v2Config.colors?.foregroundColor
    } else if (design.colors && typeof design.colors === "object") {
      const colors = design.colors as Record<string, unknown>
      backgroundColor =
        typeof colors.backgroundColor === "string" ? colors.backgroundColor : undefined
      foregroundColor =
        typeof colors.foregroundColor === "string" ? colors.foregroundColor : undefined
    }

    if (!backgroundColor && !foregroundColor) {
      return { success: true, data: null }
    }

    return {
      success: true,
      data: {
        suggestedPrimary: backgroundColor ?? "#0e70db",
        suggestedAccent: foregroundColor ?? "#ff4810",
      },
    }
  } catch (err) {
    console.error("[getPublishedPassColors]", err)
    return { success: false, error: "Error al obtener colores del pase" }
  }
}

export async function listTenantsForBranding(): Promise<
  ActionResult<
    {
      id: string
      businessName: string
      slug: string
      status: string
      branding: TenantBranding | null
    }[]
  >
> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  try {
    const results = await db
      .select({
        id: tenants.id,
        businessName: tenants.name,
        slug: tenants.slug,
        status: tenants.status,
        branding: tenants.branding,
      })
      .from(tenants)
      .where(ne(tenants.status, "cancelled"))
      .orderBy(tenants.name)

    const mapped = results.map((row) => {
      let branding: TenantBranding | null = null
      if (row.branding) {
        const parsed = tenantBrandingSchema.safeParse(row.branding)
        if (parsed.success) {
          branding = parsed.data
        }
      }
      return {
        id: row.id,
        businessName: row.businessName,
        slug: row.slug,
        status: row.status,
        branding,
      }
    })

    return { success: true, data: mapped }
  } catch (err) {
    console.error("[listTenantsForBranding]", err)
    return { success: false, error: "Error al listar tenants" }
  }
}
