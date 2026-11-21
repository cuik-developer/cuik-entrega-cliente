import {
  and,
  campaigns,
  clients,
  db,
  eq,
  gte,
  inArray,
  isNotNull,
  notifications,
  plans,
  sql,
  tenants,
  visits,
} from "@cuik/db"
import { z } from "zod"

import { getThresholds, type SegmentationThresholds } from "@/lib/loyalty/client-segments"
import {
  CAMPAIGN_KINDS,
  type CampaignClientRow,
  type CampaignKind,
  campaignClients,
  clampWindow,
  computeLoyaltyImpact,
  type ImpactCampaign,
  type ImpactClient,
  type ImpactVisit,
  type LoyaltyImpact,
  type LoyaltyImpactInput,
  suggestWindow,
  typicalGapDays,
  WINDOW_MAX,
  WINDOW_MIN,
} from "./metrics"

/**
 * What the super-admin sets per tenant for Impacto Loyalty. Kept in
 * `tenants.features.impact` (Cuik-only settings; the merchant never writes there).
 */
export const impactSettingsSchema = z.object({
  /** Share of return-visit sales that would not have happened without the card. */
  factorPct: z.number().min(0).max(100),
  /** Where that share comes from: another merchant, this merchant's own sales, or its clients' answers. */
  factorOrigin: z.enum(["reference", "measured", "declared"]),
  marginPct: z.number().min(0).max(100),
  monthlyFee: z.number().min(0).max(1_000_000),
  /** Days to come back after a campaign; null = the one suggested from the tenant's rhythm. */
  windowDays: z.number().int().min(WINDOW_MIN).max(WINDOW_MAX).nullable(),
})
export type ImpactSettings = z.infer<typeof impactSettingsSchema>

/** 20 % is what Mascota Veloz measured against its own sales: a reference for everyone else. */
export const DEFAULT_SETTINGS: ImpactSettings = {
  factorPct: 20,
  factorOrigin: "reference",
  marginPct: 30,
  monthlyFee: 0,
  windowDays: null,
}

/** Campaigns older than this are left out: they would cost a lot to read and say little today. */
const CAMPAIGN_MONTHS = 24
/** Reading a tenant's whole history is heavy; typing a window or opening a campaign reuses it. */
const CACHE_MS = 5 * 60 * 1000
const CACHE_ENTRIES = 12

export type LoyaltyImpactView = {
  tenant: { id: string; name: string }
  settings: ImpactSettings
  /** True when nothing was saved yet for this tenant: the screen shows defaults. */
  settingsAreDefault: boolean
  impact: LoyaltyImpact
}

export type CampaignClientView = CampaignClientRow & { name: string }

/** Calendar day of an instant in the tenant's timezone, "YYYY-MM-DD". */
function dayIn(timezone: string): (at: Date) => string {
  const make = (tz: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
  let fmt: Intl.DateTimeFormat
  try {
    fmt = make(timezone)
  } catch {
    fmt = make("America/Lima")
  }
  return (at) => fmt.format(at)
}

function kindOf(content: unknown): CampaignKind {
  const automation = (content as { automation?: unknown } | null)?.automation
  return (CAMPAIGN_KINDS as readonly unknown[]).includes(automation)
    ? (automation as CampaignKind)
    : "manual"
}

function readSettings(features: unknown, planPrice: number | null) {
  const saved = (features as { impact?: unknown } | null)?.impact
  const parsed = impactSettingsSchema.safeParse(saved)
  if (parsed.success) return { settings: parsed.data, isDefault: false }
  return {
    settings: { ...DEFAULT_SETTINGS, monthlyFee: planPrice && planPrice > 0 ? planPrice : 0 },
    isDefault: true,
  }
}

type Loaded = {
  tenant: { id: string; name: string }
  today: string
  thresholds: SegmentationThresholds
  clients: ImpactClient[]
  visits: ImpactVisit[]
  campaigns: ImpactCampaign[]
}

type Cached<T> = { at: number; value: T }
const loadedCache = new Map<string, Cached<Loaded>>()
const impactCache = new Map<string, Cached<LoyaltyImpact>>()

function remember<T>(cache: Map<string, Cached<T>>, key: string, value: T) {
  cache.delete(key)
  cache.set(key, { at: Date.now(), value })
  while (cache.size > CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}
function recall<T>(cache: Map<string, Cached<T>>, key: string): T | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_MS) {
    cache.delete(key)
    return null
  }
  return hit.value
}

