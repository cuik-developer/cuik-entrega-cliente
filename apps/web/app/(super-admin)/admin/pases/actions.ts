"use server"

import {
  and,
  appleDevices,
  clients,
  db,
  desc,
  eq,
  isNotNull,
  ne,
  passAssets,
  passDesigns,
  passInstances,
  promotions,
  rewards,
  sql,
  tenants,
  user,
} from "@cuik/db"
import type { PassDesignConfigV2 } from "@cuik/shared/types/editor"
import {
  getConfigVersion,
  passDesignConfigV2Schema,
  passDesignSaveV2Schema,
} from "@cuik/shared/validators/pass-design-schema"
import { sendApnsPush } from "@cuik/wallet/apple"
import {
  buildGoogleClassId,
  buildSaveToWalletUrl,
  ensureLoyaltyClass,
  getGoogleAccessToken,
  updateLoyaltyClass,
  upsertLoyaltyObject,
} from "@cuik/wallet/google"
import {
  resolvePassFields,
  type TemplateContext,
  validateAppleApnsEnv,
  validateGoogleEnv,
} from "@cuik/wallet/shared"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireSuperAdminOrAction } from "@/lib/admin-access"
import { apnsClientCertFor } from "@/lib/wallet/apns-client-cert"
import { GOOGLE_HERO_ASSET_TYPE, pickGoogleHeroAsset } from "@/lib/wallet/google-hero"
import { getTenantAppleConfig } from "@/lib/wallet/tenant-apple-config"
import { getDesignById, listDesignsByTenant } from "./queries"

// ── Types ───────────────────────────────────────────────────────────

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

const STAFF_ACTIVE_DESIGN_ERROR =
  "Este diseño está publicado: duplícalo como borrador para editarlo. Solo el dueño publica."

// ── Auth helper for server actions ──────────────────────────────────

// Equipo Cuik staff with "designs" may list, create, duplicate and save
// drafts; publishing and deleting stay owner-only (no permission = owner).
const requireSuperAdmin = () => requireSuperAdminOrAction()
const requireDesigns = () => requireSuperAdminOrAction("designs")

// ── Schemas ─────────────────────────────────────────────────────────

const createDesignSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1, "El nombre es requerido").max(100),
  type: z.enum(["apple_store", "google_loyalty"]),
  initialConfig: passDesignConfigV2Schema.optional(),
})

