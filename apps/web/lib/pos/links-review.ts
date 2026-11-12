import {
  and,
  clients,
  db,
  eq,
  gte,
  inArray,
  isNotNull,
  locations,
  lte,
  sales,
  sql,
  tenants,
  user,
  visits,
} from "@cuik/db"

import { dayInTz, sameAmount, sameStore } from "./match"

/**
 * Validación de enlaces (super-admin, before each month's close): the
 * stamps of a month that have no POS sale linked, with the sales nearby that
 * could be theirs, and the links the matcher inferred, to confirm or undo.
 * A link made here is `link_kind = 'manual'`: the matcher never touches it.
 */

/** A candidate sale is shown up to this far from the stamp, either side. */
const CANDIDATE_WINDOW_MS = 120 * 60_000
/** Up to this far and with the same amount it is suggested as "Enlazar". */
const SUGGEST_WINDOW_MS = 60 * 60_000
const CANDIDATES_PER_VISIT = 4

export type Suggestion = "link" | "review" | "none"

export type CandidateSale = {
  saleId: string
  orderRef: string | null
  soldAt: string
  /** Minutes from the stamp to the sale (negative = sale before the stamp). */
  minutes: number
  store: string | null
  amount: number
  /** Document typed at the till (null = guest). */
  dni: string | null
  customerName: string | null
  /** The sale already belongs to a Cuik client (its DNI matched) but has no stamp. */
  clientId: string | null
  sameAmount: boolean
  sameStore: boolean
}

export type UnlinkedVisit = {
  visitId: string
  createdAt: string
  day: string
  clientId: string
  clientName: string
  dni: string | null
  phone: string | null
  location: string | null
  amount: number | null
  registeredBy: string | null
  suggestion: Suggestion
  candidates: CandidateSale[]
}

export type InferredLink = {
  saleId: string
  orderRef: string | null
  soldAt: string
  store: string | null
  amount: number
  linkKind: string
  visitId: string
  visitAt: string
  clientName: string
  dni: string | null
  location: string | null
  visitAmount: number | null
}

export type LinksReview = {
  month: string
  from: string
  to: string
  timezone: string
  summary: {
    visits: number
    withSale: number
    withoutSale: number
    /** withSale / visits, in %. */
    rate: number | null
    byKind: { dni: number; inferredAmount: number; inferredTime: number; manual: number }
    guestUnlinked: number
    clientNoVisit: number
    suggestions: { link: number; review: number; none: number }
  }
  unlinked: UnlinkedVisit[]
  inferred: InferredLink[]
}

