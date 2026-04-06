"use server"

import { db, eq, plans } from "@cuik/db"
import {
  type CreatePlanInput,
  createPlanSchema,
  type UpdatePlanInput,
  updatePlanSchema,
} from "@cuik/shared/validators"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { auth } from "@/lib/auth"

// ── Types ───────────────────────────────────────────────────────────

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

// ── Auth helper ─────────────────────────────────────────────────────

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

export async function createPlan(input: CreatePlanInput): Promise<ActionResult<{ id: string }>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  const parsed = createPlanSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  try {
    const [inserted] = await db
      .insert(plans)
      .values({
        name: parsed.data.name,
        price: parsed.data.price,
        maxLocations: parsed.data.maxLocations,
        maxPromos: parsed.data.maxPromos,
        maxClients: parsed.data.maxClients,
        features: parsed.data.features ?? null,
        active: true,
      })
      .returning({ id: plans.id })

    revalidatePath("/admin/planes")

    return { success: true, data: { id: inserted.id } }
  } catch (err) {
    console.error("[createPlan]", err)
    return { success: false, error: "Error al crear el plan" }
  }
}

export async function updatePlan(
  planId: string,
  input: UpdatePlanInput,
): Promise<ActionResult<{ id: string }>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  const parsed = updatePlanSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  try {
    const existing = await db.select().from(plans).where(eq(plans.id, planId))
    if (existing.length === 0) {
      return { success: false, error: "Plan no encontrado" }
    }

    await db
      .update(plans)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(eq(plans.id, planId))

    revalidatePath("/admin/planes")

    return { success: true, data: { id: planId } }
  } catch (err) {
    console.error("[updatePlan]", err)
    return { success: false, error: "Error al actualizar el plan" }
  }
}

export async function togglePlanActive(
  planId: string,
): Promise<ActionResult<{ id: string; active: boolean }>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  try {
    const [existing] = await db.select().from(plans).where(eq(plans.id, planId))
    if (!existing) {
      return { success: false, error: "Plan no encontrado" }
    }

    const newActive = !existing.active

    await db
      .update(plans)
      .set({
        active: newActive,
        updatedAt: new Date(),
      })
      .where(eq(plans.id, planId))

    revalidatePath("/admin/planes")

    return { success: true, data: { id: planId, active: newActive } }
  } catch (err) {
    console.error("[togglePlanActive]", err)
    return { success: false, error: "Error al cambiar estado del plan" }
  }
}
