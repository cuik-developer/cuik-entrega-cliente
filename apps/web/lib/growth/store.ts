import {
  and,
  clients,
  db,
  desc,
  eq,
  growthAttributedSales,
  growthAudienceMembers,
  growthClientStats,
  growthContactBlocks,
  growthSendRecipients,
  growthSends,
  growthTenantRules,
  inArray,
  isNotNull,
  isNull,
  products,
  promotions,
  saleLines,
  sales,
  sql,
  tenants,
  user,
} from "@cuik/db"
import { parseTenantFeatures, registrationConfigSchema } from "@cuik/shared/validators"

import {
  AUDIENCE_BY_SLUG,
  AUDIENCES,
  type AudienceSlug,
  type BlockState,
  evaluateAudiences,
  type MemberDetail,
  type Suggestion,
  suggestion,
} from "./audiences"
import type { Species } from "./categories"
import { daysBetween, localYmd, median } from "./dates"
import { DEFAULT_RULES, type GrowthRules, type GrowthRulesPatch } from "./rules"
import {
  type CategoryStat,
  type ClientStats,
  categoryIntervals,
  computeClientStats,
  type Purchase,
  type PurchaseLine,
} from "./stats"
import { petNameOf } from "./templates"

/**
 * Growth, persisted: the tenant's rules, the nightly client stats and
 * audience memberships, "No contactar", and the read models the panel
 * screens use. Every function takes the tenant id the route already
 * validated. Sends live in ./sends, attribution and results in ./results.
 */

const BATCH = 500
/** Clients Growth may write to: blocked, archived and deleted never. */
const LIVE_STATUSES = ["active", "inactive"] as const

