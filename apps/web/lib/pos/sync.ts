import {
  and,
  clients,
  db,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  locations,
  lte,
  posConnections,
  products,
  saleLines,
  sales,
  salesImports,
  sql,
  tenants,
  visits,
} from "@cuik/db"

import { decrypt, encrypt } from "@/lib/encryption"
import { isPlaceholderName, normalizeDni, normalizePhone } from "@/lib/loyalty/impact/columns"
import { MAX_ORDER_AMOUNT } from "@/lib/loyalty/impact/parse"
import { dayInTz, matchOrdersToVisits } from "./match"
import {
  type Many2one,
  m2oId,
  m2oName,
  OdooClient,
  OdooError,
  odooDateTime,
  parseOdooDateTime,
} from "./odoo-client"
import { normalizeSku } from "./product-master"

/**
 * The POS connector: pulls the merchant's Odoo POS orders (with their lines)
 * into analytics.sales / analytics.sale_lines, resolves the Cuik client by
 * DNI and pairs each order with the visit registered that day.
 *
 * Incremental by write_date. Pages are keyed by (write_date second, offset
 * inside that second), never by a global offset, so a cluster of orders with
 * the same write_date (a migration, a mass write) cannot make a run loop, and
 * an order modified mid-run only shifts the page when it sat in the boundary
 * second itself (rare; the two-day overlap of the next finished run picks it
 * up when its new write_date is recent). The cursor is saved after every
 * page; a run that did not reach the end resumes exactly where it stopped,
 * and a run that did reach the end restarts two days before its cursor to
 * catch late edits (refunds, reopened sessions).
 */

export type PosConnectionView = {
  provider: string
  baseUrl: string
  database: string
  login: string
  hasApiKey: boolean
  startDate: string
  enabled: boolean
  retentionDays: number
  excludedDnis: string[]
  cursor: Cursor | null
  /** True until the first pull from the start date has reached the end. */
  backfilling: boolean
  /** A run holds the lock right now. */
  syncing: boolean
  lastSyncAt: string | null
  lastSyncOrders: number | null
  lastError: string | null
  updatedAt: string
}

export type Cursor = {
  /** Odoo write_date ("YYYY-MM-DD HH:MM:SS", UTC) of the last order read. */
  writeDate: string
  id: number
  /** Orders already consumed whose write_date equals `writeDate` (same second). */
  offset: number
  /** The run that saved this cursor reached the end of the domain. */
  exhausted: boolean
}

/** Orders per Odoo request. */
const PAGE = 500
/** Orders per run (the cron runs every few minutes; a backfill takes several). */
export const MAX_ORDERS_PER_RUN = 20_000
/** Modified orders are re-read this far back from the cursor (refunds, late edits). */
const OVERLAP_MS = 2 * 24 * 3600 * 1000
/** Days re-matched with visits on every run (a visit may be registered after the sale was synced). */
const REMATCH_DAYS = 3
/** A lock older than this is a run that died; the next run takes over. */
const LOCK_STALE_MINUTES = 30
const ORDER_STATES = ["paid", "done", "invoiced"]