/**
 * Everything Impacto Loyalty needs for one tenant: its clients, every stamp
 * and who each sent campaign reached. Only ids, dates and amounts (no names,
 * no DNI): names are read apart, for the list of one campaign.
 */
async function load(tenantId: string, now: Date): Promise<Loaded | null> {
  const cached = recall(loadedCache, tenantId)
  if (cached) return cached

  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      timezone: tenants.timezone,
      businessType: tenants.businessType,
      segmentationConfig: tenants.segmentationConfig,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  if (!tenant) return null
  const day = dayIn(tenant.timezone)
  const since = new Date(now)
  since.setMonth(since.getMonth() - CAMPAIGN_MONTHS)

  const [clientRows, visitRows, campaignRows] = await Promise.all([
    db
      .select({ id: clients.id, createdAt: clients.createdAt })
      .from(clients)
      .where(eq(clients.tenantId, tenantId)),
    db
      .select({
        clientId: visits.clientId,
        createdAt: visits.createdAt,
        amount: visits.amount,
        cycle: visits.cycleNumber,
        source: visits.source,
      })
      .from(visits)
      .where(eq(visits.tenantId, tenantId)),
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        content: campaigns.content,
        sentAt: campaigns.sentAt,
      })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.tenantId, tenantId),
          eq(campaigns.status, "sent"),
          isNotNull(campaigns.sentAt),
          gte(campaigns.sentAt, since),
        ),
      ),
  ])

  const reached = new Map<string, Set<string>>()
  const campaignIds = campaignRows.map((c) => c.id)
  // In slices: a tenant with daily and weekly sends has hundreds of campaigns.
  for (let i = 0; i < campaignIds.length; i += 500) {
    const rows = await db
      .select({ campaignId: notifications.campaignId, clientId: notifications.clientId })
      .from(notifications)
      .where(
        and(
          inArray(notifications.campaignId, campaignIds.slice(i, i + 500)),
          inArray(notifications.status, ["sent", "delivered"]),
        ),
      )
    for (const r of rows) {
      const set = reached.get(r.campaignId) ?? new Set<string>()
      set.add(r.clientId)
      reached.set(r.campaignId, set)
    }
  }

  const loaded: Loaded = {
    tenant: { id: tenant.id, name: tenant.name },
    today: day(now),
    thresholds: getThresholds(
      tenant.businessType,
      tenant.segmentationConfig as Partial<SegmentationThresholds> | null,
    ),
    clients: clientRows.map((c) => ({ id: c.id, registeredOn: day(c.createdAt) })),
    visits: visitRows.map((v) => ({
      clientId: v.clientId,
      day: day(v.createdAt),
      at: v.createdAt.getTime(),
      amount: v.amount === null ? null : Number(v.amount),
      cycle: v.cycle,
      // The welcome stamp of the sign-up: a stamp, not a purchase.
      bonus: v.source === "bonus",
    })),
    campaigns: campaignRows.flatMap((c) =>
      c.sentAt
        ? [
            {
              id: c.id,
              name: c.name,
              kind: kindOf(c.content),
              sentOn: day(c.sentAt),
              sentAt: c.sentAt.getTime(),
              recipients: [...(reached.get(c.id) ?? [])],
            },
          ]
        : [],
    ),
  }
  remember(loadedCache, tenantId, loaded)
  return loaded
}