export function chunk<T>(items: T[], size = BATCH): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function fullName(name: string, lastName: string | null): string {
  return `${name} ${lastName ?? ""}`.trim()
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

const num = (v: string | number | null | undefined): number => (v == null ? 0 : Number(v))

// --- Rules ---

export async function getRules(tenantId: string): Promise<GrowthRules> {
  const [row] = await db
    .select()
    .from(growthTenantRules)
    .where(eq(growthTenantRules.tenantId, tenantId))
    .limit(1)
  return row ? rulesFromRow(row) : { ...DEFAULT_RULES }
}

export function rulesFromRow(row: typeof growthTenantRules.$inferSelect): GrowthRules {
  return {
    cooldownDays: row.cooldownDays,
    maxEarlyDays: row.maxEarlyDays,
    minPurchases: row.minPurchases,
    riskFactor: Number(row.riskFactor),
    attributionDays: row.attributionDays,
    controlPct: row.controlPct,
    minControl: row.minControl,
    feeFixed: Number(row.feeFixed),
    feeVariablePct: row.feeVariablePct == null ? null : Number(row.feeVariablePct),
    pilotMonths: row.pilotMonths,
    startsOn: row.startsOn,
    audiencesOff: Array.isArray(row.audiencesOff) ? (row.audiencesOff as string[]) : [],
  }
}

/** Upsert: the fields given replace the stored ones, the rest stay (defaults on first write). */
export async function saveRules(
  tenantId: string,
  patch: GrowthRulesPatch,
  userId: string,
): Promise<GrowthRules> {
  const current = await getRules(tenantId)
  const next: GrowthRules = { ...current }
  for (const key of Object.keys(patch) as (keyof GrowthRulesPatch)[]) {
    const v = patch[key]
    if (v !== undefined) (next as Record<string, unknown>)[key] = v
  }
  const values = {
    tenantId,
    cooldownDays: next.cooldownDays,
    maxEarlyDays: next.maxEarlyDays,
    minPurchases: next.minPurchases,
    riskFactor: String(next.riskFactor),
    attributionDays: next.attributionDays,
    controlPct: next.controlPct,
    minControl: next.minControl,
    feeFixed: String(next.feeFixed),
    feeVariablePct: next.feeVariablePct == null ? null : String(next.feeVariablePct),
    pilotMonths: next.pilotMonths,
    startsOn: next.startsOn,
    audiencesOff: next.audiencesOff,
    updatedBy: userId,
    updatedAt: new Date(),
  }
  const { tenantId: _t, ...update } = values
  await db
    .insert(growthTenantRules)
    .values(values)
    .onConflictDoUpdate({ target: growthTenantRules.tenantId, set: update })
  return next
}

// --- Tenant helpers ---

export type GrowthTenant = { id: string; name: string; timezone: string }

export async function growthTenant(tenantId: string): Promise<GrowthTenant | null> {
  const [t] = await db
    .select({ id: tenants.id, name: tenants.name, timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  return t ?? null
}

/** Tenants with the Growth switch on. */
export async function growthTenants(): Promise<GrowthTenant[]> {
  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      timezone: tenants.timezone,
      features: tenants.features,
    })
    .from(tenants)
    .where(sql`${tenants.features} ->> 'growth' = 'true'`)
  return rows
    .filter((r) => parseTenantFeatures(r.features).growth)
    .map(({ id, name, timezone }) => ({ id, name, timezone }))
}

export function todayOf(timezone: string): string {
  return localYmd(new Date(), timezone)
}

// --- Nightly computation ---

/** POS purchases per active client (lines classified with the product master). */
async function loadPurchases(tenantId: string): Promise<Map<string, Purchase[]>> {
  const saleRows = await db
    .select({
      id: sales.id,
      clientId: sales.clientId,
      soldOn: sales.soldOn,
      store: sales.store,
      amount: sales.amount,
    })
    .from(sales)
    .innerJoin(clients, eq(clients.id, sales.clientId))
    .where(
      and(
        eq(sales.tenantId, tenantId),
        isNotNull(sales.clientId),
        inArray(clients.status, LIVE_STATUSES),
        isNull(clients.archivedAt),
        sql`${sales.amount} > 0`,
      ),
    )
  if (saleRows.length === 0) return new Map()

  const lineRows = await db
    .select({
      saleId: saleLines.saleId,
      sku: saleLines.sku,
      productName: saleLines.productName,
      odooCategory: saleLines.odooCategory,
      total: saleLines.total,
      masterCategory: products.category,
      masterClass: products.class,
      masterSubclass: products.subclass,
    })
    .from(saleLines)
    .innerJoin(sales, eq(sales.id, saleLines.saleId))
    .leftJoin(
      products,
      and(eq(products.tenantId, saleLines.tenantId), eq(products.sku, saleLines.sku)),
    )
    // Only lines of sales linked to a client: guest sales never feed the stats.
    .where(and(eq(saleLines.tenantId, tenantId), isNotNull(sales.clientId)))

  const linesBySale = new Map<string, PurchaseLine[]>()
  for (const l of lineRows) {
    const list = linesBySale.get(l.saleId) ?? []
    list.push({
      sku: l.sku,
      productName: l.productName,
      odooCategory: l.odooCategory,
      masterCategory: l.masterCategory,
      masterClass: l.masterClass,
      masterSubclass: l.masterSubclass,
      total: num(l.total),
    })
    linesBySale.set(l.saleId, list)
  }

  const out = new Map<string, Purchase[]>()
  for (const s of saleRows) {
    if (!s.clientId) continue
    const list = out.get(s.clientId) ?? []
    list.push({
      soldOn: s.soldOn,
      store: s.store,
      amount: num(s.amount),
      lines: linesBySale.get(s.id) ?? [],
    })
    out.set(s.clientId, list)
  }
  return out
}

export type RecomputeResult = {
  tenantId: string
  clients: number
  members: number
  today: string
}

/**
 * Recomputes growth.client_stats and growth.audience_members for one tenant.
 * Two passes: the first gives every client its own interval, from which the
 * category and tenant fallbacks are derived; the second applies them.
 */
export async function recomputeTenant(
  tenant: GrowthTenant,
  opts: { today?: string } = {},
): Promise<RecomputeResult> {
  const today = opts.today ?? todayOf(tenant.timezone)
  const rules = await getRules(tenant.id)
  const purchases = await loadPurchases(tenant.id)

  const firstPass = new Map<string, ClientStats>()
  for (const [clientId, list] of purchases) {
    firstPass.set(clientId, computeClientStats(list, { today, rules }))
  }
  const byCategory = categoryIntervals([...firstPass.values()])
  const ownIntervals = [...firstPass.values()]
    .filter((s) => s.intervalSource === "own" && s.intervalDays)
    .map((s) => s.intervalDays as number)
  const tenantInterval = ownIntervals.length >= 3 ? median(ownIntervals) : null

  const off = new Set(rules.audiencesOff)
  const statRows: (typeof growthClientStats.$inferInsert)[] = []
  const memberRows: (typeof growthAudienceMembers.$inferInsert)[] = []
  const computedAt = new Date()
  for (const [clientId, list] of purchases) {
    const stats = computeClientStats(list, {
      today,
      rules,
      categoryIntervals: byCategory,
      tenantInterval,
    })
    statRows.push({
      tenantId: tenant.id,
      clientId,
      purchases: stats.purchases,
      purchases12m: stats.purchases12m,
      spend12m: String(stats.spend12m),
      firstPurchaseOn: stats.firstPurchaseOn,
      lastPurchaseOn: stats.lastPurchaseOn,
      lastStore: stats.lastStore,
      intervalDays: stats.intervalDays == null ? null : String(stats.intervalDays),
      intervalSource: stats.intervalSource,
      habitualWeekday: stats.habitualWeekday,
      expectedOn: stats.expectedOn,
      suggestedOn: stats.suggestedOn,
      species: stats.species,
      mainCategory: stats.mainCategory,
      mainProductSku: stats.mainProductSku,
      mainProductName: stats.mainProductName,
      mainBrand: stats.mainBrand,
      stores12m: stats.stores12m,
      categories: stats.categories,
      computedAt,
    })
    for (const m of evaluateAudiences(stats, { today, rules })) {
      if (off.has(m.audience)) continue
      memberRows.push({
        tenantId: tenant.id,
        audience: m.audience,
        clientId,
        readyOn: m.readyOn,
        detail: m.detail,
        computedAt,
      })
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(growthClientStats).where(eq(growthClientStats.tenantId, tenant.id))
    for (const part of chunk(statRows)) await tx.insert(growthClientStats).values(part)
    await tx.delete(growthAudienceMembers).where(eq(growthAudienceMembers.tenantId, tenant.id))
    for (const part of chunk(memberRows)) await tx.insert(growthAudienceMembers).values(part)
  })

  return { tenantId: tenant.id, clients: statRows.length, members: memberRows.length, today }
}

export async function recomputeAll(): Promise<RecomputeResult[]> {
  const out: RecomputeResult[] = []
  for (const t of await growthTenants()) {
    try {
      out.push(await recomputeTenant(t))
    } catch (err) {
      console.error("[growth-nightly] recompute failed", t.id, err)
    }
  }
  return out
}

// --- Blocks (cooldown, open send, No contactar) ---

/** Per client: last confirmed send, open-send presence and active block. */
export async function blockStates(
  tenantId: string,
  timezone: string,
): Promise<Map<string, BlockState>> {
  const [lastSent, inOpen, noContact, control] = await Promise.all([
    db
      .select({
        clientId: growthSendRecipients.clientId,
        last: sql<Date>`max(${growthSendRecipients.sentAt})`,
      })
      .from(growthSendRecipients)
      .where(
        and(eq(growthSendRecipients.tenantId, tenantId), isNotNull(growthSendRecipients.sentAt)),
      )
      .groupBy(growthSendRecipients.clientId),
    db
      .selectDistinct({ clientId: growthSendRecipients.clientId })
      .from(growthSendRecipients)
      .innerJoin(growthSends, eq(growthSends.id, growthSendRecipients.sendId))
      .where(
        and(
          eq(growthSendRecipients.tenantId, tenantId),
          eq(growthSends.status, "open"),
          inArray(growthSendRecipients.status, ["pending", "opened"]),
        ),
      ),
    db
      .select({ clientId: growthContactBlocks.clientId })
      .from(growthContactBlocks)
      .where(and(eq(growthContactBlocks.tenantId, tenantId), isNull(growthContactBlocks.liftedAt))),
    // Control clients of sends whose window is still open (from the send's creation).
    db
      .select({
        clientId: growthSendRecipients.clientId,
        until: sql<Date>`max(${growthSends.createdAt} + make_interval(days => ${growthSends.attributionDays}))`,
      })
      .from(growthSendRecipients)
      .innerJoin(growthSends, eq(growthSends.id, growthSendRecipients.sendId))
      .where(
        and(
          eq(growthSendRecipients.tenantId, tenantId),
          eq(growthSendRecipients.status, "control"),
          sql`${growthSends.createdAt} + make_interval(days => ${growthSends.attributionDays}) >= now()`,
        ),
      )
      .groupBy(growthSendRecipients.clientId),
  ])
  const out = new Map<string, BlockState>()
  const get = (id: string): BlockState => {
    const s = out.get(id) ?? {
      lastSentOn: null,
      inOpenSend: false,
      noContact: false,
      controlUntil: null,
    }
    out.set(id, s)
    return s
  }
  for (const r of control) {
    const d = r.until instanceof Date ? r.until : new Date(String(r.until))
    get(r.clientId).controlUntil = localYmd(d, timezone)
  }
  for (const r of lastSent) {
    const d = r.last instanceof Date ? r.last : new Date(String(r.last))
    get(r.clientId).lastSentOn = localYmd(d, timezone)
  }
  for (const r of inOpen) get(r.clientId).inOpenSend = true
  for (const r of noContact) get(r.clientId).noContact = true
  return out
}

const NO_BLOCK: BlockState = {
  lastSentOn: null,
  inOpenSend: false,
  noContact: false,
  controlUntil: null,
}

// --- Audiences: counts and members ---

export type AudienceSummaryRow = {
  slug: AudienceSlug
  name: string
  rule: string
  informational: boolean
  off: boolean
  inAudience: number
  readyToday: number
  lastSend: { createdAt: string; sent: number } | null
}

export type AudiencesOverview = {
  computedAt: string | null
  today: string
  rules: GrowthRules
  blocked: { cooldown: number; openSend: number; noContact: number; control: number }
  audiences: AudienceSummaryRow[]
}

export async function audiencesOverview(tenant: GrowthTenant): Promise<AudiencesOverview> {
  const today = todayOf(tenant.timezone)
  const [rules, blocks, members, lastSends, computed] = await Promise.all([
    getRules(tenant.id),
    blockStates(tenant.id, tenant.timezone),
    db
      .select({
        audience: growthAudienceMembers.audience,
        clientId: growthAudienceMembers.clientId,
        readyOn: growthAudienceMembers.readyOn,
      })
      .from(growthAudienceMembers)
      .where(eq(growthAudienceMembers.tenantId, tenant.id)),
    lastSendPerAudience(tenant.id),
    db
      .select({ at: sql<Date | null>`max(${growthClientStats.computedAt})` })
      .from(growthClientStats)
      .where(eq(growthClientStats.tenantId, tenant.id)),
  ])

  const counts = new Map<string, { inAudience: number; readyToday: number }>()
  const blockedClients = {
    cooldown: new Set<string>(),
    openSend: new Set<string>(),
    noContact: new Set<string>(),
    control: new Set<string>(),
  }
  for (const m of members) {
    const c = counts.get(m.audience) ?? { inAudience: 0, readyToday: 0 }
    c.inAudience++
    const s = suggestion({ readyOn: m.readyOn }, blocks.get(m.clientId) ?? NO_BLOCK, today, rules)
    if (s.ready) c.readyToday++
    else if (s.reason === "cooldown") blockedClients.cooldown.add(m.clientId)
    else if (s.reason === "open_send") blockedClients.openSend.add(m.clientId)
    else if (s.reason === "no_contact") blockedClients.noContact.add(m.clientId)
    else if (s.reason === "control") blockedClients.control.add(m.clientId)
    counts.set(m.audience, c)
  }
  const off = new Set(rules.audiencesOff)
  const computedAt = computed[0]?.at
  return {
    computedAt: computedAt ? new Date(computedAt).toISOString() : null,
    today,
    rules,
    blocked: {
      cooldown: blockedClients.cooldown.size,
      openSend: blockedClients.openSend.size,
      noContact: blockedClients.noContact.size,
      control: blockedClients.control.size,
    },
    audiences: AUDIENCES.map((a) => ({
      slug: a.slug,
      name: a.name,
      rule: a.rule,
      informational: Boolean(a.informational),
      off: off.has(a.slug),
      inAudience: counts.get(a.slug)?.inAudience ?? 0,
      readyToday: a.informational ? 0 : (counts.get(a.slug)?.readyToday ?? 0),
      lastSend: lastSends.get(a.slug) ?? null,
    })),
  }
}

async function lastSendPerAudience(
  tenantId: string,
): Promise<Map<string, { createdAt: string; sent: number }>> {
  const rows = await db
    .select({
      audience: growthSends.audience,
      createdAt: growthSends.createdAt,
      sent: sql<number>`(select count(*) from ${growthSendRecipients} r where r.send_id = ${growthSends.id} and r.sent_at is not null)`,
    })
    .from(growthSends)
    .where(eq(growthSends.tenantId, tenantId))
    .orderBy(desc(growthSends.createdAt))
  const out = new Map<string, { createdAt: string; sent: number }>()
  for (const r of rows) {
    if (out.has(r.audience)) continue
    out.set(r.audience, { createdAt: r.createdAt.toISOString(), sent: Number(r.sent) })
  }
  return out
}

export type MemberRow = {
  clientId: string
  name: string
  phone: string | null
  store: string | null
  daysSince: number | null
  lastPurchaseOn: string | null
  intervalDays: number | null
  expectedOn: string | null
  suggestedOn: string | null
  habitualWeekday: number | null
  species: Species | null
  product: string | null
  brand: string | null
  spend12m: number
  detail: MemberDetail
  readyOn: string | null
  suggestion: Suggestion
}

/** The clients of an audience with their stats and today's suggestion state. */
export async function audienceMembers(
  tenant: GrowthTenant,
  slug: AudienceSlug,
): Promise<{ def: (typeof AUDIENCES)[number]; today: string; rows: MemberRow[] }> {
  const def = AUDIENCE_BY_SLUG.get(slug)
  if (!def) throw new Error("Audience not found")
  const today = todayOf(tenant.timezone)
  const [rules, blocks, rows] = await Promise.all([
    getRules(tenant.id),
    blockStates(tenant.id, tenant.timezone),
    db
      .select({
        clientId: growthAudienceMembers.clientId,
        readyOn: growthAudienceMembers.readyOn,
        detail: growthAudienceMembers.detail,
        name: clients.name,
        lastName: clients.lastName,
        phone: clients.phone,
        store: growthClientStats.lastStore,
        lastPurchaseOn: growthClientStats.lastPurchaseOn,
        intervalDays: growthClientStats.intervalDays,
        expectedOn: growthClientStats.expectedOn,
        suggestedOn: growthClientStats.suggestedOn,
        habitualWeekday: growthClientStats.habitualWeekday,
        species: growthClientStats.species,
        product: growthClientStats.mainProductName,
        brand: growthClientStats.mainBrand,
        spend12m: growthClientStats.spend12m,
      })
      .from(growthAudienceMembers)
      .innerJoin(clients, eq(clients.id, growthAudienceMembers.clientId))
      .leftJoin(
        growthClientStats,
        and(
          eq(growthClientStats.tenantId, growthAudienceMembers.tenantId),
          eq(growthClientStats.clientId, growthAudienceMembers.clientId),
        ),
      )
      .where(
        and(
          eq(growthAudienceMembers.tenantId, tenant.id),
          eq(growthAudienceMembers.audience, slug),
          inArray(clients.status, LIVE_STATUSES),
        ),
      ),
  ])
  const out: MemberRow[] = rows.map((r) => ({
    clientId: r.clientId,
    name: fullName(r.name, r.lastName),
    phone: r.phone,
    store: r.store ?? null,
    daysSince: r.lastPurchaseOn ? daysBetween(r.lastPurchaseOn, today) : null,
    lastPurchaseOn: r.lastPurchaseOn ?? null,
    intervalDays: r.intervalDays == null ? null : Number(r.intervalDays),
    expectedOn: r.expectedOn ?? null,
    suggestedOn: r.suggestedOn ?? null,
    habitualWeekday: r.habitualWeekday ?? null,
    species: (r.species as Species | null) ?? null,
    product: r.product ?? null,
    brand: r.brand ?? null,
    spend12m: num(r.spend12m),
    detail: (r.detail as MemberDetail | null) ?? {},
    readyOn: r.readyOn,
    suggestion: def.informational
      ? { ready: false, reason: "not_yet", availableOn: null }
      : suggestion({ readyOn: r.readyOn }, blocks.get(r.clientId) ?? NO_BLOCK, today, rules),
  }))
  // Ready first, then by days without buying (the most urgent on top).
  out.sort((a, b) => {
    if (a.suggestion.ready !== b.suggestion.ready) return a.suggestion.ready ? -1 : 1
    return (b.daysSince ?? 0) - (a.daysSince ?? 0)
  })
  return { def, today, rows: out }
}

// --- No contactar ---

export type ContactBlockReason = "pet_died" | "asked_no_contact" | "wrong_number" | "other"

export const BLOCK_REASON_LABELS: Record<ContactBlockReason, string> = {
  pet_died: "Mascota falleció",
  asked_no_contact: "Pidió no recibir mensajes",
  wrong_number: "Número equivocado",
  other: "Otro",
}

export type ContactBlockView = {
  id: string
  reason: ContactBlockReason
  note: string | null
  createdAt: string
  createdBy: string | null
}

export async function activeBlock(
  tenantId: string,
  clientId: string,
): Promise<ContactBlockView | null> {
  const [row] = await db
    .select({
      id: growthContactBlocks.id,
      reason: growthContactBlocks.reason,
      note: growthContactBlocks.note,
      createdAt: growthContactBlocks.createdAt,
      createdBy: user.name,
    })
    .from(growthContactBlocks)
    .leftJoin(user, eq(user.id, growthContactBlocks.createdBy))
    .where(
      and(
        eq(growthContactBlocks.tenantId, tenantId),
        eq(growthContactBlocks.clientId, clientId),
        isNull(growthContactBlocks.liftedAt),
      ),
    )
    .limit(1)
  if (!row) return null
  return {
    id: row.id,
    reason: row.reason as ContactBlockReason,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  }
}

/**
 * Marks the client "No contactar" (one active block per client: a second
 * call updates the reason). Pending rows in open sends become "blocked".
 */
export async function addContactBlock(input: {
  tenantId: string
  clientId: string
  reason: ContactBlockReason
  note: string | null
  userId: string
}): Promise<ContactBlockView | null> {
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, input.clientId), eq(clients.tenantId, input.tenantId)))
    .limit(1)
  if (!client) return null
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: growthContactBlocks.id })
      .from(growthContactBlocks)
      .where(
        and(eq(growthContactBlocks.clientId, input.clientId), isNull(growthContactBlocks.liftedAt)),
      )
      .limit(1)
    if (existing[0]) {
      await tx
        .update(growthContactBlocks)
        .set({ reason: input.reason, note: input.note })
        .where(eq(growthContactBlocks.id, existing[0].id))
    } else {
      await tx.insert(growthContactBlocks).values({
        tenantId: input.tenantId,
        clientId: input.clientId,
        reason: input.reason,
        note: input.note,
        createdBy: input.userId,
      })
    }
    const openIds = tx
      .select({ id: growthSends.id })
      .from(growthSends)
      .where(and(eq(growthSends.tenantId, input.tenantId), eq(growthSends.status, "open")))
    await tx
      .update(growthSendRecipients)
      .set({ status: "blocked" })
      .where(
        and(
          eq(growthSendRecipients.tenantId, input.tenantId),
          eq(growthSendRecipients.clientId, input.clientId),
          inArray(growthSendRecipients.status, ["pending", "opened", "skipped"]),
          inArray(growthSendRecipients.sendId, openIds),
        ),
      )
  })
  return activeBlock(input.tenantId, input.clientId)
}

