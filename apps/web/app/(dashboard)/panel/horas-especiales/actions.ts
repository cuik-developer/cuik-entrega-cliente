"use server"

import { and, db, eq, promotions } from "@cuik/db"
import {
  type BonusWindow,
  bonusWindowsSchema,
  pointsPromotionConfigSchema,
  stampsPromotionConfigSchema,
} from "@cuik/shared/validators"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { auth } from "@/lib/auth"
import { getTenantForUser } from "@/lib/tenant-context"
import { getMemberRole, isTenantAdmin } from "@/lib/tenant-roles"

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

/**
 * Save the "horas especiales" (x2 / x3 stamps or points) of the tenant's
 * active promotion. Only the owner or an admin may change them, and only the
 * `accumulation.bonusWindows` key of the config is written.
 */
export async function saveBonusWindows(input: unknown): Promise<ActionResult<BonusWindow[]>> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { success: false, error: "No autenticado" }

  const tenant = await getTenantForUser(session.user.id)
  if (!tenant) return { success: false, error: "Sin comercio asignado" }
  if (tenant.readOnly) return { success: false, error: "Vista de solo lectura" }
  const role = await getMemberRole(session.user.id, tenant.organizationId)
  if (!isTenantAdmin(role)) {
    return {
      success: false,
      error: "Solo el dueño o un administrador puede cambiar las horas especiales",
    }
  }

  const parsed = bonusWindowsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Datos inválidos" }
  }

  try {
    const saved = await db.transaction(async (tx) => {
      const [promo] = await tx
        .select({ id: promotions.id, type: promotions.type, config: promotions.config })
        .from(promotions)
        .where(and(eq(promotions.tenantId, tenant.tenantId), eq(promotions.active, true)))
        .limit(1)
        .for("update")
      if (!promo) return null

      const schema =
        promo.type === "points" ? pointsPromotionConfigSchema : stampsPromotionConfigSchema
      const current = schema.parse(promo.config ?? {})
      const next = {
        ...current,
        accumulation: { ...current.accumulation, bonusWindows: parsed.data },
      }
      await tx.update(promotions).set({ config: next }).where(eq(promotions.id, promo.id))
      return parsed.data
    })

    if (!saved) return { success: false, error: "No hay una promoción activa" }
    revalidatePath("/panel/horas-especiales")
    return { success: true, data: saved }
  } catch (err) {
    console.error("[saveBonusWindows]", err)
    return { success: false, error: "No se pudieron guardar las horas especiales" }
  }
}
