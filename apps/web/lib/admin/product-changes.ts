import { and, db, desc, eq, inArray, productChanges, sql, tenants } from "@cuik/db"
import { type AdminAccess, canAccess, type StaffPermission } from "@/lib/staff-permissions"

/**
 * Producto › Historial: append-only log of who changed which pass design or
 * branding. Written after the change succeeded and never allowed to fail it.
 */

export type ProductChangeArea = "designs" | "branding" | "simulator"
export type ProductChangeAction =
  | "created"
  | "saved"
  | "published"
  | "duplicated"
  | "deleted"
  | "visit_registered"
  | "campaign_sent"

/** Which staff permission lets a member read each area of the history. */
const AREA_PERMISSION: Record<ProductChangeArea, StaffPermission> = {
  designs: "designs",
  branding: "branding",
  simulator: "simulator",
}

export const PRODUCT_CHANGE_AREAS = Object.keys(AREA_PERMISSION) as ProductChangeArea[]

export function historyAreasFor(access: AdminAccess): ProductChangeArea[] {
  return PRODUCT_CHANGE_AREAS.filter((a) => canAccess(access, AREA_PERMISSION[a]))
}

type Actor = { user: { id: string; name?: string | null; email?: string | null } }

export async function recordProductChange(entry: {
  actor: Actor
  tenantId: string | null
  area: ProductChangeArea
  action: ProductChangeAction
  targetId?: string | null
  targetName?: string | null
  detail?: Record<string, unknown> | null
}): Promise<void> {
  try {
    let tenantName: string | null = null
    if (entry.tenantId) {
      const [t] = await db
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, entry.tenantId))
        .limit(1)
      tenantName = t?.name ?? null
    }
    await db.insert(productChanges).values({
      tenantId: entry.tenantId,
      tenantName,
      actorId: entry.actor.user.id,
      actorName: entry.actor.user.name || entry.actor.user.email || null,
      area: entry.area,
      action: entry.action,
      targetId: entry.targetId ?? null,
      targetName: entry.targetName ?? null,
      detail: entry.detail ?? null,
    })
  } catch (err) {
    console.error("[recordProductChange]", entry.area, entry.action, err)
  }
}

export type ProductChangeRow = {
  id: string
  createdAt: Date
  tenantId: string | null
  tenantName: string | null
  actorId: string | null
  actorName: string | null
  area: string
  action: string
  targetId: string | null
  targetName: string | null
  detail: unknown
}

export const HISTORY_PAGE_SIZE = 100

/** Comercios and people that appear in the visible areas, for the filters. */
export async function productChangeFilterOptions(areas: ProductChangeArea[]): Promise<{
  tenants: { id: string; name: string }[]
  actors: { id: string; name: string }[]
}> {
  if (areas.length === 0) return { tenants: [], actors: [] }
  const inAreas = inArray(productChanges.area, areas)
  const [tenantRows, actorRows] = await Promise.all([
    db
      .selectDistinct({ id: productChanges.tenantId, name: productChanges.tenantName })
      .from(productChanges)
      .where(and(inAreas, sql`${productChanges.tenantId} IS NOT NULL`)),
    db
      .selectDistinct({ id: productChanges.actorId, name: productChanges.actorName })
      .from(productChanges)
      .where(and(inAreas, sql`${productChanges.actorId} IS NOT NULL`)),
  ])
  // One entry per id (a renamed comercio or person keeps its latest-seen name).
  const uniq = (rows: { id: string | null; name: string | null }[]) => {
    const byId = new Map<string, string>()
    for (const r of rows) if (r.id) byId.set(r.id, r.name || "Sin nombre")
    return [...byId]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
  }
  return { tenants: uniq(tenantRows), actors: uniq(actorRows) }
}

/** Newest first, limited to `areas`; `before` pages back by created_at. */
export async function listProductChanges(opts: {
  areas: ProductChangeArea[]
  tenantId?: string | null
  area?: ProductChangeArea | null
  actorId?: string | null
  before?: Date | null
}): Promise<ProductChangeRow[]> {
  const areas = opts.area ? opts.areas.filter((a) => a === opts.area) : opts.areas
  if (areas.length === 0) return []
  const conditions = [inArray(productChanges.area, areas)]
  if (opts.tenantId) conditions.push(eq(productChanges.tenantId, opts.tenantId))
  if (opts.actorId) conditions.push(eq(productChanges.actorId, opts.actorId))
  if (opts.before) conditions.push(sql`${productChanges.createdAt} < ${opts.before}`)
  return db
    .select({
      id: productChanges.id,
      createdAt: productChanges.createdAt,
      tenantId: productChanges.tenantId,
      tenantName: productChanges.tenantName,
      actorId: productChanges.actorId,
      actorName: productChanges.actorName,
      area: productChanges.area,
      action: productChanges.action,
      targetId: productChanges.targetId,
      targetName: productChanges.targetName,
      detail: productChanges.detail,
    })
    .from(productChanges)
    .where(and(...conditions))
    .orderBy(desc(productChanges.createdAt))
    .limit(HISTORY_PAGE_SIZE)
}
