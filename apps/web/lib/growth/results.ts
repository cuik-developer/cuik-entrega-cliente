import {
  and,
  db,
  desc,
  eq,
  growthAttributedSales,
  growthSendRecipients,
  growthSends,
  growthTenantRules,
  gte,
  inArray,
  isNotNull,
  posConnections,
  sales,
  sql,
  tenants,
} from "@cuik/db"
import { parseTenantFeatures } from "@cuik/shared/validators"
import { uuidArrayLiteral } from "@/lib/pos/sync"
import {
  attributeSales,
  measuringDayOf,
  type SaleRow,
  type SentRow,
  sendImpact,
} from "./attribution"
import { AUDIENCE_BY_SLUG, type AudienceSlug } from "./audiences"
import { addDays, DAY_MS } from "./dates"
import { DEFAULT_RULES, type GrowthRules, variableFee } from "./rules"
import { chunk, type GrowthTenant, getRules, growthTenants, rulesFromRow, todayOf } from "./store"

/**
 * Attribution runs (after every POS sync and in the nightly job) and the
 * read models of Resultados (merchant) and Comercios (super-admin).
 */

/** Confirmed sends older than this never gain attributions (max window is 30 days). */
const LOOKBACK_DAYS = 45

export async function attributeTenant(tenantId: string): Promise<number> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS)
  const sent = await db
    .select({
      recipientId: growthSendRecipients.id,
      sendId: growthSendRecipients.sendId,
      clientId: growthSendRecipients.clientId,
      sentAt: growthSendRecipients.sentAt,
      attributionDays: growthSends.attributionDays,
    })
    .from(growthSendRecipients)
    .innerJoin(growthSends, eq(growthSends.id, growthSendRecipients.sendId))
    .where(
      and(
        eq(growthSendRecipients.tenantId, tenantId),
        isNotNull(growthSendRecipients.sentAt),
        gte(growthSendRecipients.sentAt, since),
      ),
    )
  if (sent.length === 0) return 0
  const sentRows: SentRow[] = sent.map((s) => ({
    recipientId: s.recipientId,
    sendId: s.sendId,
    clientId: s.clientId,
    sentAt: s.sentAt as Date,
    attributionDays: s.attributionDays,
  }))
  const minSent = new Date(Math.min(...sentRows.map((s) => s.sentAt.getTime())))
  const clientIds = [...new Set(sentRows.map((s) => s.clientId))]

  const saleRows: SaleRow[] = []
  for (const ids of chunk(clientIds)) {
    const rows = await db
      .select({
        id: sales.id,
        clientId: sales.clientId,
        soldAt: sales.soldAt,
        soldOn: sales.soldOn,
        amount: sales.amount,
      })
      .from(sales)
      .where(
        and(
          eq(sales.tenantId, tenantId),
          inArray(sales.clientId, ids),
          isNotNull(sales.soldAt),
          gte(sales.soldAt, minSent),
        ),
      )
    for (const r of rows) {
      if (!r.clientId || !r.soldAt) continue
      saleRows.push({
        saleId: r.id,
        clientId: r.clientId,
        soldAt: r.soldAt,
        soldOn: r.soldOn,
        amount: Number(r.amount),
      })
    }
  }
  const attributions = attributeSales(sentRows, saleRows)

  // Reconcile with what is stored for these recipients: a sale the POS
  // re-linked to another client, zeroed or that now falls to a later send
  // loses its old row; amounts follow the sale.
  const wanted = new Map(attributions.map((a) => [a.saleId, a]))
  const stale: string[] = []
  for (const ids of chunk(sentRows.map((s) => s.recipientId))) {
    const existing = await db
      .select({
        id: growthAttributedSales.id,
        saleId: growthAttributedSales.saleId,
        recipientId: growthAttributedSales.recipientId,
      })
      .from(growthAttributedSales)
      .where(
        and(
          eq(growthAttributedSales.tenantId, tenantId),
          inArray(growthAttributedSales.recipientId, ids),
        ),
      )
    for (const e of existing) {
      const w = wanted.get(e.saleId)
      if (!w || w.recipientId !== e.recipientId) stale.push(e.id)
    }
  }
  for (const ids of chunk(stale)) {
    await db.delete(growthAttributedSales).where(inArray(growthAttributedSales.id, ids))
  }
  if (attributions.length === 0) return 0
  let written = 0
  for (const part of chunk(attributions)) {
    const rows = await db
      .insert(growthAttributedSales)
      .values(
        part.map((a) => ({
          tenantId,
          recipientId: a.recipientId,
          sendId: a.sendId,
          clientId: a.clientId,
          saleId: a.saleId,
          amount: String(a.amount),
          soldOn: a.soldOn,
          daysAfter: a.daysAfter,
        })),
      )
      .onConflictDoUpdate({
        target: growthAttributedSales.saleId,
        set: {
          recipientId: sql`excluded.recipient_id`,
          sendId: sql`excluded.send_id`,
          clientId: sql`excluded.client_id`,
          amount: sql`excluded.amount`,
          soldOn: sql`excluded.sold_on`,
          daysAfter: sql`excluded.days_after`,
        },
      })
      .returning({ id: growthAttributedSales.id })
    written += rows.length
  }
  return written
}