export async function liftContactBlock(input: {
  tenantId: string
  clientId: string
  userId: string
}): Promise<boolean> {
  const rows = await db
    .update(growthContactBlocks)
    .set({ liftedBy: input.userId, liftedAt: new Date() })
    .where(
      and(
        eq(growthContactBlocks.tenantId, input.tenantId),
        eq(growthContactBlocks.clientId, input.clientId),
        isNull(growthContactBlocks.liftedAt),
      ),
    )
    .returning({ id: growthContactBlocks.id })
  return rows.length > 0
}

export async function contactBlocksCount(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(growthContactBlocks)
    .where(and(eq(growthContactBlocks.tenantId, tenantId), isNull(growthContactBlocks.liftedAt)))
  return Number(row?.n ?? 0)
}

// --- Message variables per client ---

export type ClientVarsSource = {
  clientId: string
  name: string
  phone: string | null
  customData: Record<string, unknown> | null
  totalVisits: number
  stampsCashed: number
  stats: {
    lastStore: string | null
    lastPurchaseOn: string | null
    habitualWeekday: number | null
    species: Species | null
    mainProductName: string | null
    mainBrand: string | null
  } | null
}

export type TenantVarsContext = {
  tenantName: string
  strategicFields: { key: string; label: string }[]
  /** Active stamps program: how many stamps complete the card and the reward. */
  stamps: { maxVisits: number; reward: string | null } | null
}