function viewOf(row: typeof posConnections.$inferSelect): PosConnectionView {
  const cursor = (row.cursor as Cursor | null) ?? null
  const excluded = Array.isArray(row.excludedDnis) ? (row.excludedDnis as string[]) : []
  return {
    provider: row.provider,
    baseUrl: row.baseUrl,
    database: row.database,
    login: row.login,
    hasApiKey: !!row.apiKeyEnc,
    startDate: String(row.startDate),
    enabled: row.enabled,
    retentionDays: row.retentionDays,
    excludedDnis: excluded,
    cursor,
    backfilling: !cursor || !cursor.exhausted,
    syncing: lockIsHeld(row.syncStartedAt),
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSyncOrders: row.lastSyncOrders,
    lastError: row.lastError,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function lockIsHeld(startedAt: Date | null): boolean {
  return !!startedAt && Date.now() - startedAt.getTime() < LOCK_STALE_MINUTES * 60_000
}

export async function getConnection(tenantId: string): Promise<PosConnectionView | null> {
  const [row] = await db
    .select()
    .from(posConnections)
    .where(eq(posConnections.tenantId, tenantId))
    .limit(1)
  return row ? viewOf(row) : null
}

/**
 * The connection that owns the tenant's sales from `startDate` on, enabled
 * or not: a paused connector still owns its period (a file must not replace
 * what the API wrote, because the cursor would never bring it back).
 */
export async function connectionOwning(tenantId: string): Promise<{ startDate: string } | null> {
  const [row] = await db
    .select({ startDate: posConnections.startDate })
    .from(posConnections)
    .where(eq(posConnections.tenantId, tenantId))
    .limit(1)
  return row ? { startDate: String(row.startDate) } : null
}

/** Last day covered by the tenant's file uploads, to suggest where the connector starts. */
export async function fileCoverageTo(tenantId: string): Promise<string | null> {
  const [row] = await db
    .select({ to: sql<string | null>`to_char(max(${salesImports.periodTo}), 'YYYY-MM-DD')` })
    .from(salesImports)
    .where(
      and(
        eq(salesImports.tenantId, tenantId),
        eq(salesImports.source, "file"),
        eq(salesImports.status, "ready"),
      ),
    )
  return row?.to ?? null
}

export type SaveConnectionInput = {
  tenantId: string
  baseUrl: string
  database: string
  login: string
  /** Undefined keeps the stored key; a string replaces it. */
  apiKey?: string
  startDate: string
  enabled: boolean
  retentionDays: number
  excludedDnis: string[]
  userId: string
}

/**
 * Creates or updates the tenant's connection. Changing the start date resets
 * the cursor (the next run backfills again). Refused while a run is going,
 * since the run would overwrite the cursor.
 */
export async function saveConnection(
  input: SaveConnectionInput,
): Promise<PosConnectionView | { error: string }> {
  const existing = await getConnection(input.tenantId)
  if (existing?.syncing) {
    return { error: "Hay una sincronización en curso; espera a que termine para guardar." }
  }
  const resetCursor = !existing || existing.startDate !== input.startDate
  const values = {
    provider: "odoo",
    baseUrl: input.baseUrl.trim().replace(/\/+$/, ""),
    database: input.database.trim(),
    login: input.login.trim(),
    startDate: input.startDate,
    enabled: input.enabled,
    retentionDays: input.retentionDays,
    excludedDnis: input.excludedDnis,
    updatedAt: new Date(),
    ...(input.apiKey !== undefined ? { apiKeyEnc: encrypt(input.apiKey) } : {}),
    ...(resetCursor ? { cursor: null, lastError: null } : {}),
  }
  await db
    .insert(posConnections)
    .values({ ...values, tenantId: input.tenantId, createdBy: input.userId })
    .onConflictDoUpdate({ target: posConnections.tenantId, set: values })
  return (await getConnection(input.tenantId)) as PosConnectionView
}

type Overrides = {
  baseUrl?: string
  database?: string
  login?: string
  apiKey?: string
  startDate?: string
}

/**
 * The Odoo client for a tenant: the stored connection, with the form's
 * values on top when testing. Before the first save there is no row, so a
 * test needs every value from the form.
 */
async function clientFor(
  tenantId: string,
  overrides: Overrides = {},
): Promise<{ client: OdooClient; row: typeof posConnections.$inferSelect | null }> {
  const [row] = await db
    .select()
    .from(posConnections)
    .where(eq(posConnections.tenantId, tenantId))
    .limit(1)
  const baseUrl = overrides.baseUrl ?? row?.baseUrl
  const database = overrides.database ?? row?.database
  const login = overrides.login ?? row?.login
  if (!baseUrl || database === undefined || !login) {
    throw new OdooError("Completa servidor, base de datos y usuario", "server")
  }
  const apiKey = overrides.apiKey ?? (row?.apiKeyEnc ? decrypt(row.apiKeyEnc) : null)
  if (!apiKey) throw new OdooError("Falta la API key", "auth")
  return { client: new OdooClient({ baseUrl, database, login, apiKey }), row: row ?? null }
}

async function tenantTimezone(tenantId: string): Promise<string> {
  const [t] = await db
    .select({ timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  return t?.timezone ?? "America/Lima"
}

export type TestResult =
  | {
      kind: "ok"
      version: string
      ordersSinceStart: number
      ordersLast30Days: number
      /** Optional Odoo fields found (pos_hr cashier, Peruvian document type). */
      hasEmployee: boolean
      hasIdType: boolean
    }
  | {
      /** No database given: the server was asked which ones it hosts. */
      kind: "databases"
      version: string
      databases: string[]
    }

/**
 * Logs in, reads the version and counts the orders the connector would pull.
 * `overrides` are the values typed in the form (not yet saved), so the test
 * checks what the operator is about to save. With an empty database it only
 * lists the databases the server hosts, so the operator can pick one.
 */
export async function testConnection(
  tenantId: string,
  overrides: Overrides = {},
): Promise<TestResult> {
  const { client, row } = await clientFor(tenantId, overrides)
  const timezone = await tenantTimezone(tenantId)
  const version = await client.version()
  if ((overrides.database ?? row?.database ?? "") === "") {
    return { kind: "databases", version, databases: await client.listDatabases() }
  }
  await client.authenticate()
  const [orderFields, partnerFields] = await Promise.all([
    client.fieldNames("pos.order"),
    client.fieldNames("res.partner"),
  ])
  const since = odooDateTime(new Date(Date.now() - 30 * 24 * 3600 * 1000))
  const startDate =
    overrides.startDate ?? (row ? String(row.startDate) : dayInTz(new Date(), timezone))
  const [ordersSinceStart, ordersLast30Days] = await Promise.all([
    client.searchCount("pos.order", [
      ["state", "in", ORDER_STATES],
      ["date_order", ">=", localMidnightUtc(startDate, timezone)],
    ]),
    client.searchCount("pos.order", [
      ["state", "in", ORDER_STATES],
      ["date_order", ">=", since],
    ]),
  ])
  return {
    kind: "ok",
    version,
    ordersSinceStart,
    ordersLast30Days,
    hasEmployee: orderFields.has("employee_id"),
    hasIdType: partnerFields.has("l10n_latam_identification_type_id"),
  }
}

// --- Pull ---

type OdooOrder = {
  id: number
  name: string
  date_order: string
  amount_total: number
  partner_id: Many2one
  config_id: Many2one
  user_id?: Many2one
  employee_id?: Many2one
  state: string
  write_date: string
  lines: number[]
}

type OdooLine = {
  id: number
  order_id: Many2one
  product_id: Many2one
  qty: number
  price_unit: number
  discount: number
  price_subtotal_incl: number
  full_product_name?: string | false
}

type OdooPartner = {
  id: number
  name: string | false
  vat: string | false
  phone?: string | false
  mobile?: string | false
  l10n_latam_identification_type_id?: Many2one
}

type OdooProduct = {
  id: number
  default_code: string | false
  name: string | false
  categ_id: Many2one
}

export type SyncResult = {
  tenantId: string
  pulled: number
  upserted: number
  matchedVisits: number
  /** Orders left out for an impossible amount (above MAX_ORDER_AMOUNT). */
  skippedBadAmount: number
  /** File-loaded sales removed because the connector now owns their period (first run). */
  replacedFileSales: number
  /** True when the run stopped at MAX_ORDERS_PER_RUN; the next run continues. */
  more: boolean
  cursor: Cursor | null
  error: string | null
}

/** "YYYY-MM-DD" local midnight as an Odoo UTC datetime string. */
export function localMidnightUtc(day: string, timezone: string): string {
  // UTC midnight shifted by the zone offset at that instant (Peru has no DST).
  const guess = new Date(`${day}T00:00:00Z`)
  const offsetMin = tzOffsetMinutes(guess, timezone)
  return odooDateTime(new Date(guess.getTime() - offsetMin * 60_000))
}

/** Minutes east of UTC for `timezone` at `at` (Lima = -300). */
function tzOffsetMinutes(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0")
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"))
  return Math.round((asUtc - at.getTime()) / 60_000)
}

function monthOf(day: string): string {
  return day.slice(0, 7)
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The sales_imports row that owns a synced month (created on first use; unique per tenant+month). */
async function monthImportId(tenantId: string, month: string, cache: Map<string, string>) {
  const hit = cache.get(month)
  if (hit) return hit
  const fileName = `Odoo · ${month}`
  const where = and(
    eq(salesImports.tenantId, tenantId),
    eq(salesImports.source, "pos"),
    eq(salesImports.fileName, fileName),
  )
  const [existing] = await db
    .select({ id: salesImports.id })
    .from(salesImports)
    .where(where)
    .limit(1)
  let id = existing?.id
  if (!id) {
    // Two runs racing for the same month: the unique index lets one win, the other re-selects.
    const [row] = await db
      .insert(salesImports)
      .values({
        tenantId,
        fileName,
        source: "pos",
        status: "ready",
        periodFrom: `${month}-01`,
        periodTo: `${month}-01`,
        processedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: salesImports.id })
    id = row?.id
    if (!id) {
      const [again] = await db
        .select({ id: salesImports.id })
        .from(salesImports)
        .where(where)
        .limit(1)
      id = again?.id
    }
    if (!id) throw new Error(`No se pudo crear la carga del mes ${month}`)
  }
  cache.set(month, id)
  return id
}

/** Refreshes the counters and period of the imports touched by a run; empty POS months are dropped. */
export async function refreshImports(tenantId: string, importIds: Iterable<string>) {
  for (const id of importIds) {
    await db.execute(sql`
      UPDATE analytics.sales_imports i SET
        period_from = s.from_day, period_to = s.to_day,
        rows_total = s.n, orders_total = s.n, orders_with_dni = s.with_dni, processed_at = now()
      FROM (
        SELECT min(sold_on) AS from_day, max(sold_on) AS to_day, count(*)::int AS n,
               count(dni)::int AS with_dni
        FROM analytics.sales WHERE import_id = ${id}::uuid
      ) s
      WHERE i.id = ${id}::uuid AND i.tenant_id = ${tenantId}::uuid`)
  }
  await db.execute(sql`
    DELETE FROM analytics.sales_imports i
    WHERE i.tenant_id = ${tenantId}::uuid AND i.source = 'pos'
      AND NOT EXISTS (SELECT 1 FROM analytics.sales s WHERE s.import_id = i.id)
      AND NOT EXISTS (SELECT 1 FROM analytics.impact_reports r WHERE r.import_id = i.id)`)
}

/**
 * First run: the connector takes over every day from `startDate`, so the
 * file-loaded sales of those days go (otherwise the same purchase would be
 * counted twice when the file's order reference is not Odoo's name). The
 * file imports keep their rows before the start date; their counters are
 * refreshed.
 */
async function replaceFileSales(tenantId: string, startDate: string): Promise<number> {
  const owned = and(
    eq(sales.tenantId, tenantId),
    eq(sales.source, "file"),
    gte(sales.soldOn, startDate),
  )
  const affected = await db.selectDistinct({ importId: sales.importId }).from(sales).where(owned)
  if (affected.length === 0) return 0
  const deleted = await db.delete(sales).where(owned).returning({ id: sales.id })
  await refreshImports(
    tenantId,
    affected.map((a) => a.importId),
  )
  return deleted.length
}

type Prepared = {
  order: OdooOrder
  row: typeof sales.$inferInsert
  lines: Omit<typeof saleLines.$inferInsert, "saleId">[]
}

function partnerDni(partner: OdooPartner | null | undefined, hasIdType: boolean): string | null {
  if (!partner) return null
  const idType = partner.l10n_latam_identification_type_id
    ? m2oName(partner.l10n_latam_identification_type_id)
    : null
  // A document typed as something else (RUC, CE, passport) is not a DNI even if it has 8 digits.
  const typeOk = !hasIdType || !idType || /dni/i.test(idType)
  if (!typeOk || isPlaceholderName(partner.name ? String(partner.name) : null)) return null
  return normalizeDni(partner.vat || null)
}

function lineRow(
  tenantId: string,
  l: OdooLine,
  product: OdooProduct | undefined,
): Omit<typeof saleLines.$inferInsert, "saleId"> {
  const name = (l.full_product_name || product?.name || m2oName(l.product_id) || null) as
    | string
    | null
  return {
    tenantId,
    posLineId: l.id,
    sku: normalizeSku(product?.default_code || null),
    productName: name?.slice(0, 200) ?? null,
    odooCategory: m2oName(product?.categ_id)?.slice(0, 200) ?? null,
    qty: String(Number(l.qty) || 0),
    unitPrice: (Number(l.price_unit) || 0).toFixed(2),
    discountPct: (Number(l.discount) || 0).toFixed(2),
    total: (Number(l.price_subtotal_incl) || 0).toFixed(2),
  }
}

/**
 * Odoo orders -> sales rows + lines. Orders above MAX_ORDER_AMOUNT are
 * skipped; two orders with the same name in one page keep the last one
 * (the unique index could not take both in one statement).
 */
function buildRows(params: {
  tenantId: string
  timezone: string
  orders: OdooOrder[]
  partners: Map<number, OdooPartner>
  linesByOrder: Map<number, OdooLine[]>
  productsById: Map<number, OdooProduct>
  importOf: (day: string) => string
  clientByDni: Map<string, ClientRef>
  hasIdType: boolean
}): { prepared: Prepared[]; badAmount: number } {
  const byRef = new Map<string, Prepared>()
  let badAmount = 0
  for (const o of params.orders) {
    const amount = Number(o.amount_total)
    if (!Number.isFinite(amount) || Math.abs(amount) > MAX_ORDER_AMOUNT) {
      badAmount++
      continue
    }
    const pid = m2oId(o.partner_id)
    const partner = pid ? params.partners.get(pid) : null
    const partnerName = partner?.name ? String(partner.name) : null
    const placeholder = isPlaceholderName(partnerName)
    const dni = partnerDni(partner, params.hasIdType)
    const soldAt = parseOdooDateTime(o.date_order)
    const day = dayInTz(soldAt, params.timezone)
    const cashier = m2oName(o.employee_id) ?? m2oName(o.user_id)
    const row: typeof sales.$inferInsert = {
      tenantId: params.tenantId,
      importId: params.importOf(day),
      orderRef: o.name,
      dni,
      customerName: partnerName && !placeholder ? partnerName.slice(0, 200) : null,
      phone: normalizePhone(partner?.mobile || partner?.phone || null),
      store: m2oName(o.config_id)?.slice(0, 120) ?? null,
      cashier: cashier?.slice(0, 120) ?? null,
      soldOn: day,
      amount: (Math.round(amount * 100) / 100).toFixed(2),
      source: "pos",
      posOrderId: o.id,
      soldAt,
      clientId: clientOwning(dni, day, params.clientByDni),
    }
    const lines = (params.linesByOrder.get(o.id) ?? []).map((l) => {
      const prodId = m2oId(l.product_id)
      return lineRow(params.tenantId, l, prodId ? params.productsById.get(prodId) : undefined)
    })
    byRef.set(o.name, { order: o, row, lines })
  }
  return { prepared: [...byRef.values()], badAmount }
}

/** Writes a page of prepared orders: sales upsert by order ref, lines replaced. */
async function writePage(prepared: Prepared[]): Promise<number> {
  if (prepared.length === 0) return 0
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(sales)
      .values(prepared.map((p) => p.row))
      .onConflictDoUpdate({
        target: [sales.tenantId, sales.orderRef],
        set: {
          importId: sql`excluded.import_id`,
          dni: sql`excluded.dni`,
          customerName: sql`excluded.customer_name`,
          phone: sql`excluded.phone`,
          store: sql`excluded.store`,
          cashier: sql`excluded.cashier`,
          soldOn: sql`excluded.sold_on`,
          amount: sql`excluded.amount`,
          source: sql`excluded.source`,
          posOrderId: sql`excluded.pos_order_id`,
          soldAt: sql`excluded.sold_at`,
          clientId: sql`excluded.client_id`,
        },
      })
      .returning({ id: sales.id, posOrderId: sales.posOrderId })
    const saleIdOf = new Map(inserted.map((r) => [r.posOrderId as number, r.id]))
    const saleIds = inserted.map((r) => r.id)
    await tx.delete(saleLines).where(inArray(saleLines.saleId, saleIds))
    const lineRows = prepared.flatMap((p) => {
      const saleId = saleIdOf.get(p.order.id)
      return saleId ? p.lines.map((l) => ({ ...l, saleId })) : []
    })
    for (let i = 0; i < lineRows.length; i += 1000) {
      await tx.insert(saleLines).values(lineRows.slice(i, i + 1000))
    }
    return inserted.length
  })
}

/** Keeps analytics.products aware of every SKU the POS sells (name and Odoo category only). */
async function upsertProducts(tenantId: string, odooProducts: Iterable<OdooProduct>) {
  const rows: (typeof products.$inferInsert)[] = []
  const seen = new Set<string>()
  for (const p of odooProducts) {
    const sku = normalizeSku(p.default_code || null)
    if (!sku || seen.has(sku)) continue
    seen.add(sku)
    rows.push({
      tenantId,
      sku,
      name: p.name ? String(p.name).slice(0, 200) : null,
      odooCategory: m2oName(p.categ_id)?.slice(0, 200) ?? null,
    })
  }
  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(products)
      .values(rows.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [products.tenantId, products.sku],
        set: {
          // The master's name wins when it has one; the POS category is always refreshed.
          name: sql`coalesce(${products.name}, excluded.name)`,
          odooCategory: sql`excluded.odoo_category`,
          updatedAt: new Date(),
        },
      })
  }
}

/** A Cuik client as the sync needs it: id and the tenant-local day it registered. */
export type ClientRef = { id: string; registeredOn: string }

/**
 * DNI -> client for the tenant (one per DNI; the newest wins on duplicates).
 * `registeredOn` decides whether a purchase belongs to the client: only
 * purchases made on or after the registration day do (see `clientFor`).
 */
async function loadClientsByDni(
  tenantId: string,
  timezone: string,
): Promise<Map<string, ClientRef>> {
  const rows = await db
    .select({
      id: clients.id,
      dni: clients.dni,
      registeredOn: sql<string>`to_char(${clients.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD')`,
    })
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), sql`${clients.status} <> 'deleted'`))
    .orderBy(clients.createdAt)
  const map = new Map<string, ClientRef>()
  for (const r of rows) {
    const dni = normalizeDni(r.dni)
    if (dni) map.set(dni, { id: r.id, registeredOn: r.registeredOn })
  }
  return map
}

