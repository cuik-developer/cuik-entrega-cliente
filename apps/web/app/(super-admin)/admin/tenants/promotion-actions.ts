"use server"

import { and, db, desc, eq, ne, passAssets, passDesigns, promotions, tenants } from "@cuik/db"
import {
  type CreatePromotionInput,
  createPromotionSchema,
  pointsPromotionConfigSchema,
  stampsPromotionConfigSchema,
  type UpdatePointsPromotionInput,
  type UpdatePromotionInput,
  updatePointsPromotionSchema,
  updatePromotionSchema,
} from "@cuik/shared/validators"
// revalidatePath removed — modal components refresh data manually
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

export async function getPromotionsByTenant(
  tenantId: string,
): Promise<ActionResult<(typeof promotions.$inferSelect)[]>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  try {
    const rows = await db
      .select()
      .from(promotions)
      .where(eq(promotions.tenantId, tenantId))
      .orderBy(desc(promotions.createdAt))

    return { success: true, data: rows }
  } catch (err) {
    console.error("[getPromotionsByTenant]", err)
    return { success: false, error: "Error al obtener promociones" }
  }
}

export async function createPromotion(
  tenantId: string,
  input: CreatePromotionInput,
): Promise<ActionResult<{ id: string }>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  const parsed = createPromotionSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  try {
    // Always create as inactive — SA activates manually when ready
    const [inserted] = await db
      .insert(promotions)
      .values({
        tenantId,
        type: parsed.data.type,
        maxVisits: parsed.data.maxVisits,
        rewardValue: parsed.data.rewardValue,
        active: false,
        config: parsed.data.config,
      })
      .returning({ id: promotions.id })

    // Auto-create a draft pass design linked to this promotion
    try {
      const [tenant] = await db
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)

      const typeName = parsed.data.type === "points" ? "Puntos" : "Sellos"
      const designName = `${typeName} - ${tenant?.name ?? "Comercio"}`

      const [newDesign] = await db
        .insert(passDesigns)
        .values({
          tenantId,
          promotionId: inserted.id,
          name: designName,
          type: "apple_store",
          isActive: false,
          isTemplate: false,
          version: 1,
          colors: {
            backgroundColor: "#1a1a2e",
            foregroundColor: "#ffffff",
            labelColor: "#e0e0e0",
          },
          stampsConfig:
            parsed.data.type === "stamps"
              ? {
                  maxVisits: parsed.data.maxVisits ?? 8,
                  gridCols: 4,
                  gridRows: 2,
                }
              : null,
          fields:
            parsed.data.type === "points"
              ? {
                  headerFields: [
                    {
                      key: "points",
                      label: "PUNTOS",
                      value: "{{points.balance}}",
                    },
                  ],
                  secondaryFields: [
                    {
                      key: "client",
                      label: "CLIENTE",
                      value: "{{client.name}}",
                    },
                  ],
                  backFields: [
                    {
                      key: "balance",
                      label: "Balance de puntos",
                      value: "{{points.balance}}",
                    },
                    {
                      key: "visits",
                      label: "Visitas totales",
                      value: "{{stamps.total}}",
                    },
                  ],
                }
              : {
                  headerFields: [
                    {
                      key: "total",
                      label: "# DE VISITAS",
                      value: "{{stamps.total}}",
                    },
                  ],
                  secondaryFields: [
                    {
                      key: "client",
                      label: "NOMBRE",
                      value: "{{client.name}}",
                    },
                    {
                      key: "stamps",
                      label: "Visitas en ciclo",
                      value: "{{stamps.current}}",
                    },
                  ],
                  backFields: [
                    {
                      key: "stamps_b",
                      label: "Visitas en ciclo",
                      value: "{{stamps.current}} de {{stamps.max}}",
                    },
                    {
                      key: "total_b",
                      label: "Visitas totales",
                      value: "{{stamps.total}}",
                    },
                    {
                      key: "rewards_b",
                      label: "Premios pendientes",
                      value: "{{rewards.pending}}",
                    },
                  ],
                },
          canvasData: { width: 375, height: 123, elements: [] },
        })
        .returning({ id: passDesigns.id })

      // Insert default assets so the wallet can generate .pkpass immediately
      await db.insert(passAssets).values([
        {
          designId: newDesign.id,
          type: "icon" as const,
          url: "/defaults/cuik-icon.png",
          metadata: { description: "Default icon" },
        },
        {
          designId: newDesign.id,
          type: "strip_bg" as const,
          url: "/defaults/cuik-strip.png",
          metadata: { description: "Default strip" },
        },
        {
          designId: newDesign.id,
          type: "stamp" as const,
          url: "/defaults/cuik-stamp.png",
          metadata: { description: "Default stamp" },
        },
      ])
    } catch (designErr) {
      // Don't fail the promotion creation if design auto-create fails
      console.error("[createPromotion] Error auto-creating pass design:", designErr)
    }

    // Data refresh handled by parent component

    return { success: true, data: { id: inserted.id } }
  } catch (err) {
    console.error("[createPromotion]", err)
    return { success: false, error: "Error al crear la promocion" }
  }
}