export async function attributeAll(
  tenantIds?: string[],
): Promise<{ tenantId: string; attributed: number }[]> {
  const targets = tenantIds
    ? (await growthTenants()).filter((t) => tenantIds.includes(t.id))
    : await growthTenants()
  const out: { tenantId: string; attributed: number }[] = []
  for (const t of targets) {
    try {
      out.push({ tenantId: t.id, attributed: await attributeTenant(t.id) })
    } catch (err) {
      console.error("[growth] attribution failed", t.id, err)
    }
  }
  return out
}

// --- Resultados (merchant) ---

export type SendResultRow = {
  id: string
  name: string
  audience: string
  audienceName: string
  channel: string
  createdAt: string
  status: "open" | "closed"
  attributionDays: number
  snapshotTotal: number
  sent: number
  sentBuyers: number
  sentSales: number
  sentTickets: number
  control: number
  controlBuyers: number
  controlSales: number
  sentRate: number | null
  controlRate: number | null
  incremental: number | null
  avgTicket: number | null
  /** "measuring" (window still open), "measured", "no_effect" (measured, incremental ≤ 0), "none" (nothing sent). */
  verdict: "measuring" | "measured" | "no_effect" | "none"
  measuringDay: number | null
  orientative: boolean
}

export type ResultsView = {
  from: string
  to: string
  rules: GrowthRules
  totals: {
    sends: number
    byChannel: Record<string, number>
    sent: number
    control: number
    sentBuyers: number
    controlBuyers: number
    sentRate: number | null
    controlRate: number | null
    attributedAmount: number
    attributedTickets: number
    incremental: number
  }
  rows: SendResultRow[]
}