export async function tenantVarsContext(tenantId: string): Promise<TenantVarsContext> {
  const [t] = await db
    .select({ name: tenants.name, registrationConfig: tenants.registrationConfig })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const parsed = registrationConfigSchema.safeParse(t?.registrationConfig ?? {})
  const strategicFields = parsed.success
    ? parsed.data.strategicFields.map((f) => ({ key: f.key, label: f.label }))
    : []
  const [promo] = await db
    .select({
      type: promotions.type,
      maxVisits: promotions.maxVisits,
      reward: promotions.rewardValue,
    })
    .from(promotions)
    .where(and(eq(promotions.tenantId, tenantId), eq(promotions.active, true)))
    .limit(1)
  const stamps =
    promo?.type === "stamps" && promo.maxVisits && promo.maxVisits > 0
      ? { maxVisits: promo.maxVisits, reward: promo.reward }
      : null
  return { tenantName: t?.name ?? "", strategicFields, stamps }
}

export function petNameFor(src: ClientVarsSource, ctx: TenantVarsContext): string | null {
  return petNameOf(src.customData, ctx.strategicFields)
}

/** Stamps still missing on the current card, when the program is stamps. */
export function stampsMissing(src: ClientVarsSource, ctx: TenantVarsContext): number | null {
  if (!ctx.stamps) return null
  const onCard = Math.max(0, src.totalVisits - src.stampsCashed) % ctx.stamps.maxVisits
  const missing = ctx.stamps.maxVisits - onCard
  return missing > 0 && missing < ctx.stamps.maxVisits ? missing : null
}