export async function updatePromotion(
  promotionId: string,
  input: UpdatePromotionInput | UpdatePointsPromotionInput,
): Promise<ActionResult<{ id: string }>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  try {
    const [existing] = await db.select().from(promotions).where(eq(promotions.id, promotionId))

    if (!existing) {
      return { success: false, error: "Promocion no encontrada" }
    }

    const isPoints = existing.type === "points"

    // Validate with the correct schema based on promotion type
    const schema = isPoints ? updatePointsPromotionSchema : updatePromotionSchema
    const parsed = schema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0].message }
    }

    // Deep-merge config if provided
    let mergedConfig = existing.config
    if (parsed.data.config) {
      if (isPoints) {
        const currentConfig = pointsPromotionConfigSchema.parse(existing.config ?? {})
        const inputConfig = parsed.data.config as Record<string, unknown>
        mergedConfig = {
          ...currentConfig,
          ...inputConfig,
          points: {
            ...currentConfig.points,
            ...((inputConfig.points as Record<string, unknown>) ?? {}),
          },
          accumulation: {
            ...currentConfig.accumulation,
            ...((inputConfig.accumulation as Record<string, unknown>) ?? {}),
          },
          tiers: {
            ...currentConfig.tiers,
            ...((inputConfig.tiers as Record<string, unknown>) ?? {}),
          },
          locationRestrictions: {
            ...currentConfig.locationRestrictions,
            ...((inputConfig.locationRestrictions as Record<string, unknown>) ?? {}),
          },
        }
      } else {
        const currentConfig = stampsPromotionConfigSchema.parse(existing.config ?? {})
        const inputConfig = parsed.data.config as Record<string, unknown>
        mergedConfig = {
          ...currentConfig,
          ...inputConfig,
          stamps: {
            ...currentConfig.stamps,
            ...((inputConfig.stamps as Record<string, unknown>) ?? {}),
          },
          accumulation: {
            ...currentConfig.accumulation,
            ...((inputConfig.accumulation as Record<string, unknown>) ?? {}),
          },
          tiers: {
            ...currentConfig.tiers,
            ...((inputConfig.tiers as Record<string, unknown>) ?? {}),
          },
          locationRestrictions: {
            ...currentConfig.locationRestrictions,
            ...((inputConfig.locationRestrictions as Record<string, unknown>) ?? {}),
          },
        }
      }
    }

    const updateData: Record<string, unknown> = {}
    if (parsed.data.maxVisits !== undefined) updateData.maxVisits = parsed.data.maxVisits
    if (parsed.data.rewardValue !== undefined) updateData.rewardValue = parsed.data.rewardValue
    if (parsed.data.active !== undefined) updateData.active = parsed.data.active
    if (parsed.data.config) updateData.config = mergedConfig

    await db.update(promotions).set(updateData).where(eq(promotions.id, promotionId))

    // Data refresh handled by parent component

    return { success: true, data: { id: promotionId } }
  } catch (err) {
    console.error("[updatePromotion]", err)
    return { success: false, error: "Error al actualizar la promocion" }
  }
}

export async function togglePromotionActive(
  promotionId: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  try {
    const [existing] = await db.select().from(promotions).where(eq(promotions.id, promotionId))

    if (!existing) {
      return { success: false, error: "Promocion no encontrada" }
    }

    if (active) {
      // Deactivate all other promotions for this tenant
      await db
        .update(promotions)
        .set({ active: false })
        .where(and(eq(promotions.tenantId, existing.tenantId), ne(promotions.id, promotionId)))
      // Activate this one
      await db.update(promotions).set({ active: true }).where(eq(promotions.id, promotionId))
    } else {
      // Just deactivate
      await db.update(promotions).set({ active: false }).where(eq(promotions.id, promotionId))
    }

    return { success: true, data: { id: promotionId } }
  } catch (err) {
    console.error("[togglePromotionActive]", err)
    return { success: false, error: "Error al cambiar estado de la promocion" }
  }
}

export async function deletePromotion(promotionId: string): Promise<ActionResult<{ id: string }>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  try {
    const [existing] = await db.select().from(promotions).where(eq(promotions.id, promotionId))

    if (!existing) {
      return { success: false, error: "Promocion no encontrada" }
    }

    // Soft delete: set active = false
    await db.update(promotions).set({ active: false }).where(eq(promotions.id, promotionId))

    // Data refresh handled by parent component

    return { success: true, data: { id: promotionId } }
  } catch (err) {
    console.error("[deletePromotion]", err)
    return { success: false, error: "Error al eliminar la promocion" }
  }
}