export async function sendResults(
  tenant: GrowthTenant,
  range: { from: string; to: string },
): Promise<ResultsView> {
  const rules = await getRules(tenant.id)
  const today = todayOf(tenant.timezone)
  const sends = await db
    .select()
    .from(growthSends)
    .where(
      and(
        eq(growthSends.tenantId, tenant.id),
        sql`(${growthSends.createdAt} at time zone 'UTC' at time zone ${tenant.timezone})::date between ${range.from}::date and ${range.to}::date`,
      ),
    )
    .orderBy(desc(growthSends.createdAt))
  const ids = sends.map((s) => s.id)
  const empty: ResultsView = {
    from: range.from,
    to: range.to,
    rules,
    totals: {
      sends: 0,
      byChannel: {},
      sent: 0,
      control: 0,
      sentBuyers: 0,
      controlBuyers: 0,
      sentRate: null,
      controlRate: null,
      attributedAmount: 0,
      attributedTickets: 0,
      incremental: 0,
    },
    rows: [],
  }
  if (ids.length === 0) return empty

  const [statusRows, attrRows, controlRows, sentRows] = await Promise.all([
    db
      .select({
        sendId: growthSendRecipients.sendId,
        status: growthSendRecipients.status,
        n: sql<number>`count(*)`,
      })
      .from(growthSendRecipients)
      .where(inArray(growthSendRecipients.sendId, ids))
      .groupBy(growthSendRecipients.sendId, growthSendRecipients.status),
    db
      .select({
        sendId: growthAttributedSales.sendId,
        buyers: sql<number>`count(distinct ${growthAttributedSales.clientId})`,
        tickets: sql<number>`count(*)`,
        amount: sql<string>`coalesce(sum(${growthAttributedSales.amount}), 0)`,
      })
      .from(growthAttributedSales)
      .where(inArray(growthAttributedSales.sendId, ids))
      .groupBy(growthAttributedSales.sendId),
    // Control clients who bought inside the send's window (from its creation).
    db.execute<{ send_id: string; buyers: string; amount: string }>(sql`
      select r.send_id, count(distinct s.client_id) as buyers, coalesce(sum(s.amount), 0) as amount
      from growth.send_recipients r
      join growth.sends sd on sd.id = r.send_id
      join analytics.sales s
        on s.tenant_id = r.tenant_id and s.client_id = r.client_id
       and s.sold_at is not null and s.amount > 0
       and s.sold_at >= sd.created_at
       and s.sold_at <= sd.created_at + make_interval(days => sd.attribution_days)
      where r.tenant_id = ${tenant.id} and r.status = 'control' and r.send_id = any(${uuidArrayLiteral(ids)}::uuid[])
      group by r.send_id
    `),
    db
      .select({
        sendId: growthSendRecipients.sendId,
        first: sql<Date>`min(${growthSendRecipients.sentAt})`,
        last: sql<Date>`max(${growthSendRecipients.sentAt})`,
      })
      .from(growthSendRecipients)
      .where(and(inArray(growthSendRecipients.sendId, ids), isNotNull(growthSendRecipients.sentAt)))
      .groupBy(growthSendRecipients.sendId),
  ])
  const sentBy = new Map(sentRows.map((r) => [r.sendId, r]))
  const statusBy = new Map<string, Record<string, number>>()
  for (const r of statusRows) {
    const m = statusBy.get(r.sendId) ?? {}
    m[r.status] = Number(r.n)
    statusBy.set(r.sendId, m)
  }
  const attrBy = new Map(attrRows.map((r) => [r.sendId, r]))
  const controlBy = new Map(controlRows.rows.map((r) => [r.send_id, r]))

  const rows: SendResultRow[] = sends.map((s) => {
    const st = statusBy.get(s.id) ?? {}
    const sent = (st.sent ?? 0) + (st.replied ?? 0)
    const control = st.control ?? 0
    const a = attrBy.get(s.id)
    const c = controlBy.get(s.id)
    const sentBuyers = a ? Number(a.buyers) : 0
    const sentSales = a ? Math.round(Number(a.amount) * 100) / 100 : 0
    const sentTickets = a ? Number(a.tickets) : 0
    const controlBuyers = c ? Number(c.buyers) : 0
    const controlSales = c ? Math.round(Number(c.amount) * 100) / 100 : 0
    const impact = sendImpact({
      sent,
      sentBuyers,
      sentSales,
      control,
      controlBuyers,
      controlSales,
      minControl: rules.minControl,
    })
    const sentAt = sentBy.get(s.id)
    const day = measuringDayOf(
      {
        firstSentAt: sentAt ? new Date(sentAt.first).toISOString() : null,
        lastSentAt: sentAt ? new Date(sentAt.last).toISOString() : null,
      },
      s.attributionDays,
      today,
      tenant.timezone,
    )
    const measuring = sent > 0 && day !== null
    const verdict = verdictOf(sent, measuring, impact.incremental)
    const def = AUDIENCE_BY_SLUG.get(s.audience as AudienceSlug)
    return {
      id: s.id,
      name: s.name,
      audience: s.audience,
      audienceName: def?.name ?? s.audience,
      channel: s.channel,
      createdAt: s.createdAt.toISOString(),
      status: s.status as "open" | "closed",
      attributionDays: s.attributionDays,
      snapshotTotal: s.snapshotTotal,
      sent,
      sentBuyers,
      sentSales,
      sentTickets,
      control,
      controlBuyers,
      controlSales,
      sentRate: impact.sentRate,
      controlRate: impact.controlRate,
      incremental: impact.incremental,
      avgTicket: sentTickets > 0 ? Math.round((sentSales / sentTickets) * 100) / 100 : null,
      verdict,
      measuringDay: day,
      orientative: impact.orientative,
    }
  })

  const totals = { ...empty.totals, sends: rows.length }
  for (const r of rows) {
    totals.byChannel[r.channel] = (totals.byChannel[r.channel] ?? 0) + 1
    totals.sent += r.sent
    totals.control += r.control
    totals.sentBuyers += r.sentBuyers
    totals.controlBuyers += r.controlBuyers
    totals.attributedAmount += r.sentSales
    totals.attributedTickets += r.sentTickets
    totals.incremental += r.incremental ?? 0
  }
  totals.attributedAmount = Math.round(totals.attributedAmount * 100) / 100
  totals.incremental = Math.round(totals.incremental * 100) / 100
  totals.sentRate = totals.sent > 0 ? totals.sentBuyers / totals.sent : null
  totals.controlRate = totals.control > 0 ? totals.controlBuyers / totals.control : null
  return { from: range.from, to: range.to, rules, totals, rows }
}