export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` }
}

/** UTC instants that surely cover the local days `from..to` (a day of slack each side). */
function utcSlack(from: string, to: string): { fromUtc: Date; toUtc: Date } {
  const fromUtc = new Date(`${from}T00:00:00Z`)
  fromUtc.setUTCDate(fromUtc.getUTCDate() - 1)
  const toUtc = new Date(`${to}T00:00:00Z`)
  toUtc.setUTCDate(toUtc.getUTCDate() + 2)
  return { fromUtc, toUtc }
}

const num = (v: string | number | null | undefined): number | null => (v == null ? null : Number(v))

export async function linksReview(tenantId: string, month: string): Promise<LinksReview | null> {
  const [t] = await db
    .select({ timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  if (!t) return null
  const timezone = t.timezone
  const { from, to } = monthBounds(month)
  const { fromUtc, toUtc } = utcSlack(from, to)

  const [visitRows, saleRows, kindRows] = await Promise.all([
    db
      .select({
        id: visits.id,
        createdAt: visits.createdAt,
        clientId: visits.clientId,
        name: clients.name,
        lastName: clients.lastName,
        dni: clients.dni,
        phone: clients.phone,
        amount: visits.amount,
        location: locations.name,
        registeredBy: user.name,
        saleId: sql<
          string | null
        >`(select s.id from analytics.sales s where s.visit_id = ${visits.id} limit 1)`,
      })
      .from(visits)
      .innerJoin(clients, eq(clients.id, visits.clientId))
      .leftJoin(locations, eq(locations.id, visits.locationId))
      .leftJoin(user, eq(user.id, visits.registeredBy))
      .where(
        and(
          eq(visits.tenantId, tenantId),
          sql`${visits.source} <> 'bonus'`,
          sql`${clients.status} <> 'deleted'`,
          gte(visits.createdAt, fromUtc),
          lte(visits.createdAt, toUtc),
        ),
      ),
    // Every synced sale of those days: the linked ones feed the inferred list, the free ones are candidates.
    db
      .select({
        id: sales.id,
        orderRef: sales.orderRef,
        soldAt: sales.soldAt,
        store: sales.store,
        amount: sales.amount,
        dni: sales.dni,
        customerName: sales.customerName,
        clientId: sales.clientId,
        visitId: sales.visitId,
        linkKind: sales.linkKind,
      })
      .from(sales)
      .where(
        and(
          eq(sales.tenantId, tenantId),
          eq(sales.source, "pos"),
          isNotNull(sales.soldAt),
          sql`${sales.amount} > 0`,
          gte(sales.soldOn, from),
          lte(sales.soldOn, to),
        ),
      ),
    db
      .select({
        dni: sql<number>`count(*) filter (where ${sales.visitId} is not null and ${sales.linkKind} = 'dni')::int`,
        inferredAmount: sql<number>`count(*) filter (where ${sales.visitId} is not null and ${sales.linkKind} = 'inferred_amount')::int`,
        inferredTime: sql<number>`count(*) filter (where ${sales.visitId} is not null and ${sales.linkKind} = 'inferred_time')::int`,
        manual: sql<number>`count(*) filter (where ${sales.visitId} is not null and ${sales.linkKind} = 'manual')::int`,
        guestUnlinked: sql<number>`count(*) filter (where ${sales.dni} is null and ${sales.visitId} is null)::int`,
        clientNoVisit: sql<number>`count(*) filter (where ${sales.clientId} is not null and ${sales.visitId} is null)::int`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.tenantId, tenantId),
          eq(sales.source, "pos"),
          sql`${sales.amount} > 0`,
          gte(sales.soldOn, from),
          lte(sales.soldOn, to),
        ),
      ),
  ])

  // Only the visits whose local day falls in the month.
  const monthVisits = visitRows.filter((v) => {
    const d = dayInTz(v.createdAt, timezone)
    return d >= from && d <= to
  })
  const withSale = monthVisits.filter((v) => v.saleId).length

  const freeSales = saleRows.filter((s) => !s.visitId && s.soldAt)
  const freeByDay = new Map<string, typeof freeSales>()
  for (const s of freeSales) {
    const d = dayInTz(s.soldAt as Date, timezone)
    const list = freeByDay.get(d) ?? []
    list.push(s)
    freeByDay.set(d, list)
  }

  const unlinked: UnlinkedVisit[] = []
  const suggestions = { link: 0, review: 0, none: 0 }
  for (const v of monthVisits) {
    if (v.saleId) continue
    const day = dayInTz(v.createdAt, timezone)
    const visitAmount = num(v.amount)
    const candidates: CandidateSale[] = (freeByDay.get(day) ?? [])
      .map((s) => {
        const soldAt = s.soldAt as Date
        const dt = soldAt.getTime() - v.createdAt.getTime()
        return { s, soldAt, dt }
      })
      .filter(({ dt }) => Math.abs(dt) <= CANDIDATE_WINDOW_MS)
      .sort((a, b) => Math.abs(a.dt) - Math.abs(b.dt))
      .slice(0, CANDIDATES_PER_VISIT)
      .map(({ s, soldAt, dt }) => {
        const amount = Number(s.amount)
        return {
          saleId: s.id,
          orderRef: s.orderRef,
          soldAt: soldAt.toISOString(),
          minutes: Math.round(dt / 60_000),
          store: s.store,
          amount,
          dni: s.dni,
          customerName: s.customerName,
          clientId: s.clientId,
          sameAmount: visitAmount != null && sameAmount(amount, visitAmount),
          sameStore: sameStore(s.store, v.location),
        }
      })
    const suggestion = suggestionFor(candidates)
    suggestions[suggestion]++
    unlinked.push({
      visitId: v.id,
      createdAt: v.createdAt.toISOString(),
      day,
      clientId: v.clientId,
      clientName: `${v.name} ${v.lastName ?? ""}`.trim(),
      dni: v.dni,
      phone: v.phone,
      location: v.location,
      amount: visitAmount,
      registeredBy: v.registeredBy,
      suggestion,
      candidates,
    })
  }
  // Suggested links first, then the ones to review, then by date.
  const order: Record<Suggestion, number> = { link: 0, review: 1, none: 2 }
  unlinked.sort(
    (a, b) => order[a.suggestion] - order[b.suggestion] || a.createdAt.localeCompare(b.createdAt),
  )

  // Inferred links of the month: the sale, the visit it got and the client.
  const inferredRows = saleRows.filter(
    (s) => s.visitId && (s.linkKind === "inferred_amount" || s.linkKind === "inferred_time"),
  )
  const visitById = new Map(visitRows.map((v) => [v.id, v]))
  const inferred: InferredLink[] = inferredRows
    .map((s) => {
      const v = visitById.get(s.visitId as string)
      if (!v) return null
      return {
        saleId: s.id,
        orderRef: s.orderRef,
        soldAt: (s.soldAt as Date).toISOString(),
        store: s.store,
        amount: Number(s.amount),
        linkKind: s.linkKind as string,
        visitId: v.id,
        visitAt: v.createdAt.toISOString(),
        clientName: `${v.name} ${v.lastName ?? ""}`.trim(),
        dni: v.dni,
        location: v.location,
        visitAmount: num(v.amount),
      }
    })
    .filter((x): x is InferredLink => x !== null)
    .sort((a, b) => a.soldAt.localeCompare(b.soldAt))

  const k = kindRows[0]
  return {
    month,
    from,
    to,
    timezone,
    summary: {
      visits: monthVisits.length,
      withSale,
      withoutSale: monthVisits.length - withSale,
      rate: monthVisits.length > 0 ? Math.round((withSale / monthVisits.length) * 1000) / 10 : null,
      byKind: {
        dni: Number(k?.dni ?? 0),
        inferredAmount: Number(k?.inferredAmount ?? 0),
        inferredTime: Number(k?.inferredTime ?? 0),
        manual: Number(k?.manual ?? 0),
      },
      guestUnlinked: Number(k?.guestUnlinked ?? 0),
      clientNoVisit: Number(k?.clientNoVisit ?? 0),
      suggestions,
    },
    unlinked,
    inferred,
  }
}

/**
 * "Enlazar" when one candidate has the stamp's amount within the hour and no
 * other candidate shares it; "Revisar" when something sits within the hour;
 * "No" otherwise (a service, a stamp without sale, a sale hours away).
 */
export function suggestionFor(candidates: CandidateSale[]): Suggestion {
  const near = candidates.filter((c) => Math.abs(c.minutes) * 60_000 <= SUGGEST_WINDOW_MS)
  const same = near.filter((c) => c.sameAmount)
  if (same.length === 1) return "link"
  if (near.length > 0) return "review"
  return "none"
}

export type LinkResult = { ok: true } | { ok: false; error: string }

/**
 * Links a sale to a stamp by hand. The sale must be free (or inferred: the
 * review overrides the guess), the stamp must not already own a sale, both
 * must belong to the tenant. The sale takes the stamp's client.
 */
export async function linkSaleToVisit(
  tenantId: string,
  saleId: string,
  visitId: string,
): Promise<LinkResult> {
  const [sale] = await db
    .select({ id: sales.id, visitId: sales.visitId, linkKind: sales.linkKind })
    .from(sales)
    .where(and(eq(sales.id, saleId), eq(sales.tenantId, tenantId), eq(sales.source, "pos")))
    .limit(1)
  if (!sale) return { ok: false, error: "Venta no encontrada" }
  if (sale.visitId && sale.linkKind === "manual" && sale.visitId !== visitId) {
    return { ok: false, error: "La venta ya está enlazada a mano a otro registro" }
  }
  if (sale.visitId && sale.linkKind === "dni") {
    return { ok: false, error: "La venta ya está enlazada por DNI a un registro" }
  }
  const [visit] = await db
    .select({ id: visits.id, clientId: visits.clientId })
    .from(visits)
    .where(and(eq(visits.id, visitId), eq(visits.tenantId, tenantId)))
    .limit(1)
  if (!visit) return { ok: false, error: "Registro no encontrado" }
  const [owner] = await db
    .select({ id: sales.id })
    .from(sales)
    .where(and(eq(sales.visitId, visitId), sql`${sales.id} <> ${saleId}`))
    .limit(1)
  if (owner) return { ok: false, error: "Ese registro ya tiene una venta enlazada" }
  await db
    .update(sales)
    .set({ visitId, linkKind: "manual", clientId: visit.clientId })
    .where(eq(sales.id, saleId))
  return { ok: true }
}

/**
 * Undoes a link (inferred or manual). A sale whose document matched a Cuik
 * client keeps that client; an inferred or hand-made one got the client from
 * the stamp and loses it.
 */
export async function unlinkSale(tenantId: string, saleId: string): Promise<LinkResult> {
  const [sale] = await db
    .select({ id: sales.id, visitId: sales.visitId, linkKind: sales.linkKind, dni: sales.dni })
    .from(sales)
    .where(and(eq(sales.id, saleId), eq(sales.tenantId, tenantId), eq(sales.source, "pos")))
    .limit(1)
  if (!sale) return { ok: false, error: "Venta no encontrada" }
  if (!sale.visitId) return { ok: false, error: "La venta no está enlazada" }
  if (sale.linkKind === "dni") {
    return { ok: false, error: "Un enlace por DNI no se quita a mano: el documento coincide" }
  }
  // The client is resolved again from the document typed at the till (none for a guest).
  await db.execute(sql`
    UPDATE analytics.sales s
    SET visit_id = NULL, link_kind = NULL,
        client_id = (SELECT c.id FROM loyalty.clients c
                     WHERE c.tenant_id = s.tenant_id AND s.dni IS NOT NULL AND c.status <> 'deleted'
                       AND regexp_replace(coalesce(c.dni, ''), '\\D', '', 'g') = s.dni
                     ORDER BY c.created_at LIMIT 1)
    WHERE s.id = ${saleId}::uuid`)
  return { ok: true }
}

/** Tenants with a POS connection, for the page's selector. */
export async function connectorTenants(): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(
      and(
        inArray(tenants.status, ["trial", "active"]),
        sql`exists (select 1 from analytics.pos_connections p where p.tenant_id = ${tenants.id})`,
      ),
    )
    .orderBy(tenants.name)
  return rows
}