/**
 * The client a purchase belongs to: the one with that DNI, and only when it
 * was already registered that day. A purchase made before the client joined
 * Cuik stays a DNI-only row (user rule: the connector never rewrites the
 * history of a registration; such purchases may be linked by hand later).
 */
export function clientOwning(
  dni: string | null,
  day: string,
  clientByDni: Map<string, ClientRef>,
): string | null {
  if (!dni) return null
  const c = clientByDni.get(dni)
  return c && c.registeredOn <= day ? c.id : null
}

/**
 * Pairs the synced purchases of `fromDay..toDay` with the tenant's visits of
 * those days (same DNI, same local day, never another day), and gives a
 * client id to purchases synced minutes before their client registered that
 * same day. Refunds (negative amounts) never take a visit. Re-runs are safe:
 * the links of the range are recomputed in one statement.
 */
export async function matchVisitsInRange(
  tenantId: string,
  timezone: string,
  fromDay: string,
  toDay: string,
): Promise<number> {
  const inRange = and(
    eq(sales.tenantId, tenantId),
    eq(sales.source, "pos"),
    gte(sales.soldOn, fromDay),
    lte(sales.soldOn, toDay),
  )
  // The race of the same day: the sale was synced at 15:05 and the client
  // registered at 15:10. Earlier purchases are never assigned to a client.
  await db.execute(sql`
    UPDATE analytics.sales s SET client_id = c.id
    FROM loyalty.clients c
    WHERE s.tenant_id = ${tenantId}::uuid AND s.source = 'pos' AND s.client_id IS NULL
      AND s.dni IS NOT NULL AND s.sold_on BETWEEN ${fromDay}::date AND ${toDay}::date
      AND c.tenant_id = s.tenant_id AND c.status <> 'deleted'
      AND regexp_replace(coalesce(c.dni, ''), '\\D', '', 'g') = s.dni
      AND (c.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date <= s.sold_on`)

  const orderRows = await db
    .select({ id: sales.id, dni: sales.dni, soldAt: sales.soldAt, store: sales.store })
    .from(sales)
    .where(and(inRange, isNotNull(sales.dni), isNotNull(sales.soldAt), sql`${sales.amount} > 0`))
  // Visits of the same local days, with a day of slack on each side for the timezone.
  const fromUtc = new Date(`${fromDay}T00:00:00Z`)
  fromUtc.setUTCDate(fromUtc.getUTCDate() - 1)
  const toUtc = new Date(`${toDay}T00:00:00Z`)
  toUtc.setUTCDate(toUtc.getUTCDate() + 2)
  const visitRows =
    orderRows.length === 0
      ? []
      : await db
          .select({
            id: visits.id,
            dni: clients.dni,
            createdAt: visits.createdAt,
            location: locations.name,
          })
          .from(visits)
          .innerJoin(clients, eq(clients.id, visits.clientId))
          .leftJoin(locations, eq(locations.id, visits.locationId))
          .where(
            and(
              eq(visits.tenantId, tenantId),
              sql`${visits.source} <> 'bonus'`,
              gte(visits.createdAt, fromUtc),
              lte(visits.createdAt, toUtc),
              isNotNull(clients.dni),
            ),
          )
  const result = matchOrdersToVisits(
    orderRows.map((o) => ({ id: o.id, dni: o.dni, soldAt: o.soldAt as Date, store: o.store })),
    visitRows.map((v) => ({
      id: v.id,
      dni: v.dni as string,
      createdAt: v.createdAt,
      location: v.location,
    })),
    timezone,
  )
  const saleIds = [...result.pairs.keys()]
  const visitIds = saleIds.map((id) => result.pairs.get(id) as string)
  await db.transaction(async (tx) => {
    await tx.update(sales).set({ visitId: null }).where(inRange)
    if (saleIds.length > 0) {
      // Arrays go as one '{a,b,c}' literal: drizzle would expand a JS array into a row.
      await tx.execute(sql`
        UPDATE analytics.sales s SET visit_id = v.visit_id
        FROM (SELECT unnest(${uuidArrayLiteral(saleIds)}::uuid[]) AS sale_id,
                     unnest(${uuidArrayLiteral(visitIds)}::uuid[]) AS visit_id) v
        WHERE s.id = v.sale_id`)
    }
  })
  return result.pairs.size
}