function verdictOf(
  sent: number,
  measuring: boolean,
  incremental: number | null,
): SendResultRow["verdict"] {
  if (sent === 0) return "none"
  if (measuring) return "measuring"
  if (incremental !== null && incremental <= 0) return "no_effect"
  return "measured"
}

/** Default range for Resultados: the last 90 days up to today. */
export function defaultRange(today: string): { from: string; to: string } {
  return { from: addDays(today, -90), to: today }
}

/** The attributed tickets of a month, one by one (the merchant sees the same list Cuik bills). */
export async function attributedTickets(
  tenant: GrowthTenant,
  month: string,
): Promise<
  { soldOn: string; amount: number; clientId: string; sendName: string; daysAfter: number }[]
> {
  const rows = await db
    .select({
      soldOn: growthAttributedSales.soldOn,
      amount: growthAttributedSales.amount,
      clientId: growthAttributedSales.clientId,
      sendName: growthSends.name,
      daysAfter: growthAttributedSales.daysAfter,
    })
    .from(growthAttributedSales)
    .innerJoin(growthSends, eq(growthSends.id, growthAttributedSales.sendId))
    .where(
      and(
        eq(growthAttributedSales.tenantId, tenant.id),
        sql`to_char(${growthAttributedSales.soldOn}, 'YYYY-MM') = ${month}`,
      ),
    )
    .orderBy(desc(growthAttributedSales.soldOn))
    .limit(2000)
  return rows.map((r) => ({
    soldOn: r.soldOn,
    amount: Number(r.amount),
    clientId: r.clientId,
    sendName: r.sendName,
    daysAfter: r.daysAfter,
  }))
}

// --- Super-admin: Comercios ---

export type TenantGrowthRow = {
  id: string
  name: string
  slug: string
  status: string
  growthOn: boolean
  connector: { enabled: boolean; lastSyncAt: string | null; lastError: string | null } | null
  rules: GrowthRules
  sendsMonth: number
  sentMonth: number
  attributedMonth: { amount: number; tickets: number }
  billing: { fixed: number; variable: number; total: number }
  /** "pilot" (inside the pilot months), "billing", "not_started". */
  phase: "pilot" | "billing" | "not_started"
  pilotMonth: number | null
}