export async function clientVarsSources(
  tenantId: string,
  clientIds: string[],
): Promise<Map<string, ClientVarsSource>> {
  const out = new Map<string, ClientVarsSource>()
  for (const ids of chunk(clientIds)) {
    const rows = await db
      .select({
        id: clients.id,
        name: clients.name,
        lastName: clients.lastName,
        phone: clients.phone,
        customData: clients.customData,
        totalVisits: clients.totalVisits,
        stampsCashed: clients.stampsCashed,
        lastStore: growthClientStats.lastStore,
        lastPurchaseOn: growthClientStats.lastPurchaseOn,
        habitualWeekday: growthClientStats.habitualWeekday,
        species: growthClientStats.species,
        mainProductName: growthClientStats.mainProductName,
        mainBrand: growthClientStats.mainBrand,
        hasStats: growthClientStats.clientId,
      })
      .from(clients)
      .leftJoin(
        growthClientStats,
        and(
          eq(growthClientStats.tenantId, clients.tenantId),
          eq(growthClientStats.clientId, clients.id),
        ),
      )
      .where(and(eq(clients.tenantId, tenantId), inArray(clients.id, ids)))
    for (const r of rows) {
      out.set(r.id, {
        clientId: r.id,
        name: fullName(r.name, r.lastName),
        phone: r.phone,
        customData: (r.customData as Record<string, unknown> | null) ?? null,
        totalVisits: r.totalVisits,
        stampsCashed: r.stampsCashed,
        stats: r.hasStats
          ? {
              lastStore: r.lastStore ?? null,
              lastPurchaseOn: r.lastPurchaseOn ?? null,
              habitualWeekday: r.habitualWeekday ?? null,
              species: (r.species as Species | null) ?? null,
              mainProductName: r.mainProductName ?? null,
              mainBrand: r.mainBrand ?? null,
            }
          : null,
      })
    }
  }
  return out
}