/** UUIDs as a Postgres array literal ("{a,b}"), the shape a `uuid[]` parameter needs. */
export function uuidArrayLiteral(ids: string[]): string {
  return `{${ids.join(",")}}`
}

/**
 * Takes the per-tenant lock. Returns the token this run must present to
 * release it (so a run that outlived the stale window cannot clear the lock
 * of the run that took over), or null when another run holds it.
 */
async function acquireLock(tenantId: string): Promise<Date | null> {
  const token = new Date()
  const rows = await db
    .update(posConnections)
    .set({ syncStartedAt: token })
    .where(
      and(
        eq(posConnections.tenantId, tenantId),
        sql`(${posConnections.syncStartedAt} IS NULL OR ${posConnections.syncStartedAt} < now() - make_interval(mins => ${LOCK_STALE_MINUTES}))`,
      ),
    )
    .returning({ id: posConnections.id })
  return rows.length > 0 ? token : null
}

async function releaseLock(tenantId: string, token: Date) {
  await db
    .update(posConnections)
    .set({ syncStartedAt: null })
    .where(and(eq(posConnections.tenantId, tenantId), eq(posConnections.syncStartedAt, token)))
    .catch((err) => console.error("[pos-sync] release lock failed", tenantId, err))
}

/** Where this run starts reading: a fresh backfill, an exact resume, or two days before a finished cursor. */
function startingPoint(
  cursor: Cursor | null,
  full: boolean,
): { writeDate: string | null; offset: number } {
  if (full || !cursor) return { writeDate: null, offset: 0 }
  if (!cursor.exhausted) return { writeDate: cursor.writeDate, offset: cursor.offset }
  const back = new Date(parseOdooDateTime(cursor.writeDate).getTime() - OVERLAP_MS)
  return { writeDate: odooDateTime(back), offset: 0 }
}