/** Settings are small and change on save: always read fresh, never from the cache. */
async function loadSettings(tenantId: string) {
  const [row] = await db
    .select({ features: tenants.features, planPrice: plans.price })
    .from(tenants)
    .leftJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.id, tenantId))
    .limit(1)
  return readSettings(row?.features, row?.planPrice ?? null)
}

/** The window to use: the one asked for, else the saved one, else the tenant's own rhythm. */
function windowFor(loaded: Loaded, settings: ImpactSettings, asked: number | null): number {
  if (asked !== null) return clampWindow(asked)
  if (settings.windowDays !== null) return settings.windowDays
  return suggestWindow(typicalGapDays(loaded.visits))
}

const inputOf = (loaded: Loaded, windowDays: number): LoyaltyImpactInput => ({
  today: loaded.today,
  clients: loaded.clients,
  visits: loaded.visits,
  campaigns: loaded.campaigns,
  windowDays,
  thresholds: loaded.thresholds,
})

export async function loadLoyaltyImpact(
  tenantId: string,
  askedWindow: number | null,
  now = new Date(),
): Promise<LoyaltyImpactView | null> {
  const loaded = await load(tenantId, now)
  if (!loaded) return null
  const { settings, isDefault } = await loadSettings(tenantId)
  const windowDays = windowFor(loaded, settings, askedWindow)
  const key = `${tenantId}|${windowDays}|${loaded.today}`
  let impact = recall(impactCache, key)
  if (!impact) {
    impact = computeLoyaltyImpact(inputOf(loaded, windowDays))
    remember(impactCache, key, impact)
  }
  return { tenant: loaded.tenant, settings, settingsAreDefault: isDefault, impact }
}

/** Saves the super-admin's assumptions for a tenant, leaving the other features alone. */
export async function saveImpactSettings(
  tenantId: string,
  settings: ImpactSettings,
): Promise<boolean> {
  const rows = await db
    .update(tenants)
    .set({
      features: sql`jsonb_set(coalesce(${tenants.features}, '{}'::jsonb), '{impact}', ${JSON.stringify(settings)}::jsonb, true)`,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId))
    .returning({ id: tenants.id })
  return rows.length > 0
}

export type CampaignClientsView = {
  tenantName: string
  campaign: { id: string; name: string; sentOn: string; kind: CampaignKind }
  windowDays: number
  rows: CampaignClientView[]
}

/**
 * The client-by-client list of one campaign: who it reached, how each one was
 * on the send day and what they did after. This is the only place where names
 * leave the database, and only for that campaign's recipients.
 */
export async function loadCampaignClients(
  tenantId: string,
  campaignId: string,
  askedWindow: number | null,
  now = new Date(),
): Promise<CampaignClientsView | null> {
  const loaded = await load(tenantId, now)
  if (!loaded) return null
  const campaign = loaded.campaigns.find((c) => c.id === campaignId)
  if (!campaign) return null
  const { settings } = await loadSettings(tenantId)
  const windowDays = windowFor(loaded, settings, askedWindow)
  const rows = campaignClients(inputOf(loaded, windowDays), campaignId) ?? []

  const names = new Map<string, string>()
  const ids = rows.map((r) => r.clientId)
  for (let i = 0; i < ids.length; i += 1000) {
    const found = await db
      .select({ id: clients.id, name: clients.name, lastName: clients.lastName })
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), inArray(clients.id, ids.slice(i, i + 1000))))
    for (const c of found) names.set(c.id, [c.name, c.lastName].filter(Boolean).join(" "))
  }

  return {
    tenantName: loaded.tenant.name,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      sentOn: campaign.sentOn,
      kind: campaign.kind,
    },
    windowDays,
    rows: rows
      .map((r) => ({ ...r, name: names.get(r.clientId) ?? "Cliente" }))
      .sort(
        (a, b) =>
          Number(b.returnedOn !== null) - Number(a.returnedOn !== null) ||
          b.sales - a.sales ||
          a.name.localeCompare(b.name),
      ),
  }
}