// --- Panel: Resumen and the client's Growth tab ---

export type GrowthSummary = {
  today: string
  computedAt: string | null
  clientsWithStats: number
  rules: GrowthRules
  audiences: AudienceSummaryRow[]
  blocked: AudiencesOverview["blocked"]
  openSends: number
  sentThisMonth: number
  attributedThisMonth: { amount: number; tickets: number }
  noContact: number
}

export async function growthSummary(tenant: GrowthTenant): Promise<GrowthSummary> {
  const today = todayOf(tenant.timezone)
  const month = today.slice(0, 7)
  const [overview, openSends, sentMonth, attributed, noContact, withStats] = await Promise.all([
    audiencesOverview(tenant),
    db
      .select({ n: sql<number>`count(*)` })
      .from(growthSends)
      .where(and(eq(growthSends.tenantId, tenant.id), eq(growthSends.status, "open"))),
    db
      .select({ n: sql<number>`count(*)` })
      .from(growthSendRecipients)
      .where(
        and(
          eq(growthSendRecipients.tenantId, tenant.id),
          sql`to_char(${growthSendRecipients.sentAt} at time zone 'UTC' at time zone ${tenant.timezone}, 'YYYY-MM') = ${month}`,
        ),
      ),
    attributedInMonth(tenant.id, month),
    contactBlocksCount(tenant.id),
    db
      .select({ n: sql<number>`count(*)` })
      .from(growthClientStats)
      .where(eq(growthClientStats.tenantId, tenant.id)),
  ])
  return {
    today,
    computedAt: overview.computedAt,
    clientsWithStats: Number(withStats[0]?.n ?? 0),
    rules: overview.rules,
    audiences: overview.audiences,
    blocked: overview.blocked,
    openSends: Number(openSends[0]?.n ?? 0),
    sentThisMonth: Number(sentMonth[0]?.n ?? 0),
    attributedThisMonth: attributed,
    noContact,
  }
}

