"use server"

import { db, eq, tenants } from "@cuik/db"
import { type RegistrationConfig, registrationConfigSchema } from "@cuik/shared/validators"
// revalidatePath removed — modal components refresh data manually
import { headers } from "next/headers"

import { auth } from "@/lib/auth"

// -- Types --

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

// -- Auth helper --

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

// -- Actions --

export async function getRegistrationConfig(
  tenantId: string,
): Promise<ActionResult<RegistrationConfig | null>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  try {
    const [tenant] = await db
      .select({ registrationConfig: tenants.registrationConfig })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)

    if (!tenant) {
      return { success: false, error: "Tenant no encontrado" }
    }

    if (!tenant.registrationConfig) {
      return { success: true, data: null }
    }

    const parsed = registrationConfigSchema.safeParse(tenant.registrationConfig)
    if (!parsed.success) {
      console.error("[getRegistrationConfig] Invalid config in DB:", parsed.error.flatten())
      return { success: true, data: null }
    }

    return { success: true, data: parsed.data }
  } catch (err) {
    console.error("[getRegistrationConfig]", err)
    return { success: false, error: "Error al obtener configuracion de registro" }
  }
}

export async function updateRegistrationConfig(
  tenantId: string,
  config: RegistrationConfig | null,
): Promise<ActionResult<{ tenantId: string }>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  try {
    // Validate config if provided
    if (config !== null) {
      const parsed = registrationConfigSchema.safeParse(config)
      if (!parsed.success) {
        return { success: false, error: parsed.error.errors[0].message }
      }
      config = parsed.data
    }

    // Verify tenant exists
    const [tenant] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)

    if (!tenant) {
      return { success: false, error: "Tenant no encontrado" }
    }

    await db.update(tenants).set({ registrationConfig: config }).where(eq(tenants.id, tenantId))

    // Data refresh handled by parent component

    return { success: true, data: { tenantId } }
  } catch (err) {
    console.error("[updateRegistrationConfig]", err)
    return { success: false, error: "Error al actualizar configuracion de registro" }
  }
}