const updateDesignSchema = z.object({
  canvasData: z.unknown().optional(),
  colors: z.unknown().optional(),
  stampsConfig: z.unknown().optional(),
  fields: z.unknown().optional(),
  assets: z
    .array(
      z.object({
        type: z.enum(["logo", "icon", "strip_bg", "stamp", "background"]),
        dataUri: z.string(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
})

// ── Actions ─────────────────────────────────────────────────────────

export async function createDesign(
  input: z.infer<typeof createDesignSchema>,
): Promise<ActionResult<{ id: string }>> {
  const { error, access } = await requireDesigns()
  if (error) return { success: false, error }

  const parsed = createDesignSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const { tenantId, name, type, initialConfig } = parsed.data

  const [inserted] = await db
    .insert(passDesigns)
    .values({
      tenantId,
      name,
      type,
      canvasData: initialConfig ?? null,
      colors: initialConfig?.colors ?? null,
      fields: initialConfig?.fields ?? null,
      stampsConfig: initialConfig?.stampsConfig ?? null,
      // `is_active` defaults to true and register-client hands out the active
      // design to new clients, so every new design starts as a draft; only
      // publishing activates it (owner too, approved 19 Oct 2026).
      isActive: false,
    })
    .returning({ id: passDesigns.id })

  revalidatePath("/admin/pases")

  return { success: true, data: { id: inserted.id } }
}

export async function updateDesign(
  designId: string,
  payload: z.infer<typeof updateDesignSchema>,
): Promise<ActionResult<{ id: string }>> {
  const guard = await requireDesigns()
  if (guard.error !== null) return { success: false, error: guard.error }
  const { session, access } = guard

  const parsed = updateDesignSchema.safeParse(payload)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const { canvasData, colors, stampsConfig, fields } = parsed.data

  // A v2 config is checked before it can reach a live pass. The schema is
  // lenient with every stored shape; the ORIGINAL object is what gets saved.
  if (canvasData !== undefined && getConfigVersion(canvasData) === "v2") {
    const checked = passDesignSaveV2Schema.safeParse(canvasData)
    if (!checked.success) {
      return { success: false, error: `No se guardó: ${checked.error.errors[0].message}` }
    }
  }

  const updateValues: Record<string, unknown> = {
    updatedAt: new Date(),
  }

  // Staff saves drafts only: the colors/fields of an active design are read
  // live when passes regenerate, so editing it would publish without review.
  // Their save marks the draft "listo para publicar" for the owner.
  if (access.kind === "staff") {
    const [target] = await db
      .select({ isActive: passDesigns.isActive })
      .from(passDesigns)
      .where(eq(passDesigns.id, designId))
      .limit(1)
    if (!target) return { success: false, error: "Diseño no encontrado" }
    if (target.isActive) return { success: false, error: STAFF_ACTIVE_DESIGN_ERROR }
    // A design that issued passes is re-read by every refresh of those passes
    // (pass_instances.design_id), active or not: also live, so not a draft.
    const [inUse] = await db
      .select({ id: passInstances.id })
      .from(passInstances)
      .where(eq(passInstances.designId, designId))
      .limit(1)
    if (inUse) return { success: false, error: STAFF_ACTIVE_DESIGN_ERROR }
    updateValues.reviewRequestedAt = new Date()
    updateValues.reviewRequestedBy = session.user.id
  }

  // If canvasData is a v2 config, denormalize colors/stamps/fields from it
  if (canvasData !== undefined) {
    updateValues.canvasData = canvasData
    const configVersion = getConfigVersion(canvasData)
    if (configVersion === "v2") {
      const v2 = canvasData as PassDesignConfigV2
      updateValues.colors = v2.colors
      updateValues.stampsConfig = v2.stampsConfig
      updateValues.fields = v2.fields
    } else {
      // v1 path: use separate columns as provided
      if (colors !== undefined) updateValues.colors = colors
      if (stampsConfig !== undefined) updateValues.stampsConfig = stampsConfig
      if (fields !== undefined) updateValues.fields = fields
    }
  } else {
    if (colors !== undefined) updateValues.colors = colors
    if (stampsConfig !== undefined) updateValues.stampsConfig = stampsConfig
    if (fields !== undefined) updateValues.fields = fields
  }

  await db
    .update(passDesigns)
    .set(updateValues)
    .where(
      access.kind === "staff"
        ? // Re-checked in the write: a publish between the read and here keeps it out.
          and(eq(passDesigns.id, designId), eq(passDesigns.isActive, false))
        : eq(passDesigns.id, designId),
    )

  revalidatePath(`/admin/pases/${designId}/editor`)
  revalidatePath("/admin/pases")

  return { success: true, data: { id: designId } }
}

// ── Publish helpers ──────────────────────────────────────────────────

async function syncPassAssets(designId: string, canvasData: unknown) {
  try {
    const configVersion = getConfigVersion(canvasData)

    if (configVersion === "v2") {
      const v2Config = canvasData as PassDesignConfigV2
      await db.delete(passAssets).where(eq(passAssets.designId, designId))

      const assetMap: Record<string, "logo" | "icon" | "strip_bg" | "stamp" | "background"> = {
        stripBg: "strip_bg",
        logo: "logo",
        stamp: "stamp",
        icon: "icon",
      }

      const assetRecords = Object.entries(v2Config.assets)
        .filter(([key, url]) => url != null && key in assetMap)
        .map(([key, url]) => ({
          designId,
          type: assetMap[key] as "logo" | "icon" | "strip_bg" | "stamp" | "background",
          url: url as string,
          metadata: null,
        }))

      if (assetRecords.length > 0) {
        await db.insert(passAssets).values(assetRecords)
      }

      // Google-only hero, inserted on its own so a database still missing the
      // enum value (migration 0033) loses only this row, never the Apple assets.
      if (v2Config.assets.googleHero) {
        try {
          await db.insert(passAssets).values({
            designId,
            type: GOOGLE_HERO_ASSET_TYPE as unknown as "strip_bg",
            url: v2Config.assets.googleHero,
            metadata: null,
          })
        } catch (heroError) {
          console.error("[publishDesign] Could not store the Google hero asset:", heroError)
        }
      }
    } else {
      await syncV1Assets(designId, canvasData)
    }
  } catch (assetError) {
    console.error("[publishDesign] Error syncing pass_assets:", assetError)
  }
}

async function syncV1Assets(designId: string, canvasData: unknown) {
  const v1Data = canvasData as {
    nodes?: Array<{
      type: string
      props: Record<string, unknown>
      width?: number
      height?: number
    }>
  }

  if (!v1Data?.nodes) return

  await db.delete(passAssets).where(eq(passAssets.designId, designId))

  const assetRecords: Array<{
    designId: string
    type: "logo" | "icon" | "strip_bg" | "stamp" | "background"
    url: string
    metadata: Record<string, unknown> | null
  }> = []

  for (const node of v1Data.nodes) {
    if (node.type === "image") {
      const assetType = node.props.assetType as string
      const src = node.props.src as string
      if (src && ["logo", "icon", "strip_bg", "background"].includes(assetType)) {
        assetRecords.push({
          designId,
          type: assetType as "logo" | "icon" | "strip_bg" | "background",
          url: src,
          metadata: { width: node.width, height: node.height },
        })
      }
    } else if (node.type === "stamp-grid") {
      const stampSrc = node.props.stampSrc as string
      if (stampSrc) {
        assetRecords.push({
          designId,
          type: "stamp",
          url: stampSrc,
          metadata: { width: node.width, height: node.height },
        })
      }
    }
  }

  if (assetRecords.length > 0) {
    await db.insert(passAssets).values(assetRecords)
  }
}

async function migratePassInstances(
  designId: string,
  design: { tenantId: string; type: "apple_store" | "google_loyalty" },
) {
  try {
    const tenantInstances = await db
      .select({
        serialNumber: passInstances.serialNumber,
        currentDesignId: passInstances.designId,
      })
      .from(passInstances)
      .innerJoin(passDesigns, eq(passInstances.designId, passDesigns.id))
      .where(and(eq(passDesigns.tenantId, design.tenantId), eq(passDesigns.type, design.type)))

    if (tenantInstances.length === 0) return

    const serialNumbers = tenantInstances.map((i) => i.serialNumber)

    const now = new Date()
    await db
      .update(passInstances)
      .set({
        designId,
        etag: sql`md5(${passInstances.serialNumber} || ${now.toISOString()})`,
        lastUpdatedAt: now,
      })
      .where(
        sql`${passInstances.serialNumber} IN (${sql.join(
          serialNumbers.map((s) => sql`${s}`),
          sql`, `,
        )})`,
      )

    await sendApnsNotifications(serialNumbers, design)

    console.info(
      `[publishDesign] Updated ${tenantInstances.length} pass instances to design ${designId}`,
    )
  } catch (migrateError) {
    console.error("[publishDesign] Error updating pass instances:", migrateError)
  }
}

async function sendApnsNotifications(
  serialNumbers: string[],
  design: { tenantId: string; type: "apple_store" | "google_loyalty" },
) {
  const apnsConfig = validateAppleApnsEnv()
  const tenantConfig = await getTenantAppleConfig(design.tenantId)
  if (!apnsConfig || design.type !== "apple_store") return

  const deviceRows = await db
    .select({ pushToken: appleDevices.pushToken })
    .from(appleDevices)
    .where(
      sql`${appleDevices.serialNumber} IN (${sql.join(
        serialNumbers.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    )

  const tokens = deviceRows.map((r) => r.pushToken).filter((t): t is string => !!t)
  if (tokens.length === 0) return

  sendApnsPush({
    deviceTokens: tokens,
    passTypeId: tenantConfig?.passTypeId ?? apnsConfig.topic,
    p8KeyPem: Buffer.from(apnsConfig.p8Base64, "base64").toString("utf-8"),
    teamId: apnsConfig.teamId,
    keyId: apnsConfig.keyId,
    clientCert: apnsClientCertFor(tenantConfig, apnsConfig.topic),
    // Delivered at once, like a visit (see update-after-visit.ts).
    immediate: true,
  })
    .then((result) => {
      console.info(
        `[publishDesign] APNs push sent for ${tokens.length} devices: ${result.sent}/${result.total} succeeded`,
      )
    })
    .catch((err) => {
      console.error("[publishDesign] APNs push failed:", err)
    })
}

export async function publishDesign(
  designId: string,
): Promise<ActionResult<{ id: string; version: number }>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  const result = await getDesignById(designId)
  if (!result) {
    return { success: false, error: "Diseño no encontrado" }
  }

  const { design } = result

  if (!design.canvasData) {
    return { success: false, error: "El canvas esta vacio — guarda el diseño antes de publicar" }
  }

  // Validate: the linked promotion must be active to publish this pass
  if (design.promotionId) {
    const [promo] = await db
      .select({ active: promotions.active, rewardValue: promotions.rewardValue })
      .from(promotions)
      .where(eq(promotions.id, design.promotionId))
      .limit(1)

    if (promo && !promo.active) {
      return {
        success: false,
        error: `No se puede publicar: la promocion "${promo.rewardValue ?? "vinculada"}" no esta activa. Activa la promocion primero desde el panel de tenants.`,
      }
    }
  }

  // Deactivate current active design for same tenant + type
  await db
    .update(passDesigns)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(passDesigns.tenantId, design.tenantId),
        eq(passDesigns.type, design.type),
        eq(passDesigns.isActive, true),
      ),
    )

  // Activate this design and bump version
  const newVersion = design.version + 1

  await db
    .update(passDesigns)
    .set({
      isActive: true,
      version: newVersion,
      // Published: the "listo para publicar" mark from Equipo Cuik is done.
      reviewRequestedAt: null,
      reviewRequestedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(passDesigns.id, designId))

  // Sync assets and update instances (extracted to reduce complexity)
  await syncPassAssets(designId, design.canvasData)
  await migratePassInstances(designId, design)

  // ── Fire-and-forget: Google Wallet bulk upsert ──────────────────────
  const googleConfig = validateGoogleEnv()
  if (googleConfig) {
    void propagateGooglePasses(designId, design.tenantId, design.fields, googleConfig).catch(
      (err) => {
        console.error("[publishDesign] Google propagation error:", err)
      },
    )
  }

  revalidatePath("/admin/pases")
  revalidatePath(`/admin/pases/${designId}/editor`)

  return { success: true, data: { id: designId, version: newVersion } }
}

export async function deleteDesign(designId: string): Promise<ActionResult<{ id: string }>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  // Delete associated assets first
  await db.delete(passAssets).where(eq(passAssets.designId, designId))

  // Delete the design
  await db.delete(passDesigns).where(eq(passDesigns.id, designId))

  revalidatePath("/admin/pases")

  return { success: true, data: { id: designId } }
}

/**
 * Copy of a design as an inactive draft (same tenant, type, promotion and
 * content), so a published pass can be reworked without touching it live.
 * Assets are referenced from `canvasData` and synced on publish.
 */
export async function duplicateDesign(designId: string): Promise<ActionResult<{ id: string }>> {
  const { error } = await requireDesigns()
  if (error) return { success: false, error }
  if (!z.string().uuid().safeParse(designId).success) {
    return { success: false, error: "Diseño no encontrado" }
  }

  const [source] = await db.select().from(passDesigns).where(eq(passDesigns.id, designId)).limit(1)
  if (!source) return { success: false, error: "Diseño no encontrado" }

  const [inserted] = await db
    .insert(passDesigns)
    .values({
      tenantId: source.tenantId,
      promotionId: source.promotionId,
      name: `${source.name} (borrador)`.slice(0, 100),
      type: source.type,
      canvasData: source.canvasData,
      colors: source.colors,
      fields: source.fields,
      stampsConfig: source.stampsConfig,
      isActive: false,
      version: source.version,
    })
    .returning({ id: passDesigns.id })

  revalidatePath("/admin/pases")
  return { success: true, data: { id: inserted.id } }
}

/** Drafts an Equipo Cuik member saved and the owner has not published yet (owner only). */
export async function listDesignsAwaitingReview(): Promise<
  ActionResult<
    {
      id: string
      name: string
      tenantName: string
      requestedAt: Date
      requestedByName: string | null
    }[]
  >
> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  const rows = await db
    .select({
      id: passDesigns.id,
      name: passDesigns.name,
      tenantName: tenants.name,
      requestedAt: passDesigns.reviewRequestedAt,
      requestedByName: user.name,
    })
    .from(passDesigns)
    .innerJoin(tenants, eq(tenants.id, passDesigns.tenantId))
    .leftJoin(user, eq(user.id, passDesigns.reviewRequestedBy))
    .where(isNotNull(passDesigns.reviewRequestedAt))
    .orderBy(desc(passDesigns.reviewRequestedAt))
    .limit(50)

  return {
    success: true,
    data: rows.flatMap((r) => (r.requestedAt ? [{ ...r, requestedAt: r.requestedAt }] : [])),
  }
}

export async function listDesigns(
  tenantId?: string,
): Promise<ActionResult<Awaited<ReturnType<typeof listDesignsByTenant>>>> {
  const { error } = await requireDesigns()
  if (error) return { success: false, error }

  const designs = await listDesignsByTenant(tenantId)
  return { success: true, data: designs }
}

export async function getDesign(
  designId: string,
): Promise<ActionResult<NonNullable<Awaited<ReturnType<typeof getDesignById>>>>> {
  const { error } = await requireDesigns()
  if (error) return { success: false, error }

  const result = await getDesignById(designId)
  if (!result) {
    return { success: false, error: "Diseño no encontrado" }
  }

  return { success: true, data: result }
}

export async function listTenants(): Promise<
  ActionResult<{ id: string; businessName: string; slug: string }[]>
> {
  const { error } = await requireDesigns()
  if (error) return { success: false, error }

  const results = await db
    .select({
      id: tenants.id,
      businessName: tenants.name,
      slug: tenants.slug,
    })
    .from(tenants)
    .where(ne(tenants.status, "cancelled"))
    .orderBy(tenants.name)

  return { success: true, data: results }
}

// ── Google Wallet bulk propagation (fire-and-forget) ─────────────────

const GOOGLE_PROPAGATE_BATCH = 5
const GOOGLE_PROPAGATE_DELAY_MS = 100

type DesignFieldsRaw = {
  headerFields?: Array<{ key: string; label: string; value: string }>
  secondaryFields?: Array<{ key: string; label: string; value: string }>
  backFields?: Array<{ key: string; label: string; value: string }>
} | null

async function propagateGooglePasses(
  designId: string,
  tenantId: string,
  designFieldsRaw: unknown,
  googleConfig: {
    issuerId: string
    serviceAccountJson: { client_email: string; private_key: string }
  },
) {
  // 1. Get tenant name for classId
  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)

  if (!tenant) {
    console.warn("[publishDesign:Google] Tenant not found, skipping propagation")
    return
  }

  // 2. Query ALL pass_instances for this tenant (both with and without googleObjectId)
  const googleInstances = await db
    .select({
      serialNumber: passInstances.serialNumber,
      googleObjectId: passInstances.googleObjectId,
      clientId: passInstances.clientId,
    })
    .from(passInstances)
    .innerJoin(passDesigns, eq(passInstances.designId, passDesigns.id))
    .where(eq(passDesigns.tenantId, tenantId))

  if (googleInstances.length === 0) {
    console.info("[publishDesign:Google] No Google pass instances to propagate")
    return
  }

  // 3. Get asset URLs for loyalty class styling (logo, icon, strip_bg)
  const assetRows = await db
    .select({ url: passAssets.url, type: passAssets.type })
    .from(passAssets)
    .where(eq(passAssets.designId, designId))

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  const resolveUrl = (path: string) => (path.startsWith("http") ? path : `${baseUrl}${path}`)

  const logoAsset = assetRows.find((a) => a.type === "logo")
  const iconAsset = assetRows.find((a) => a.type === "icon")
  // Google-only hero when the design has one, else the strip background (as before).
  const heroAsset = pickGoogleHeroAsset(assetRows)

  const programLogoUrl = logoAsset?.url
    ? resolveUrl(logoAsset.url)
    : iconAsset?.url
      ? resolveUrl(iconAsset.url)
      : undefined
  const wideProgramLogoUrl = programLogoUrl
  const heroImageUrl = heroAsset?.url ? resolveUrl(heroAsset.url) : undefined

  // Get design colors for background color
  const [designColorsRow] = await db
    .select({ colors: passDesigns.colors })
    .from(passDesigns)
    .where(eq(passDesigns.id, designId))
    .limit(1)

  const designColors = designColorsRow?.colors as { backgroundColor?: string } | null
  let hexBackgroundColor: string | undefined
  if (designColors?.backgroundColor) {
    hexBackgroundColor = cssColorToHex(designColors.backgroundColor)
  }

  // 3. Get access token + ensure loyalty class
  const accessToken = await getGoogleAccessToken(googleConfig)
  const classId = buildGoogleClassId(googleConfig.issuerId, tenant.name)

  const classResult = await ensureLoyaltyClass({
    accessToken,
    issuerId: googleConfig.issuerId,
    classId,
    programName: `${tenant.name} Loyalty`,
    issuerName: tenant.name,
    programLogoUrl,
    hexBackgroundColor,
    heroImageUrl,
    wideProgramLogoUrl,
  })

  if (!classResult.ok) {
    console.error("[publishDesign:Google] Failed to ensure loyalty class:", classResult.error)
    return
  }

  // Update the loyalty class with new visual styling (key path: SA publishes redesigned pass)
  const updateResult = await updateLoyaltyClass({
    accessToken,
    classId,
    programName: `${tenant.name} Loyalty`,
    issuerName: tenant.name,
    programLogoUrl,
    hexBackgroundColor,
    heroImageUrl,
    wideProgramLogoUrl,
  })

  if (!updateResult.ok) {
    console.warn(
      "[publishDesign:Google] updateLoyaltyClass failed (non-blocking):",
      updateResult.error,
    )
  }

  // 4. Load promotion maxVisits for the design
  const [designRow] = await db
    .select({ promotionId: passDesigns.promotionId })
    .from(passDesigns)
    .where(eq(passDesigns.id, designId))
    .limit(1)

  let maxVisits = 10 // default
  let promotionType: "stamps" | "points" | "discount" | "coupon" | "subscription" | undefined
  if (designRow?.promotionId) {
    const [promo] = await db
      .select({ maxVisits: promotions.maxVisits, type: promotions.type })
      .from(promotions)
      .where(eq(promotions.id, designRow.promotionId))
      .limit(1)
    if (promo?.maxVisits) maxVisits = promo.maxVisits
    if (promo?.type) promotionType = promo.type as typeof promotionType
  }

  // 5. Load all clients at once for template resolution
  const clientIds = [...new Set(googleInstances.map((i) => i.clientId))]
  const clientRows = await db
    .select({
      id: clients.id,
      name: clients.name,
      lastName: clients.lastName,
      dni: clients.dni,
      phone: clients.phone,
      email: clients.email,
      totalVisits: clients.totalVisits,
      pointsBalance: clients.pointsBalance,
      tier: clients.tier,
      birthday: clients.birthday,
      customData: clients.customData,
    })
    .from(clients)
    .where(
      sql`${clients.id} IN (${sql.join(
        clientIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    )

  const clientMap = new Map(clientRows.map((c) => [c.id, c]))

  // Load pending rewards count per client
  const rewardRows = await db
    .select({
      clientId: rewards.clientId,
      count: sql<number>`count(*)::int`,
    })
    .from(rewards)
    .where(
      and(
        sql`${rewards.clientId} IN (${sql.join(
          clientIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
        eq(rewards.status, "pending"),
      ),
    )
    .groupBy(rewards.clientId)

  const pendingRewardsMap = new Map(rewardRows.map((r) => [r.clientId, r.count]))

  // 6. Batch upsert: 5 at a time with Promise.allSettled
  let successCount = 0
  let failCount = 0
  const fields = designFieldsRaw as DesignFieldsRaw

  for (let i = 0; i < googleInstances.length; i += GOOGLE_PROPAGATE_BATCH) {
    const batch = googleInstances.slice(i, i + GOOGLE_PROPAGATE_BATCH)

    const results = await Promise.allSettled(
      batch.map(async (instance) => {
        const client = clientMap.get(instance.clientId)
        if (!client) return { ok: false, error: "Client not found" }

        const stampsInCycle = client.totalVisits % maxVisits
        const hasReward = (pendingRewardsMap.get(instance.clientId) ?? 0) > 0

        // Resolve template fields per client
        let resolvedDesignFields: {
          headerFields: Array<{ key: string; label: string; value: string }>
          secondaryFields: Array<{ key: string; label: string; value: string }>
          backFields: Array<{ key: string; label: string; value: string }>
        } | null = null

        if (
          fields &&
          (fields.headerFields?.length ||
            fields.secondaryFields?.length ||
            fields.backFields?.length)
        ) {
          const templateContext: TemplateContext = {
            client: {
              name: client.name,
              lastName: client.lastName,
              phone: client.phone,
              email: client.email,
              totalVisits: client.totalVisits,
              pointsBalance: client.pointsBalance,
              tier: client.tier,
              birthday: client.birthday,
              customData: client.customData as Record<string, unknown> | null,
            },
            stamps: {
              current: stampsInCycle,
              max: maxVisits,
              remaining: maxVisits - stampsInCycle,
              total: client.totalVisits,
            },
            points: {
              balance: client.pointsBalance,
            },
            rewards: {
              pending: pendingRewardsMap.get(instance.clientId) ?? 0,
            },
            tenant: {
              name: tenant.name,
            },
          }
          resolvedDesignFields = resolvePassFields(fields, templateContext)
        }

        const upsertResult = await upsertLoyaltyObject({
          issuerId: googleConfig.issuerId,
          classId,
          serialNumber: instance.serialNumber,
          clientName: client.name,
          clientDni: client.dni ?? undefined,
          stampsInCycle,
          maxVisits,
          totalVisits: client.totalVisits,
          hasReward,
          rewardRedeemed: false,
          qrValue: instance.serialNumber,
          accessToken,
          designFields: resolvedDesignFields,
          imageUrl: heroImageUrl,
          promotionType,
        })

        // If this instance had no Google object before, save the new objectId + saveUrl
        if (upsertResult.ok && !instance.googleObjectId) {
          const saveUrl = await buildSaveToWalletUrl({
            objectId: upsertResult.objectId,
            serviceAccountEmail: googleConfig.serviceAccountJson.client_email,
            privateKey: googleConfig.serviceAccountJson.private_key,
            origins: [],
          })
          await db
            .update(passInstances)
            .set({
              googleObjectId: upsertResult.objectId,
              googleSaveUrl: saveUrl,
            })
            .where(eq(passInstances.serialNumber, instance.serialNumber))
        }

        return upsertResult
      }),
    )

    for (const result of results) {
      if (
        result.status === "fulfilled" &&
        result.value &&
        "ok" in result.value &&
        result.value.ok
      ) {
        successCount++
      } else {
        failCount++
      }
    }

    // Small delay between batches to avoid rate limiting
    if (i + GOOGLE_PROPAGATE_BATCH < googleInstances.length) {
      await new Promise((resolve) => setTimeout(resolve, GOOGLE_PROPAGATE_DELAY_MS))
    }
  }

  console.info(
    `[publishDesign:Google] Propagation complete: ${successCount} succeeded, ${failCount} failed out of ${googleInstances.length} instances`,
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Convert a CSS color string to hex format (#rrggbb).
 * Supports "#rrggbb", "#rgb", and "rgb(r, g, b)" formats.
 * Returns undefined if the format is unrecognized.
 */
function cssColorToHex(color: string): string | undefined {
  const trimmed = color.trim()

  if (trimmed.startsWith("#")) {
    if (trimmed.length === 7) return trimmed
    if (trimmed.length === 4) {
      const [, r, g, b] = trimmed
      return `#${r}${r}${g}${g}${b}${b}`
    }
    return trimmed
  }

  const rgbMatch = trimmed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/)
  if (rgbMatch) {
    const r = Number(rgbMatch[1]).toString(16).padStart(2, "0")
    const g = Number(rgbMatch[2]).toString(16).padStart(2, "0")
    const b = Number(rgbMatch[3]).toString(16).padStart(2, "0")
    return `#${r}${g}${b}`
  }

  return undefined
}
