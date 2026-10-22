"use server"

import {
  and,
  clients,
  db,
  desc,
  eq,
  inArray,
  ne,
  passAssets,
  passDesigns,
  passInstances,
  promotions,
  sql,
  tenants,
} from "@cuik/db"
import {
  type CreatePromotionInput,
  createPromotionSchema,
  type ExpirationPolicy,
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
import { allMilestoneMessages } from "@/lib/loyalty/milestones"
import { restampOpenLots } from "@/lib/loyalty/points-lots"

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

/**
 * The keys of one config block the caller actually sent. `.partial()` is
 * shallow, so zod fills every missing key of a sent block with its default
 * (`bonusWindows: []`, `birthdayBonus: 0`, `milestones: []`…); keeping only
 * what came in the raw input means a save never wipes settings that another
 * screen (the merchant's horas especiales, a seed, SQL) put there.
 */
function onlySent(rawBlock: unknown, parsedBlock: unknown): Record<string, unknown> {
  const parsed = (parsedBlock ?? {}) as Record<string, unknown>
  const raw = rawBlock && typeof rawBlock === "object" ? (rawBlock as Record<string, unknown>) : {}
  // A key sent as `undefined` was not really sent (zod would fill its default).
  return Object.fromEntries(Object.entries(parsed).filter(([key]) => raw[key] !== undefined))
}

/**
 * Deep-merge of a promotion config: each block only takes the keys the caller
 * actually sent (see onlySent), so defaults never overwrite stored data.
 */
function mergePromotionConfig(
  existingConfig: unknown,
  isPoints: boolean,
  rawInput: unknown,
  parsedInput: unknown,
) {
  const raw = (rawInput ?? {}) as Record<string, unknown>
  const inputConfig = parsedInput as Record<string, unknown>
  const block = (key: string) => onlySent(raw[key], inputConfig[key])
  const currentConfig = isPoints
    ? pointsPromotionConfigSchema.parse(existingConfig ?? {})
    : stampsPromotionConfigSchema.parse(existingConfig ?? {})
  const typeKey = isPoints ? "points" : "stamps"
  return {
    ...currentConfig,
    ...inputConfig,
    [typeKey]: {
      ...(currentConfig as unknown as Record<string, Record<string, unknown>>)[typeKey],
      ...block(typeKey),
    },
    accumulation: { ...currentConfig.accumulation, ...block("accumulation") },
    tiers: { ...currentConfig.tiers, ...block("tiers") },
    locationRestrictions: {
      ...currentConfig.locationRestrictions,
      ...block("locationRestrictions"),
    },
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Locks every promotion of the promotion's tenant, always in id order, and
 * returns the promotion itself. Two activations of the same tenant then queue
 * up instead of deadlocking (each holding one row and waiting for the other),
 * and a merchant save of the same row (horas especiales) waits too.
 */
async function lockTenantPromotions(tx: Tx, promotionId: string) {
  const [ref] = await tx
    .select({ tenantId: promotions.tenantId })
    .from(promotions)
    .where(eq(promotions.id, promotionId))
  if (!ref) return null
  await tx
    .select({ id: promotions.id })
    .from(promotions)
    .where(eq(promotions.tenantId, ref.tenantId))
    .orderBy(promotions.id)
    .for("update")
  const [existing] = await tx.select().from(promotions).where(eq(promotions.id, promotionId))
  return existing ?? null
}

/** Turns off every other promotion of the tenant (rows already locked). */
async function deactivateOthers(tx: Tx, tenantId: string, keepId: string) {
  await tx
    .update(promotions)
    .set({ active: false })
    .where(and(eq(promotions.tenantId, tenantId), ne(promotions.id, keepId)))
}

async function restampTenantLots(tx: Tx, tenantId: string, policy: ExpirationPolicy) {
  const [tenant] = await tx
    .select({ timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const { updated } = await restampOpenLots(tx, {
    tenantId,
    policy,
    timezone: tenant?.timezone ?? "America/Lima",
  })
  return updated
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

    // Created inactive, so the tenant's points lots are left alone: they take
    // this promotion's expiration policy when it is activated.

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
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one transaction validates, merges, activates, clears stale milestone texts and re-stamps points lots
    return await db.transaction(async (tx): Promise<ActionResult<{ id: string }>> => {
      // Read under a row lock: the merchant panel (horas especiales) writes the
      // same config, and a merge built from a stale read would undo its save.
      const existing = await lockTenantPromotions(tx, promotionId)

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

      const mergedConfig = parsed.data.config
        ? mergePromotionConfig(existing.config, isPoints, input.config, parsed.data.config)
        : existing.config

      const activating = parsed.data.active === true && !existing.active

      const updateData: Record<string, unknown> = {}
      if (parsed.data.maxVisits !== undefined) updateData.maxVisits = parsed.data.maxVisits
      if (parsed.data.rewardValue !== undefined) updateData.rewardValue = parsed.data.rewardValue
      if (parsed.data.active !== undefined) updateData.active = parsed.data.active
      if (parsed.data.config) updateData.config = mergedConfig

      // Points lots follow the policy of the ACTIVE promotion only (that is
      // what the expiration cron applies). Re-stamp when the active one
      // changes its policy or a points promotion becomes the active one; an
      // inactive draft never touches the tenant's points.
      const before = isPoints
        ? pointsPromotionConfigSchema.parse(existing.config ?? {}).points.pointsExpiration
        : null
      const after = isPoints
        ? pointsPromotionConfigSchema.parse(mergedConfig ?? {}).points.pointsExpiration
        : null
      const policyChanged = JSON.stringify(before) !== JSON.stringify(after)
      const activeAfter = parsed.data.active ?? existing.active
      const restampPolicy = after && activeAfter && (activating || policyChanged) ? after : null

      // Stamps: milestone notices sitting on passes were rendered with the old
      // config. A later visit only clears a text it can recognise with the
      // current config, so wipe the ones that stop matching here.
      const staleMilestoneTexts: string[] = []
      if (!isPoints && (parsed.data.config || parsed.data.maxVisits !== undefined)) {
        const oldCfg = stampsPromotionConfigSchema.safeParse(existing.config ?? {})
        const newCfg = stampsPromotionConfigSchema.safeParse(mergedConfig ?? {})
        const oldMax = existing.maxVisits ?? 0
        const newMax = parsed.data.maxVisits ?? oldMax
        if (oldCfg.success && oldMax > 0) {
          const keep = newCfg.success ? allMilestoneMessages(newCfg.data.stamps, newMax) : new Set()
          for (const text of allMilestoneMessages(oldCfg.data.stamps, oldMax)) {
            if (!keep.has(text)) staleMilestoneTexts.push(text)
          }
        }
      }

      if (activating) await deactivateOthers(tx, existing.tenantId, promotionId)
      await tx.update(promotions).set(updateData).where(eq(promotions.id, promotionId))
      if (staleMilestoneTexts.length > 0) {
        await tx
          .update(passInstances)
          .set({ campaignMessage: null })
          .where(
            and(
              sql`${passInstances.campaignMessage} IN (${sql.join(
                staleMilestoneTexts.map((t) => sql`${t}`),
                sql`, `,
              )})`,
              sql`${passInstances.clientId} IN (SELECT ${clients.id} FROM ${clients} WHERE ${clients.tenantId} = ${existing.tenantId})`,
            ),
          )
      }
      if (restampPolicy) {
        const updated = await restampTenantLots(tx, existing.tenantId, restampPolicy)
        console.info(
          `[updatePromotion] points expiration ${before?.mode} -> ${restampPolicy.mode}, re-stamped ${updated} open lots (tenant ${existing.tenantId})`,
        )
      }

      return { success: true, data: { id: promotionId } }
    })
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
    return await db.transaction(async (tx): Promise<ActionResult<{ id: string }>> => {
      const existing = await lockTenantPromotions(tx, promotionId)

      if (!existing) {
        return { success: false, error: "Promocion no encontrada" }
      }

      if (!active) {
        await tx.update(promotions).set({ active: false }).where(eq(promotions.id, promotionId))
        return { success: true, data: { id: promotionId } }
      }

      // One active promotion per tenant: everything else goes off in the same
      // transaction, so there is never a moment with two.
      await deactivateOthers(tx, existing.tenantId, promotionId)
      await tx.update(promotions).set({ active: true }).where(eq(promotions.id, promotionId))

      // Points lots follow the new active promotion's policy from now on.
      if (existing.type === "points" && !existing.active) {
        const policy = pointsPromotionConfigSchema.parse(existing.config ?? {}).points
          .pointsExpiration
        const updated = await restampTenantLots(tx, existing.tenantId, policy)
        console.info(
          `[togglePromotionActive] activated points promotion (${policy.mode}), re-stamped ${updated} open lots (tenant ${existing.tenantId})`,
        )
      }

      return { success: true, data: { id: promotionId } }
    })
  } catch (err) {
    console.error("[togglePromotionActive]", err)
    return { success: false, error: "Error al cambiar estado de la promocion" }
  }
}

/**
 * Clients of the tenant sitting mid-card with the current "visitas para
 * premio": the promotion form warns that changing it reshuffles their cards.
 */
export async function countStampsInProgress(
  tenantId: string,
  maxVisits: number,
): Promise<ActionResult<{ count: number }>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }
  if (!Number.isInteger(maxVisits) || maxVisits < 1) return { success: true, data: { count: 0 } }

  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clients)
      .where(
        and(
          eq(clients.tenantId, tenantId),
          // Only clients that still see their card (archived/deleted are hidden).
          inArray(clients.status, ["active", "inactive", "blocked"]),
          sql`${clients.totalVisits} % ${maxVisits} <> 0`,
        ),
      )
    return { success: true, data: { count: row?.count ?? 0 } }
  } catch (err) {
    console.error("[countStampsInProgress]", err)
    return { success: false, error: "Error al contar clientes" }
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