type RunContext = {
  tenantId: string
  timezone: string
  client: OdooClient
  orderFieldList: string[]
  partnerFieldList: string[]
  lineFieldList: string[]
  hasIdType: boolean
  clientByDni: Map<string, ClientRef>
  productCache: Map<number, OdooProduct>
  importCache: Map<string, string>
  touchedImports: Set<string>
}

/** Reads the partners, lines and products of a page and writes it; returns the days it touched. */
async function processPage(
  ctx: RunContext,
  page: OdooOrder[],
): Promise<{ upserted: number; badAmount: number; days: string[] }> {
  const partnerIds = [
    ...new Set(page.map((o) => m2oId(o.partner_id)).filter((id): id is number => id !== null)),
  ]
  const lineIds = page.flatMap((o) => o.lines ?? [])
  const [partnerRows, lineRows] = await Promise.all([
    partnerIds.length
      ? ctx.client.readMany<OdooPartner>("res.partner", partnerIds, ctx.partnerFieldList)
      : Promise.resolve([] as OdooPartner[]),
    lineIds.length
      ? ctx.client.readMany<OdooLine>("pos.order.line", lineIds, ctx.lineFieldList)
      : Promise.resolve([] as OdooLine[]),
  ])
  const partners = new Map(partnerRows.map((p) => [p.id, p]))
  const linesByOrder = new Map<number, OdooLine[]>()
  for (const l of lineRows) {
    const oid = m2oId(l.order_id)
    if (oid === null) continue
    const list = linesByOrder.get(oid) ?? []
    list.push(l)
    linesByOrder.set(oid, list)
  }
  const missingProducts = [
    ...new Set(
      lineRows
        .map((l) => m2oId(l.product_id))
        .filter((id): id is number => id !== null && !ctx.productCache.has(id)),
    ),
  ]
  if (missingProducts.length) {
    const fetched = await ctx.client.readMany<OdooProduct>("product.product", missingProducts, [
      "id",
      "default_code",
      "name",
      "categ_id",
    ])
    for (const p of fetched) ctx.productCache.set(p.id, p)
    await upsertProducts(ctx.tenantId, fetched)
  }
  // Import rows per month exist before the write so import_id is known.
  const days = page.map((o) => dayInTz(parseOdooDateTime(o.date_order), ctx.timezone))
  for (const m of new Set(days.map(monthOf))) {
    ctx.touchedImports.add(await monthImportId(ctx.tenantId, m, ctx.importCache))
  }
  const { prepared, badAmount } = buildRows({
    tenantId: ctx.tenantId,
    timezone: ctx.timezone,
    orders: page,
    partners,
    linesByOrder,
    productsById: ctx.productCache,
    importOf: (day) => ctx.importCache.get(monthOf(day)) as string,
    clientByDni: ctx.clientByDni,
    hasIdType: ctx.hasIdType,
  })
  const upserted = await writePage(prepared)
  return { upserted, badAmount, days }
}