export async function growthOverview(month: string): Promise<TenantGrowthRow[]> {
  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      status: tenants.status,
      features: tenants.features,
      connEnabled: posConnections.enabled,
      lastSyncAt: posConnections.lastSyncAt,
      lastError: posConnections.lastError,
      hasConn: posConnections.id,
    })
    .from(tenants)
    .leftJoin(posConnections, eq(posConnections.tenantId, tenants.id))
    .where(sql`${tenants.status} <> 'archived'`)
    .orderBy(tenants.name)
    .limit(500)
  // One grouped query per table, months by each tenant's local time.
  const [ruleRows, sendRows, sentRows, attrRows] = await Promise.all([
    db.select().from(growthTenantRules),
    db.execute<{ tenant_id: string; n: string }>(sql`
      select s.tenant_id, count(*) as n
      from growth.sends s join public.tenants t on t.id = s.tenant_id
      where to_char(s.created_at at time zone 'UTC' at time zone t.timezone, 'YYYY-MM') = ${month}
      group by s.tenant_id`),
    db.execute<{ tenant_id: string; n: string }>(sql`
      select r.tenant_id, count(*) as n
      from growth.send_recipients r join public.tenants t on t.id = r.tenant_id
      where r.sent_at is not null
        and to_char(r.sent_at at time zone 'UTC' at time zone t.timezone, 'YYYY-MM') = ${month}
      group by r.tenant_id`),
    db.execute<{ tenant_id: string; tickets: string; amount: string }>(sql`
      select tenant_id, count(*) as tickets, coalesce(sum(amount), 0) as amount
      from growth.attributed_sales
      where to_char(sold_on, 'YYYY-MM') = ${month}
      group by tenant_id`),
  ])
  const rulesBy = new Map(ruleRows.map((r) => [r.tenantId, rulesFromRow(r)]))
  const sendsBy = new Map(sendRows.rows.map((r) => [r.tenant_id, Number(r.n)]))
  const sentBy = new Map(sentRows.rows.map((r) => [r.tenant_id, Number(r.n)]))
  const attrBy = new Map(
    attrRows.rows.map((r) => [
      r.tenant_id,
      { amount: Math.round(Number(r.amount) * 100) / 100, tickets: Number(r.tickets) },
    ]),
  )

  const out: TenantGrowthRow[] = []
  for (const t of rows) {
    const growthOn = parseTenantFeatures(t.features).growth
    const rules = rulesBy.get(t.id) ?? { ...DEFAULT_RULES }
    const attributed = growthOn
      ? (attrBy.get(t.id) ?? { amount: 0, tickets: 0 })
      : { amount: 0, tickets: 0 }
    const variable = variableFee(attributed.amount, rules.feeVariablePct)
    const pilotMonth = pilotMonthOf(rules, month)
    const phase = phaseOf(growthOn, rules, pilotMonth)
    out.push({
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      growthOn,
      connector: t.hasConn
        ? {
            enabled: Boolean(t.connEnabled),
            lastSyncAt: t.lastSyncAt ? t.lastSyncAt.toISOString() : null,
            lastError: t.lastError,
          }
        : null,
      rules,
      sendsMonth: growthOn ? (sendsBy.get(t.id) ?? 0) : 0,
      sentMonth: growthOn ? (sentBy.get(t.id) ?? 0) : 0,
      attributedMonth: attributed,
      billing: growthOn
        ? {
            fixed: rules.feeFixed,
            variable,
            total: Math.round((rules.feeFixed + variable) * 100) / 100,
          }
        : { fixed: 0, variable: 0, total: 0 },
      phase,
      pilotMonth,
    })
  }
  return out
}

/** Growth off or a start date still ahead: not started; inside the pilot months: pilot; else billing. */
function phaseOf(
  growthOn: boolean,
  rules: Pick<GrowthRules, "startsOn" | "pilotMonths">,
  pilotMonth: number | null,
): TenantGrowthRow["phase"] {
  if (!growthOn) return "not_started"
  // Without a start date nothing is billed yet: Cuik sets it when the service begins.
  if (pilotMonth === null) return "not_started"
  return pilotMonth <= rules.pilotMonths ? "pilot" : "billing"
}

/** 1-based month of the service for "YYYY-MM" (1 = the month it started); null without a start date. */
export function pilotMonthOf(rules: Pick<GrowthRules, "startsOn">, month: string): number | null {
  if (!rules.startsOn) return null
  const [sy, sm] = rules.startsOn.split("-").map(Number)
  const [y, m] = month.split("-").map(Number)
  const n = (y - sy) * 12 + (m - sm) + 1
  return n >= 1 ? n : null
}