/** Attributed sales of a "YYYY-MM" by the sale's local day. */
export async function attributedInMonth(
  tenantId: string,
  month: string,
): Promise<{ amount: number; tickets: number }> {
  const [row] = await db
    .select({
      amount: sql<string>`coalesce(sum(${growthAttributedSales.amount}), 0)`,
      tickets: sql<number>`count(*)`,
    })
    .from(growthAttributedSales)
    .where(
      and(
        eq(growthAttributedSales.tenantId, tenantId),
        sql`to_char(${growthAttributedSales.soldOn}, 'YYYY-MM') = ${month}`,
      ),
    )
  return { amount: Math.round(num(row?.amount) * 100) / 100, tickets: Number(row?.tickets ?? 0) }
}

export type ClientGrowthView = {
  today: string
  stats: {
    purchases: number
    purchases12m: number
    spend12m: number
    lastPurchaseOn: string | null
    lastStore: string | null
    intervalDays: number | null
    intervalSource: string | null
    habitualWeekday: number | null
    expectedOn: string | null
    suggestedOn: string | null
    species: Species | null
    mainProductName: string | null
    mainBrand: string | null
    stores12m: number
    categories: Record<string, CategoryStat>
  } | null
  audiences: { slug: AudienceSlug; name: string; readyOn: string | null; suggestion: Suggestion }[]
  block: ContactBlockView | null
  sends: {
    recipientId: string
    sendId: string
    name: string
    audience: string
    status: string
    sentAt: string | null
    sentBy: string | null
    messageText: string | null
  }[]
  attributed: {
    saleId: string
    soldOn: string
    amount: number
    sendName: string
    daysAfter: number
  }[]
}