/**
 * One run for one tenant. `full` restarts from the start date (the cursor
 * is dropped). Holds the tenant lock for the whole run.
 */
export async function syncTenant(
  tenantId: string,
  opts: { full?: boolean; maxOrders?: number } = {},
): Promise<SyncResult> {
  const result: SyncResult = {
    tenantId,
    pulled: 0,
    upserted: 0,
    matchedVisits: 0,
    skippedBadAmount: 0,
    replacedFileSales: 0,
    more: false,
    cursor: null,
    error: null,
  }
  const lock = await acquireLock(tenantId)
  if (!lock) {
    result.error = "Ya hay una sincronización en curso"
    return result
  }
  const touchedImports = new Set<string>()
  try {
    const { client, row } = await clientFor(tenantId)
    if (!row) throw new OdooError("El comercio no tiene conector configurado", "server")
    const timezone = await tenantTimezone(tenantId)
    const maxOrders = opts.maxOrders ?? MAX_ORDERS_PER_RUN
    const startDate = String(row.startDate)
    const previous: Cursor | null = opts.full ? null : ((row.cursor as Cursor | null) ?? null)
    result.cursor = previous
    const startUtc = localMidnightUtc(startDate, timezone)

    await client.authenticate()
    const [orderFields, partnerFields, lineFields] = await Promise.all([
      client.fieldNames("pos.order"),
      client.fieldNames("res.partner"),
      client.fieldNames("pos.order.line"),
    ])
    const hasIdType = partnerFields.has("l10n_latam_identification_type_id")
    const ctx: RunContext = {
      tenantId,
      timezone,
      client,
      orderFieldList: [
        "id",
        "name",
        "date_order",
        "amount_total",
        "partner_id",
        "config_id",
        "user_id",
        "state",
        "write_date",
        "lines",
        ...(orderFields.has("employee_id") ? ["employee_id"] : []),
      ],
      partnerFieldList: [
        "id",
        "name",
        "vat",
        "phone",
        // Odoo 18 folded mobile into phone.
        ...(partnerFields.has("mobile") ? ["mobile"] : []),
        ...(hasIdType ? ["l10n_latam_identification_type_id"] : []),
      ],
      lineFieldList: [
        "id",
        "order_id",
        "product_id",
        "qty",
        "price_unit",
        "discount",
        "price_subtotal_incl",
        ...(lineFields.has("full_product_name") ? ["full_product_name"] : []),
      ],
      hasIdType,
      clientByDni: await loadClientsByDni(tenantId, timezone),
      productCache: new Map(),
      importCache: new Map(),
      touchedImports,
    }

    // A fresh backfill takes over the period from the file uploads.
    if (!previous) result.replacedFileSales = await replaceFileSales(tenantId, startDate)

    let point = startingPoint(previous, opts.full === true)
    let cursor: Cursor | null = previous
    const baseDomain: unknown[] = [
      ["state", "in", ORDER_STATES],
      ["date_order", ">=", startUtc],
    ]
    let exhausted = false
    const today = dayInTz(new Date(), timezone)
    while (result.pulled < maxOrders) {
      const domain = point.writeDate
        ? [...baseDomain, ["write_date", ">=", point.writeDate]]
        : baseDomain
      const page = await client.searchRead<OdooOrder>("pos.order", domain, ctx.orderFieldList, {
        limit: PAGE,
        offset: point.offset,
        order: "write_date asc, id asc",
      })
      if (page.length === 0) {
        exhausted = true
        break
      }
      result.pulled += page.length
      const { upserted, badAmount, days } = await processPage(ctx, page)
      result.upserted += upserted
      result.skippedBadAmount += badAmount

      // Visits of the days this page touched, before the cursor moves past them
      // (only those days: the last-days rematch below covers late visits).
      const sorted = [...days].sort()
      result.matchedVisits += await matchVisitsInRange(
        tenantId,
        timezone,
        sorted[0],
        sorted[sorted.length - 1],
      )

      const last = page[page.length - 1]
      const sameSecond = page.filter((o) => o.write_date === last.write_date).length
      const offset = point.writeDate === last.write_date ? point.offset + sameSecond : sameSecond
      exhausted = page.length < PAGE
      cursor = { writeDate: last.write_date, id: last.id, offset, exhausted }
      point = { writeDate: last.write_date, offset }
      await db
        .update(posConnections)
        .set({ cursor, updatedAt: new Date() })
        .where(eq(posConnections.tenantId, tenantId))
      result.cursor = cursor
      if (exhausted) break
    }
    result.more = !exhausted
    if (exhausted && cursor && !cursor.exhausted) {
      cursor = { ...cursor, exhausted: true }
      await db.update(posConnections).set({ cursor }).where(eq(posConnections.tenantId, tenantId))
      result.cursor = cursor
    }

    // Visits registered after their sale was synced (the last few days).
    result.matchedVisits += await matchVisitsInRange(
      tenantId,
      timezone,
      addDays(today, -REMATCH_DAYS),
      today,
    )
    await refreshImports(tenantId, touchedImports)
    await db
      .update(posConnections)
      .set({
        lastSyncAt: new Date(),
        lastSyncOrders: result.pulled,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(posConnections.tenantId, tenantId))
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error de sincronización"
    console.error("[pos-sync] tenant", tenantId, err)
    result.error = message
    await db
      .update(posConnections)
      .set({ lastSyncAt: new Date(), lastError: message.slice(0, 500), updatedAt: new Date() })
      .where(eq(posConnections.tenantId, tenantId))
      .catch((e) => console.error("[pos-sync] could not record the error", tenantId, e))
    await refreshImports(tenantId, touchedImports).catch(() => {})
  } finally {
    await releaseLock(tenantId, lock)
  }
  return result
}

/** Every enabled connection, the longest-waiting first, one after the other (Odoo instances are not ours to flood). */
export async function syncAllEnabled(opts: { maxOrders?: number } = {}): Promise<SyncResult[]> {
  const rows = await db
    .select({ tenantId: posConnections.tenantId })
    .from(posConnections)
    .innerJoin(tenants, eq(tenants.id, posConnections.tenantId))
    .where(and(eq(posConnections.enabled, true), sql`${tenants.status} IN ('active', 'trial')`))
    .orderBy(sql`${posConnections.lastSyncAt} ASC NULLS FIRST`)
  const out: SyncResult[] = []
  for (const r of rows) out.push(await syncTenant(r.tenantId, opts))
  return out
}

/** The synced months of a tenant (import id per "YYYY-MM"), newest first. */
export async function syncedMonths(
  tenantId: string,
): Promise<{ month: string; importId: string }[]> {
  const rows = await db
    .select({ id: salesImports.id, fileName: salesImports.fileName })
    .from(salesImports)
    .where(and(eq(salesImports.tenantId, tenantId), eq(salesImports.source, "pos")))
    .orderBy(desc(salesImports.fileName))
  return rows.map((r) => ({ month: r.fileName.replace("Odoo · ", ""), importId: r.id }))
}

/** Enabled connectors that need a human: an error, or no successful run for hours. */
export async function connectorsNeedingAttention(): Promise<
  { tenantId: string; tenantName: string; lastError: string | null; lastSyncAt: string | null }[]
> {
  const rows = await db
    .select({
      tenantId: posConnections.tenantId,
      tenantName: tenants.name,
      lastError: posConnections.lastError,
      lastSyncAt: posConnections.lastSyncAt,
    })
    .from(posConnections)
    .innerJoin(tenants, eq(tenants.id, posConnections.tenantId))
    .where(
      and(
        eq(posConnections.enabled, true),
        sql`${tenants.status} IN ('active', 'trial')`,
        sql`(${posConnections.lastError} IS NOT NULL OR ${posConnections.lastSyncAt} IS NULL OR ${posConnections.lastSyncAt} < now() - interval '3 hours')`,
      ),
    )
  return rows.map((r) => ({
    tenantId: r.tenantId,
    tenantName: r.tenantName,
    lastError: r.lastError,
    lastSyncAt: r.lastSyncAt?.toISOString() ?? null,
  }))
}