export async function clientGrowth(
  tenant: GrowthTenant,
  clientId: string,
): Promise<ClientGrowthView> {
  const today = todayOf(tenant.timezone)
  const [rules, blocks, statsRows, memberRows, block, sendRows, attrRows] = await Promise.all([
    getRules(tenant.id),
    blockStates(tenant.id, tenant.timezone),
    db
      .select()
      .from(growthClientStats)
      .where(
        and(eq(growthClientStats.tenantId, tenant.id), eq(growthClientStats.clientId, clientId)),
      )
      .limit(1),
    db
      .select({ audience: growthAudienceMembers.audience, readyOn: growthAudienceMembers.readyOn })
      .from(growthAudienceMembers)
      .where(
        and(
          eq(growthAudienceMembers.tenantId, tenant.id),
          eq(growthAudienceMembers.clientId, clientId),
        ),
      ),
    activeBlock(tenant.id, clientId),
    db
      .select({
        recipientId: growthSendRecipients.id,
        sendId: growthSends.id,
        name: growthSends.name,
        audience: growthSends.audience,
        status: growthSendRecipients.status,
        sentAt: growthSendRecipients.sentAt,
        sentBy: user.name,
        messageText: growthSendRecipients.messageText,
      })
      .from(growthSendRecipients)
      .innerJoin(growthSends, eq(growthSends.id, growthSendRecipients.sendId))
      .leftJoin(user, eq(user.id, growthSendRecipients.sentBy))
      .where(
        and(
          eq(growthSendRecipients.tenantId, tenant.id),
          eq(growthSendRecipients.clientId, clientId),
        ),
      )
      .orderBy(desc(growthSends.createdAt)),
    db
      .select({
        saleId: growthAttributedSales.saleId,
        soldOn: growthAttributedSales.soldOn,
        amount: growthAttributedSales.amount,
        sendName: growthSends.name,
        daysAfter: growthAttributedSales.daysAfter,
      })
      .from(growthAttributedSales)
      .innerJoin(growthSends, eq(growthSends.id, growthAttributedSales.sendId))
      .where(
        and(
          eq(growthAttributedSales.tenantId, tenant.id),
          eq(growthAttributedSales.clientId, clientId),
        ),
      )
      .orderBy(desc(growthAttributedSales.soldOn)),
  ])
  const s = statsRows[0]
  const b = blocks.get(clientId) ?? NO_BLOCK
  return {
    today,
    stats: s
      ? {
          purchases: s.purchases,
          purchases12m: s.purchases12m,
          spend12m: num(s.spend12m),
          lastPurchaseOn: s.lastPurchaseOn,
          lastStore: s.lastStore,
          intervalDays: s.intervalDays == null ? null : Number(s.intervalDays),
          intervalSource: s.intervalSource,
          habitualWeekday: s.habitualWeekday,
          expectedOn: s.expectedOn,
          suggestedOn: s.suggestedOn,
          species: (s.species as Species | null) ?? null,
          mainProductName: s.mainProductName,
          mainBrand: s.mainBrand,
          stores12m: s.stores12m,
          categories: (s.categories as Record<string, CategoryStat> | null) ?? {},
        }
      : null,
    audiences: memberRows.flatMap((m) => {
      const def = AUDIENCE_BY_SLUG.get(m.audience as AudienceSlug)
      if (!def) return []
      return [
        {
          slug: def.slug,
          name: def.name,
          readyOn: m.readyOn,
          suggestion: def.informational
            ? { ready: false, reason: "not_yet" as const, availableOn: null }
            : suggestion({ readyOn: m.readyOn }, b, today, rules),
        },
      ]
    }),
    block,
    sends: sendRows.map((r) => ({
      recipientId: r.recipientId,
      sendId: r.sendId,
      name: r.name,
      audience: r.audience,
      status: r.status,
      sentAt: r.sentAt ? r.sentAt.toISOString() : null,
      sentBy: r.sentBy,
      messageText: r.messageText,
    })),
    attributed: attrRows.map((r) => ({
      saleId: r.saleId,
      soldOn: r.soldOn,
      amount: num(r.amount),
      sendName: r.sendName,
      daysAfter: r.daysAfter,
    })),
  }
}
