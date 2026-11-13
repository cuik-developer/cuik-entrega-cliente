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
import { brandOf, categoryKey, classifyLine } from "@/lib/growth/categories"
import { isPlaceholderName, normalizeDni, normalizePhone } from "@/lib/loyalty/impact/columns"
import { MAX_ORDER_AMOUNT } from "@/lib/loyalty/impact/parse"
import { loadMaster, type MasterEntry } from "./classify"
import { dayInTz, type InferredLink, inferGuestLinks, matchOrdersToVisits } from "./match"
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
import { CONNECTOR_SOURCES, CONNECTOR_SOURCES_SQL, POS_SOURCE, SALE_ORDER_SOURCE } from "./sources"

/**
 * The POS connector: pulls the merchant's Odoo POS orders (with their lines)
 * into analytics.sales / analytics.sale_lines, resolves the Cuik client by
 * DNI and pairs each order with the visit registered that day. After the
 * POS orders it pulls the confirmed sales orders of Odoo Ventas (`sale.order`:
 * e-commerce, phone, orders keyed in at a store), stored with
 * `source = 'sale_order'` and their own cursor (`cursor.saleOrders`).
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
  inferLinks: boolean
  inferWindowMinutes: number
  /** How the synced sales are linked so far (the value the connector adds). */
  links: LinkCounts
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

export type LinkCounts = {
  /** Synced sales in all. */
  total: number
  /** Linked by DNI, same day. */
  dni: number
  /** Guest sales paired with a visit by amount and time. */
  inferredAmount: number
  /** Guest sales paired with the only visit in the window. */
  inferredTime: number
  manual: number
  /** Guest sales (no DNI) still without a visit. */
  guestUnlinked: number
  /** Purchases of a Cuik client with no stamp that day. */
  clientNoVisit: number
  /** Of `total`, the confirmed sales orders of Odoo Ventas (not the till). */
  saleOrders: number
}

export type Cursor = {
  /** Odoo write_date ("YYYY-MM-DD HH:MM:SS", UTC) of the last order read. */
  writeDate: string
  id: number
  /** Orders already consumed whose write_date equals `writeDate` (same second). */
  offset: number
  /** The run that saved this cursor reached the end of the domain. */
  exhausted: boolean
  /** When the inferred pass last covered the whole history (after a backfill, or after turning it on). */
  inferredAt?: string
  /** Where the sales orders pull (`sale.order`) resumes; absent until its first run. */
  saleOrders?: SaleOrderCursor
}

/** The sales orders pull's own position, same paging rules as the POS one. */
export type SaleOrderCursor = {
  /** write_date of the last sales order read (UTC); the start instant while none was read. */
  writeDate: string
  id: number
  offset: number
  exhausted: boolean
  /** The Odoo has no Sales app (no `sale.order` model): nothing to pull. */
  unavailable?: boolean
}

/** Both pulls (POS orders and sales orders) have reached the end at least once. */
export function syncComplete(cursor: Cursor | null | undefined): boolean {
  return !!cursor?.exhausted && cursor.saleOrders?.exhausted === true
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
/** Confirmed sales orders ("done" is the locked state before Odoo 17). */
const SALE_ORDER_STATES = ["sale", "done"]
/** Read too, so an order cancelled after it was synced leaves analytics.sales. */
const SALE_ORDER_DEAD_STATES = ["cancel"]
/** Read once the history is in: an order cancelled and sent back to quotation between two runs. */
const QUOTATION_STATES = ["draft", "sent"]

function viewOf(row: typeof posConnections.$inferSelect, links: LinkCounts): PosConnectionView {
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
    inferLinks: row.inferLinks,
    inferWindowMinutes: row.inferWindowMinutes,
    links,
    cursor,
    backfilling: !syncComplete(cursor),
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
  return row ? viewOf(row, await linkCounts(tenantId)) : null
}

/** How the tenant's synced sales are linked, one grouped count. */
export async function linkCounts(tenantId: string): Promise<LinkCounts> {
  const [r] = await db
    .select({
      total: sql<number>`count(*) filter (where ${sales.amount} > 0)::int`,
      dni: sql<number>`count(*) filter (where ${sales.visitId} is not null and ${sales.linkKind} = 'dni')::int`,
      inferredAmount: sql<number>`count(*) filter (where ${sales.visitId} is not null and ${sales.linkKind} = 'inferred_amount')::int`,
      inferredTime: sql<number>`count(*) filter (where ${sales.visitId} is not null and ${sales.linkKind} = 'inferred_time')::int`,
      manual: sql<number>`count(*) filter (where ${sales.visitId} is not null and ${sales.linkKind} = 'manual')::int`,
      // Stamps missed at the till: an order placed online or by phone may never get one.
      guestUnlinked: sql<number>`count(*) filter (where ${sales.source} = ${POS_SOURCE} and ${sales.dni} is null and ${sales.visitId} is null and ${sales.amount} > 0)::int`,
      clientNoVisit: sql<number>`count(*) filter (where ${sales.source} = ${POS_SOURCE} and ${sales.clientId} is not null and ${sales.visitId} is null and ${sales.amount} > 0)::int`,
      saleOrders: sql<number>`count(*) filter (where ${sales.source} = ${SALE_ORDER_SOURCE} and ${sales.amount} > 0)::int`,
    })
    .from(sales)
    .where(and(eq(sales.tenantId, tenantId), inArray(sales.source, [...CONNECTOR_SOURCES])))
  return (
    r ?? {
      total: 0,
      dni: 0,
      inferredAmount: 0,
      inferredTime: 0,
      manual: 0,
      guestUnlinked: 0,
      clientNoVisit: 0,
      saleOrders: 0,
    }
  )
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
  inferLinks: boolean
  inferWindowMinutes: number
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
  // Turned on: the next complete run infers over the whole history. Turned off: no inferred link stays.
  const inferTurnedOn = !!existing && !existing.inferLinks && input.inferLinks
  const cursorWithoutInferredAt =
    inferTurnedOn && existing?.cursor ? { ...existing.cursor, inferredAt: undefined } : undefined
  const values = {
    provider: "odoo",
    baseUrl: input.baseUrl.trim().replace(/\/+$/, ""),
    database: input.database.trim(),
    login: input.login.trim(),
    startDate: input.startDate,
    enabled: input.enabled,
    retentionDays: input.retentionDays,
    excludedDnis: input.excludedDnis,
    inferLinks: input.inferLinks,
    inferWindowMinutes: input.inferWindowMinutes,
    updatedAt: new Date(),
    ...(input.apiKey !== undefined ? { apiKeyEnc: encrypt(input.apiKey) } : {}),
    ...(resetCursor ? { cursor: null, lastError: null } : {}),
    ...(cursorWithoutInferredAt ? { cursor: cursorWithoutInferredAt } : {}),
  }
  await db
    .insert(posConnections)
    .values({ ...values, tenantId: input.tenantId, createdBy: input.userId })
    .onConflictDoUpdate({ target: posConnections.tenantId, set: values })
  if (!input.inferLinks) await clearInferredLinks(input.tenantId)
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
      /** Confirmed sales orders (Odoo Ventas) since the start date; null when the Odoo has no Sales app. */
      saleOrdersSinceStart: number | null
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
  const startUtc = localMidnightUtc(startDate, timezone)
  const [ordersSinceStart, ordersLast30Days, saleOrdersSinceStart] = await Promise.all([
    client.searchCount("pos.order", [
      ["state", "in", ORDER_STATES],
      ["date_order", ">=", startUtc],
    ]),
    client.searchCount("pos.order", [
      ["state", "in", ORDER_STATES],
      ["date_order", ">=", since],
    ]),
    // An Odoo without the Sales app (or a user without access to it) is not a failed test.
    client
      .searchCount("sale.order", [
        ["state", "in", SALE_ORDER_STATES],
        ["date_order", ">=", startUtc],
      ])
      .catch((err) => {
        if (meansNoSales(err)) return null
        throw err
      }),
  ])
  return {
    kind: "ok",
    version,
    ordersSinceStart,
    ordersLast30Days,
    saleOrdersSinceStart,
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
  /** pos_sale: the sales order this line pays at the till. */
  sale_order_origin_id?: Many2one
}

/** A sales order of Odoo Ventas (`sale.order`), as read. */
export type OdooSaleOrder = {
  id: number
  /** "S09270". */
  name: string
  /** Confirmation instant once confirmed (Odoo moves it there on confirm). */
  date_order: string
  amount_total: number
  partner_id: Many2one
  /** Salesperson: at Mascota Veloz a store account ("Mascota Veloz Santa Cruz"). */
  user_id?: Many2one
  team_id?: Many2one
  state: string
  write_date: string
  order_line: number[]
}

/** A line of a sales order (`sale.order.line`), as read. */
export type OdooSaleLine = {
  id: number
  order_id: Many2one
  product_id: Many2one
  product_uom_qty: number
  price_unit: number
  discount: number
  /** Line total with taxes, after discount. */
  price_total: number
  /** "line_section" / "line_note": a heading or a note, not a product. */
  display_type?: string | false
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
  /** Guest sales (no DNI) paired with a visit by amount or time. */
  inferredVisits: number
  /** Orders left out for an impossible amount (above MAX_ORDER_AMOUNT). */
  skippedBadAmount: number
  /** File-loaded sales removed because the connector now owns their period (first run). */
  replacedFileSales: number
  /** Of `pulled`, the sales orders (Odoo Ventas) read. */
  saleOrders: number
  /** Sales orders removed: cancelled after they were synced, or settled at the till (the POS order counts). */
  removedSaleOrders: number
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

export type Prepared = {
  /** The order reference (unique per tenant): POS orders and sales orders alike. */
  ref: string
  row: typeof sales.$inferInsert
  lines: Omit<typeof saleLines.$inferInsert, "saleId">[]
}

function partnerDni(partner: OdooPartner | null | undefined, hasIdType: boolean): string | null {
  if (!partner) return null
  const idType = partner.l10n_latam_identification_type_id
    ? m2oName(partner.l10n_latam_identification_type_id)
    : null
  // A document typed as something else (RUC, passport) is not a person's document even if it has 8 digits.
  // DNI or carné de extranjería (the merchant's clients carry either); RUC and passports are not people here.
  const typeOk = !hasIdType || !idType || /dni|extranjer|^ce$/i.test(idType.trim())
  if (!typeOk || isPlaceholderName(partner.name ? String(partner.name) : null)) return null
  return normalizeDni(partner.vat || null)
}

export function lineRow(
  tenantId: string,
  l: OdooLine,
  product: OdooProduct | undefined,
  master: ReadonlyMap<string, MasterEntry>,
): Omit<typeof saleLines.$inferInsert, "saleId"> {
  const name = (l.full_product_name || product?.name || m2oName(l.product_id) || null) as
    | string
    | null
  const sku = normalizeSku(product?.default_code || null)
  const odooCategory = m2oName(product?.categ_id)?.slice(0, 200) ?? null
  const m = sku ? master.get(sku) : undefined
  const cls = classifyLine({
    odooCategory,
    masterCategory: m?.category,
    masterClass: m?.class,
    masterSubclass: m?.subclass,
    productName: name,
  })
  return {
    tenantId,
    posLineId: l.id,
    sku,
    productName: name?.slice(0, 200) ?? null,
    odooCategory,
    categoryKey: categoryKey(cls),
    brand: m?.brand ?? brandOf(name),
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
  master: ReadonlyMap<string, MasterEntry>
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
      return lineRow(
        params.tenantId,
        l,
        prodId ? params.productsById.get(prodId) : undefined,
        params.master,
      )
    })
    byRef.set(o.name, { ref: o.name, row, lines })
  }
  return { prepared: [...byRef.values()], badAmount }
}

/**
 * The store a sales order belongs to. Odoo Ventas has no till: the
 * salesperson stands for it (Mascota Veloz keys orders in under store
 * accounts, "Mascota Veloz Santa Cruz"), else the sales team. The merchant's
 * own name in front is dropped ("Santa Cruz"), since it would make the order
 * look like it belongs to every location named after the brand.
 */
export function saleOrderStore(
  salesperson: string | null,
  team: string | null,
  tenantName: string | null,
): string | null {
  for (const raw of [salesperson, team]) {
    const name = raw?.trim()
    if (!name) continue
    return (withoutPrefix(name, tenantName) || name).slice(0, 120)
  }
  return null
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/** Company-type words after a brand ("Mascota Veloz S.A.C."): not part of how a salesperson is named. */
const LEGAL_SUFFIX = /^(s|a|c|r|l|e|i|sac|saa|sa|srl|eirl|ltda|inc|llc|corp)$/

/** `name` without `prefix`'s words in front (accents and case ignored); "" when nothing is left. */
function withoutPrefix(name: string, prefix: string | null): string {
  const words0 = prefix
    ? fold(prefix)
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
    : []
  // Trailing legal words only ("S.A.C." -> s, a, c); a brand word stays even if short.
  let end = words0.length
  while (end > 1 && LEGAL_SUFFIX.test(words0[end - 1])) end--
  const want = words0.slice(0, end)
  if (want.length === 0) return name
  const words = [...name.matchAll(/[\p{L}\p{N}]+/gu)]
  if (words.length < want.length) return name
  for (let i = 0; i < want.length; i++) {
    if (fold(words[i][0]) !== want[i]) return name
  }
  const last = words[want.length - 1]
  return name
    .slice((last.index ?? 0) + last[0].length)
    .replace(/^[\s\-–—·:|/,.]+/, "")
    .trim()
}

/** A sales order line in the shape `lineRow` reads (the product's own name, not the line's free text). */
function saleLineAsPosLine(l: OdooSaleLine): OdooLine {
  return {
    id: l.id,
    order_id: l.order_id,
    product_id: l.product_id,
    qty: l.product_uom_qty,
    price_unit: l.price_unit,
    discount: l.discount,
    price_subtotal_incl: l.price_total,
  }
}

/**
 * Confirmed Odoo sales orders -> sales rows + lines, like `buildRows` for the
 * till: `source = 'sale_order'`, no POS order id (`pos_order_id` is the
 * pos.order id space; the reference "S09270" is the key), the store from the
 * salesperson or team, the date of the order (its confirmation) as the
 * instant of sale. Section and note lines are not products and are dropped.
 */
export function buildSaleOrderRows(params: {
  tenantId: string
  tenantName: string | null
  timezone: string
  orders: OdooSaleOrder[]
  partners: Map<number, OdooPartner>
  linesByOrder: Map<number, OdooSaleLine[]>
  productsById: Map<number, OdooProduct>
  importOf: (day: string) => string
  clientByDni: Map<string, ClientRef>
  hasIdType: boolean
  master: ReadonlyMap<string, MasterEntry>
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
    const salesperson = m2oName(o.user_id)
    const row: typeof sales.$inferInsert = {
      tenantId: params.tenantId,
      importId: params.importOf(day),
      orderRef: o.name,
      dni,
      customerName: partnerName && !placeholder ? partnerName.slice(0, 200) : null,
      phone: normalizePhone(partner?.mobile || partner?.phone || null),
      store: saleOrderStore(salesperson, m2oName(o.team_id), params.tenantName),
      cashier: salesperson?.slice(0, 120) ?? null,
      soldOn: day,
      amount: (Math.round(amount * 100) / 100).toFixed(2),
      source: SALE_ORDER_SOURCE,
      posOrderId: null,
      soldAt,
      clientId: clientOwning(dni, day, params.clientByDni),
    }
    const lines = (params.linesByOrder.get(o.id) ?? [])
      .filter((l) => !l.display_type && m2oId(l.product_id) !== null)
      .map((l) => {
        const prodId = m2oId(l.product_id) as number
        return lineRow(
          params.tenantId,
          saleLineAsPosLine(l),
          params.productsById.get(prodId),
          params.master,
        )
      })
    byRef.set(o.name, { ref: o.name, row, lines })
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
          // A hand-made link keeps its client; inferred ones are recomputed by the matcher.
          clientId: sql`CASE WHEN ${sales.linkKind} = 'manual' THEN ${sales.clientId} ELSE excluded.client_id END`,
        },
      })
      .returning({ id: sales.id, orderRef: sales.orderRef })
    // By reference: sales orders have no POS order id, and the reference is the upsert key anyway.
    const saleIdOf = new Map(inserted.map((r) => [r.orderRef as string, r.id]))
    const saleIds = inserted.map((r) => r.id)
    await tx.delete(saleLines).where(inArray(saleLines.saleId, saleIds))
    const lineRows = prepared.flatMap((p) => {
      const saleId = saleIdOf.get(p.ref)
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

/** Drops every inferred link of the tenant (the switch went off): the guest sales go back to being guests. */
export async function clearInferredLinks(tenantId: string): Promise<number> {
  const rows = await db
    .update(sales)
    .set({ visitId: null, linkKind: null, clientId: null })
    .where(
      and(
        eq(sales.tenantId, tenantId),
        inArray(sales.source, [...CONNECTOR_SOURCES]),
        inArray(sales.linkKind, ["inferred_amount", "inferred_time"]),
      ),
    )
    .returning({ id: sales.id })
  return rows.length
}

/** The inferred pass as configured on the connection. */
export type InferSettings = { enabled: boolean; windowMinutes: number; excludedDnis: string[] }

/**
 * Pairs the synced purchases of `fromDay..toDay` with the tenant's visits of
 * those days (same DNI, same local day, never another day), and gives a
 * client id to purchases synced minutes before their client registered that
 * same day. Refunds (negative amounts) never take a visit. Re-runs are safe:
 * the links of the range are recomputed in one statement; links made by
 * hand (`link_kind = 'manual'`) are left alone.
 *
 * With `infer.enabled`, a second pass pairs guest sales (no DNI) with the
 * visit stamped at the same store minutes later (see `inferGuestLinks`), and
 * those sales get the visit's client too.
 *
 * Sales orders (Odoo Ventas) take part in the exact pass (same DNI, same
 * day: ordered by phone, stamped at pick-up) and stand as rivals of the
 * inferred one, but never get an inferred link themselves: their time is the
 * confirmation, not a moment at the till, so a stamp minutes later proves
 * nothing. Those are confirmed by hand in Validación de enlaces.
 */
export async function matchVisitsInRange(
  tenantId: string,
  timezone: string,
  fromDay: string,
  toDay: string,
  infer: InferSettings = { enabled: false, windowMinutes: 0, excludedDnis: [] },
): Promise<{ exact: number; inferred: number }> {
  const notManual = sql`${sales.linkKind} IS DISTINCT FROM 'manual'`
  const inRange = and(
    eq(sales.tenantId, tenantId),
    inArray(sales.source, [...CONNECTOR_SOURCES]),
    gte(sales.soldOn, fromDay),
    lte(sales.soldOn, toDay),
    notManual,
  )
  // The race of the same day: the sale was synced at 15:05 and the client
  // registered at 15:10. Earlier purchases are never assigned to a client.
  await db.execute(sql`
    UPDATE analytics.sales s SET client_id = c.id
    FROM loyalty.clients c
    WHERE s.tenant_id = ${tenantId}::uuid AND s.source IN ${CONNECTOR_SOURCES_SQL} AND s.client_id IS NULL
      AND s.dni IS NOT NULL AND s.sold_on BETWEEN ${fromDay}::date AND ${toDay}::date
      AND c.tenant_id = s.tenant_id AND c.status <> 'deleted'
      AND regexp_replace(coalesce(c.dni, ''), '\\D', '', 'g') = s.dni
      AND (c.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date <= s.sold_on`)

  const sellable = and(inRange, isNotNull(sales.soldAt), sql`${sales.amount} > 0`)
  const orderRows = await db
    .select({
      id: sales.id,
      source: sales.source,
      dni: sales.dni,
      clientId: sales.clientId,
      soldAt: sales.soldAt,
      store: sales.store,
      amount: sales.amount,
    })
    .from(sales)
    .where(and(sellable, isNotNull(sales.dni)))
  // POS first (user rule): the till's sales take their stamps, then the
  // inferred pass, and only then do sales orders get the stamps left free.
  const posRows = orderRows.filter((o) => o.source !== SALE_ORDER_SOURCE)
  const saleOrderRows = orderRows.filter((o) => o.source === SALE_ORDER_SOURCE)
  const asMatchOrder = (o: (typeof orderRows)[number]) => ({
    id: o.id,
    dni: o.dni,
    soldAt: o.soldAt as Date,
    store: o.store,
    source: o.source,
  })
  // Visits of the same local days, with a day of slack on each side for the timezone.
  const fromUtc = new Date(`${fromDay}T00:00:00Z`)
  fromUtc.setUTCDate(fromUtc.getUTCDate() - 1)
  const toUtc = new Date(`${toDay}T00:00:00Z`)
  toUtc.setUTCDate(toUtc.getUTCDate() + 2)
  // A visit a hand-made link owns is not up for grabs.
  const notHeldByHand = sql`NOT EXISTS (
    SELECT 1 FROM analytics.sales m WHERE m.visit_id = ${visits.id} AND m.link_kind = 'manual')`
  const visitWindow = and(
    eq(visits.tenantId, tenantId),
    sql`${visits.source} <> 'bonus'`,
    gte(visits.createdAt, fromUtc),
    lte(visits.createdAt, toUtc),
    sql`${clients.status} <> 'deleted'`,
    notHeldByHand,
  )
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
          .where(and(visitWindow, isNotNull(clients.dni)))
  const matchVisits = visitRows.map((v) => ({
    id: v.id,
    dni: v.dni as string,
    createdAt: v.createdAt,
    location: v.location,
  }))
  const result = matchOrdersToVisits(posRows.map(asMatchOrder), matchVisits, timezone)
  const saleIds = [...result.pairs.keys()]
  const visitIds = saleIds.map((id) => result.pairs.get(id) as string)
  await db.transaction(async (tx) => {
    // Inferred rows got their client from the visit: without the visit there is no client.
    await tx
      .update(sales)
      .set({
        visitId: null,
        linkKind: null,
        clientId: sql`CASE WHEN ${sales.linkKind} IN ('inferred_amount', 'inferred_time') THEN NULL ELSE ${sales.clientId} END`,
      })
      .where(inRange)
    if (saleIds.length > 0) {
      // Arrays go as one '{a,b,c}' literal: drizzle would expand a JS array into a row.
      await tx.execute(sql`
        UPDATE analytics.sales s SET visit_id = v.visit_id, link_kind = 'dni'
        FROM (SELECT unnest(${uuidArrayLiteral(saleIds)}::uuid[]) AS sale_id,
                     unnest(${uuidArrayLiteral(visitIds)}::uuid[]) AS visit_id) v
        WHERE s.id = v.sale_id`)
    }
  })
  // Last: sales orders, on the stamps no till sale took (exactly or inferred).
  const linkSaleOrders = async (taken: Set<string>): Promise<number> => {
    if (saleOrderRows.length === 0) return 0
    const pairs = matchOrdersToVisits(
      saleOrderRows.map(asMatchOrder),
      matchVisits.filter((v) => !taken.has(v.id)),
      timezone,
    ).pairs
    if (pairs.size === 0) return 0
    const ids = [...pairs.keys()]
    await db.execute(sql`
      UPDATE analytics.sales s SET visit_id = v.visit_id, link_kind = 'dni'
      FROM (SELECT unnest(${uuidArrayLiteral(ids)}::uuid[]) AS sale_id,
                   unnest(${uuidArrayLiteral(ids.map((id) => pairs.get(id) as string))}::uuid[]) AS visit_id) v
      WHERE s.id = v.sale_id`)
    return pairs.size
  }
  if (!infer.enabled) {
    const bySaleOrder = await linkSaleOrders(new Set(visitIds))
    return { exact: result.pairs.size + bySaleOrder, inferred: 0 }
  }

  // Second pass: sales of no Cuik client (guests, and documents no client has:
  // a typo or a relative's DNI) and the visits nobody owns after the exact pass.
  // Till sales only: a sales order is never inferred (see above).
  const guestRows = await db
    .select({
      id: sales.id,
      dni: sales.dni,
      soldAt: sales.soldAt,
      store: sales.store,
      amount: sales.amount,
    })
    .from(sales)
    .where(
      and(
        sellable,
        eq(sales.source, POS_SOURCE),
        sql`${sales.clientId} IS NULL`,
        isNotNull(sales.store),
        sql`(${sales.dni} IS NULL OR NOT EXISTS (
          SELECT 1 FROM loyalty.clients k WHERE k.tenant_id = ${sales.tenantId}
            AND regexp_replace(coalesce(k.dni, ''), '\\D', '', 'g') = ${sales.dni}))`,
      ),
    )
  const freeRows =
    guestRows.length === 0
      ? []
      : await db
          .select({
            id: visits.id,
            clientId: visits.clientId,
            createdAt: visits.createdAt,
            location: locations.name,
            amount: visits.amount,
            dni: clients.dni,
          })
          .from(visits)
          .innerJoin(clients, eq(clients.id, visits.clientId))
          .leftJoin(locations, eq(locations.id, visits.locationId))
          .where(
            and(
              visitWindow,
              sql`NOT EXISTS (SELECT 1 FROM analytics.sales o WHERE o.visit_id = ${visits.id})`,
            ),
          )
  // Staff (excluded DNIs) never receive a guest sale; the corte leaves them out anyway.
  const excluded = new Set(infer.excludedDnis)
  const [storeNames, locationNames] =
    guestRows.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .selectDistinct({ store: sales.store })
            .from(sales)
            .where(
              // The till's stores: the map tells which location each one stands for.
              and(
                eq(sales.tenantId, tenantId),
                eq(sales.source, POS_SOURCE),
                isNotNull(sales.store),
              ),
            )
            .then((rows) => rows.map((r) => r.store as string)),
          db
            .select({ name: locations.name })
            .from(locations)
            .where(eq(locations.tenantId, tenantId))
            .then((rows) => rows.map((r) => r.name)),
        ])
  const inferred = inferGuestLinks(
    guestRows.map((g) => ({
      id: g.id,
      dni: g.dni,
      soldAt: g.soldAt as Date,
      store: g.store,
      amount: Number.parseFloat(g.amount),
    })),
    freeRows
      .filter((v) => !excluded.has((v.dni ?? "").replace(/\D/g, "")))
      .map((v) => ({
        id: v.id,
        clientId: v.clientId,
        createdAt: v.createdAt,
        location: v.location,
        amount: v.amount === null ? null : Number.parseFloat(v.amount),
      })),
    {
      windowMinutes: infer.windowMinutes,
      timezone,
      stores: storeNames,
      locations: locationNames,
      // A registered client's till purchase without a stamp may be the visit's
      // real purchase. Sales orders are no rivals: the till goes first.
      blockers: posRows
        .filter((o) => !result.pairs.has(o.id) && o.clientId !== null)
        .map((o) => ({
          soldAt: o.soldAt as Date,
          store: o.store,
          amount: Number.parseFloat(o.amount),
        })),
    },
  )
  if (inferred.size > 0) {
    const ids = [...inferred.keys()]
    const links = ids.map((id) => inferred.get(id) as InferredLink)
    await db.execute(sql`
      UPDATE analytics.sales s
      SET visit_id = v.visit_id, client_id = v.client_id, link_kind = v.kind
      FROM unnest(${uuidArrayLiteral(ids)}::uuid[],
                  ${uuidArrayLiteral(links.map((l) => l.visitId))}::uuid[],
                  ${uuidArrayLiteral(links.map((l) => l.clientId))}::uuid[],
                  ${textArrayLiteral(links.map((l) => l.kind))}::text[])
           AS v(sale_id, visit_id, client_id, kind)
      WHERE s.id = v.sale_id`)
  }
  const bySaleOrder = await linkSaleOrders(
    new Set([...visitIds, ...[...inferred.values()].map((l) => l.visitId)]),
  )
  return { exact: result.pairs.size + bySaleOrder, inferred: inferred.size }
}

import { textArrayLiteral, uuidArrayLiteral } from "./pg-arrays"

export { textArrayLiteral, uuidArrayLiteral }

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
  cursor: { writeDate: string; offset: number; exhausted: boolean } | null | undefined,
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
  /** The product master, loaded once per run (an upload mid-run reclassifies on its own). */
  master?: ReadonlyMap<string, MasterEntry>
  /** Strips the brand off a salesperson's name to get a sales order's store. */
  tenantName: string | null
  /** What to read of Odoo Ventas; null when the Odoo has none (or the user may not read it). */
  saleFields: SaleOrderFields | null
  /** The start date as an Odoo UTC datetime: nothing before it is synced. */
  startUtc: string
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
  await ensureProducts(
    ctx,
    lineRows.map((l) => m2oId(l.product_id)),
  )
  // Import rows per month exist before the write so import_id is known.
  const days = page.map((o) => dayInTz(parseOdooDateTime(o.date_order), ctx.timezone))
  for (const m of new Set(days.map(monthOf))) {
    ctx.touchedImports.add(await monthImportId(ctx.tenantId, m, ctx.importCache))
  }
  if (!ctx.master) ctx.master = await loadMaster(ctx.tenantId)
  const master = ctx.master
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
    master,
  })
  const upserted = await writePage(prepared)
  // Sales orders paid at this page's till (pos_sale): their row shrinks or goes.
  const paid = lineRows
    .map((l) => m2oId(l.sale_order_origin_id))
    .filter((id): id is number => id !== null)
  const soDays = await refreshPaidSaleOrders(ctx, paid)
  return { upserted, badAmount, days: [...days, ...soDays] }
}

/** Reads the products the run has not seen yet and keeps analytics.products up to date with them. */
async function ensureProducts(ctx: RunContext, ids: (number | null)[]) {
  const missing = [
    ...new Set(ids.filter((id): id is number => id !== null && !ctx.productCache.has(id))),
  ]
  if (missing.length === 0) return
  const fetched = await ctx.client.readMany<OdooProduct>("product.product", missing, [
    "id",
    "default_code",
    "name",
    "categ_id",
  ])
  for (const p of fetched) ctx.productCache.set(p.id, p)
  await upsertProducts(ctx.tenantId, fetched)
}

// --- Sales orders (Odoo Ventas) ---

/** What the sales orders pull reads from Odoo, decided once per run from the fields Odoo has. */
export type SaleOrderFields = {
  orderFieldList: string[]
  lineFieldList: string[]
  /** pos_sale is installed: a sales order can be paid at the till (pos.order.line.sale_order_origin_id). */
  settledAtTill: boolean
}

/**
 * True when Odoo's answer means "no Sales here for this user": the model
 * does not exist, or the user may not read it. Network trouble, an HTTP 5xx
 * or a broken reply are not that: they fail the run, so the pull resumes
 * where it was (and the corte keeps waiting) instead of being marked done.
 */
export function meansNoSales(err: unknown): boolean {
  if (!(err instanceof OdooError)) return false
  if (err.kind === "auth") return true
  return (
    err.kind === "server" &&
    /doesn'?t exist|does not exist|keyerror|^'sale\.order(\.line)?'$/i.test(err.message)
  )
}

/**
 * The fields to read, or null when the Odoo has no Sales app or the API user
 * cannot read it (then there is nothing to pull, and the POS sync goes on).
 */
async function saleOrderFields(client: OdooClient): Promise<SaleOrderFields | null> {
  try {
    const [orderFields, lineFields, posLineFields] = await Promise.all([
      client.fieldNames("sale.order"),
      client.fieldNames("sale.order.line"),
      client.fieldNames("pos.order.line"),
    ])
    if (orderFields.size === 0) return null
    // fields_get needs no read right: a user without access to Ventas only fails on a read.
    await client.searchCount("sale.order", [["id", "=", 0]])
    return {
      orderFieldList: [
        "id",
        "name",
        "date_order",
        "amount_total",
        "partner_id",
        "user_id",
        "state",
        "write_date",
        "order_line",
        ...(orderFields.has("team_id") ? ["team_id"] : []),
      ],
      lineFieldList: [
        "id",
        "order_id",
        "product_id",
        "product_uom_qty",
        "price_unit",
        "discount",
        "price_total",
        ...(lineFields.has("display_type") ? ["display_type"] : []),
      ],
      settledAtTill: posLineFields.has("sale_order_origin_id"),
    }
  } catch (err) {
    if (meansNoSales(err)) return null
    throw err
  }
}

/**
 * What becomes of a sales order: not confirmed (cancelled, back to
 * quotation) → out; paid at the till (pos_sale) → the POS order is that
 * purchase, so only the part paid elsewhere stays (a deposit paid online,
 * the rest at pick-up), and nothing when the till paid it all. Counting
 * both would count the purchase twice.
 */
export function saleOrderOutcome(
  order: Pick<OdooSaleOrder, "state" | "amount_total">,
  paidAtTill: number,
): { keep: false } | { keep: true; amount: number } {
  if (!SALE_ORDER_STATES.includes(order.state)) return { keep: false }
  const total = Number(order.amount_total) || 0
  if (!paidAtTill) return { keep: true, amount: total }
  const rest = Math.round((total - paidAtTill) * 100) / 100
  return rest > 0.5 ? { keep: true, amount: rest } : { keep: false }
}

/** Amount of each sales order paid at the till (pos_sale), from the lines of paid POS orders. */
async function paidAtTill(
  ctx: RunContext,
  fields: SaleOrderFields,
  ids: number[],
): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  if (!fields.settledAtTill || ids.length === 0) return out
  const rows = await ctx.client.searchRead<{
    sale_order_origin_id: Many2one
    price_subtotal_incl: number
  }>(
    "pos.order.line",
    [
      ["sale_order_origin_id", "in", ids],
      ["order_id.state", "in", ORDER_STATES],
    ],
    ["sale_order_origin_id", "price_subtotal_incl"],
  )
  for (const r of rows) {
    const id = m2oId(r.sale_order_origin_id)
    if (id !== null) out.set(id, (out.get(id) ?? 0) + (Number(r.price_subtotal_incl) || 0))
  }
  return out
}

/** The fields of a synced row that decide its links: a change means its day is matched again. */
type LinkFacts = { dni: string | null; amount: string; soldAt: number | null; store: string | null }

const factsOf = (r: {
  dni?: string | null
  amount?: string | null
  soldAt?: Date | null
  store?: string | null
}): LinkFacts => ({
  dni: r.dni ?? null,
  amount: Number(r.amount ?? 0).toFixed(2),
  soldAt: r.soldAt ? r.soldAt.getTime() : null,
  store: r.store ?? null,
})

/**
 * One page of sales orders: removes the ones that left (cancelled, back to
 * quotation, paid at the till) and writes the rest with their lines. Returns
 * the days whose links may change: rows new or changed in DNI, amount, time
 * or store, and removed rows (their stamp is free again). An old order
 * re-written by invoicing or delivery changes nothing and costs no rematch.
 */
async function processSaleOrderPage(
  ctx: RunContext,
  fields: SaleOrderFields,
  page: OdooSaleOrder[],
): Promise<{ upserted: number; removed: number; badAmount: number; days: string[] }> {
  const tillPaid = await paidAtTill(
    ctx,
    fields,
    page.filter((o) => SALE_ORDER_STATES.includes(o.state)).map((o) => o.id),
  )
  const keep: OdooSaleOrder[] = []
  const dropRefs: string[] = []
  for (const o of page) {
    const outcome = saleOrderOutcome(o, tillPaid.get(o.id) ?? 0)
    if (outcome.keep) keep.push({ ...o, amount_total: outcome.amount })
    else dropRefs.push(o.name)
  }
  const days = new Set<string>()
  let removed = 0
  if (dropRefs.length > 0) {
    const gone = await db
      .delete(sales)
      .where(
        and(
          eq(sales.tenantId, ctx.tenantId),
          eq(sales.source, SALE_ORDER_SOURCE),
          inArray(sales.orderRef, dropRefs),
        ),
      )
      .returning({ importId: sales.importId, soldOn: sales.soldOn })
    removed = gone.length
    for (const g of gone) {
      ctx.touchedImports.add(g.importId)
      days.add(String(g.soldOn))
    }
  }
  if (keep.length === 0) return { upserted: 0, removed, badAmount: 0, days: [...days] }

  const partnerIds = [
    ...new Set(keep.map((o) => m2oId(o.partner_id)).filter((id): id is number => id !== null)),
  ]
  const lineIds = keep.flatMap((o) => o.order_line ?? [])
  const [partnerRows, lineRows, before] = await Promise.all([
    partnerIds.length
      ? ctx.client.readMany<OdooPartner>("res.partner", partnerIds, ctx.partnerFieldList)
      : Promise.resolve([] as OdooPartner[]),
    lineIds.length
      ? ctx.client.readMany<OdooSaleLine>("sale.order.line", lineIds, fields.lineFieldList)
      : Promise.resolve([] as OdooSaleLine[]),
    db
      .select({
        orderRef: sales.orderRef,
        dni: sales.dni,
        amount: sales.amount,
        soldAt: sales.soldAt,
        store: sales.store,
        soldOn: sales.soldOn,
        source: sales.source,
      })
      .from(sales)
      .where(
        and(
          eq(sales.tenantId, ctx.tenantId),
          inArray(
            sales.orderRef,
            keep.map((o) => o.name),
          ),
        ),
      ),
  ])
  const partners = new Map(partnerRows.map((p) => [p.id, p]))
  const linesByOrder = new Map<number, OdooSaleLine[]>()
  for (const l of lineRows) {
    const oid = m2oId(l.order_id)
    if (oid === null) continue
    const list = linesByOrder.get(oid) ?? []
    list.push(l)
    linesByOrder.set(oid, list)
  }
  await ensureProducts(
    ctx,
    lineRows.map((l) => m2oId(l.product_id)),
  )
  for (const m of new Set(
    keep.map((o) => monthOf(dayInTz(parseOdooDateTime(o.date_order), ctx.timezone))),
  )) {
    ctx.touchedImports.add(await monthImportId(ctx.tenantId, m, ctx.importCache))
  }
  if (!ctx.master) ctx.master = await loadMaster(ctx.tenantId)
  const { prepared, badAmount } = buildSaleOrderRows({
    tenantId: ctx.tenantId,
    tenantName: ctx.tenantName,
    timezone: ctx.timezone,
    orders: keep,
    partners,
    linesByOrder,
    productsById: ctx.productCache,
    importOf: (day) => ctx.importCache.get(monthOf(day)) as string,
    clientByDni: ctx.clientByDni,
    hasIdType: ctx.hasIdType,
    master: ctx.master,
  })
  const prior = new Map(before.map((b) => [b.orderRef as string, b]))
  for (const p of prepared) {
    const b = prior.get(p.ref)
    const changed =
      !b ||
      b.source !== SALE_ORDER_SOURCE ||
      JSON.stringify(factsOf(b)) !== JSON.stringify(factsOf(p.row))
    if (changed) days.add(p.row.soldOn as string)
    // A row that moved to another day frees its stamp on the old one.
    if (b && String(b.soldOn) !== p.row.soldOn) days.add(String(b.soldOn))
  }
  const upserted = await writePage(prepared)
  return { upserted, removed, badAmount, days: [...days] }
}

/**
 * Sales orders a page of POS orders paid at the till (pos_sale): read again
 * right away, since the payment at the till does not always touch the sales
 * order's write_date and the sales orders pull would never see it.
 */
async function refreshPaidSaleOrders(ctx: RunContext, ids: number[]): Promise<string[]> {
  const fields = ctx.saleFields
  if (!fields || ids.length === 0) return []
  const orders = await ctx.client.searchRead<OdooSaleOrder>(
    "sale.order",
    [
      ["id", "in", [...new Set(ids)]],
      ["date_order", ">=", ctx.startUtc],
    ],
    fields.orderFieldList,
  )
  if (orders.length === 0) return []
  return (await processSaleOrderPage(ctx, fields, orders)).days
}

/**
 * Consecutive runs of days ("YYYY-MM-DD", any order), runs closer than
 * `maxGap` days merged, so a page whose orders sit on a few scattered days
 * is matched day by day instead of over everything in between; past
 * `maxRanges` runs, one range from the first to the last day.
 */
export function dayRanges(days: string[], maxGap = 3, maxRanges = 6): [string, string][] {
  const sorted = [...new Set(days)].sort()
  if (sorted.length === 0) return []
  const out: [string, string][] = []
  let from = sorted[0]
  let to = sorted[0]
  for (const d of sorted.slice(1)) {
    if (d <= addDays(to, maxGap)) to = d
    else {
      out.push([from, to])
      from = d
      to = d
    }
  }
  out.push([from, to])
  return out.length > maxRanges ? [[sorted[0], sorted[sorted.length - 1]]] : out
}

/** Re-matches the visits of the given days, range by range (see `dayRanges`). */
async function matchDays(ctx: RunContext, days: string[], infer: InferSettings) {
  for (const [from, to] of dayRanges(days)) {
    await matchVisitsInRange(ctx.tenantId, ctx.timezone, from, to, infer)
  }
}

/**
 * Pulls the sales orders after the POS orders, same paging as the POS pull
 * (write_date second + offset), from `previous` on. Cancelled orders are read
 * too, and once the history is in (incremental runs) quotations as well, so
 * an order cancelled or sent back to quotation after it was synced leaves
 * analytics.sales. Saves its cursor after every page through `save`.
 */
async function pullSaleOrders(p: {
  ctx: RunContext
  startUtc: string
  previous: SaleOrderCursor | undefined
  full: boolean
  budget: number
  infer: InferSettings
  save: (cursor: SaleOrderCursor) => Promise<void>
}): Promise<{
  pulled: number
  upserted: number
  removed: number
  badAmount: number
  exhausted: boolean
}> {
  const out = { pulled: 0, upserted: 0, removed: 0, badAmount: 0, exhausted: false }
  const fields = p.ctx.saleFields
  if (!fields) {
    // Re-checked every run: the merchant may install Ventas (or grant access) later.
    await p.save({
      writeDate: p.previous?.writeDate ?? p.startUtc,
      id: p.previous?.id ?? 0,
      offset: p.previous?.offset ?? 0,
      exhausted: true,
      unavailable: true,
    })
    out.exhausted = true
    return out
  }
  // A cursor written while Ventas was missing says nothing about where to resume.
  const previous = p.full || p.previous?.unavailable ? undefined : p.previous
  let point = startingPoint(previous, p.full)
  /** The cursor saved by this run's last page, if any. */
  let last: SaleOrderCursor | null = null
  // Quotations only once the history is in: a backfill has nothing to remove,
  // and every abandoned e-commerce cart is a quotation. The domain stays the
  // same for the whole backfill, so the offset inside a second stays valid.
  const incremental = !!previous?.exhausted
  const baseDomain: unknown[] = [
    [
      "state",
      "in",
      [...SALE_ORDER_STATES, ...SALE_ORDER_DEAD_STATES, ...(incremental ? QUOTATION_STATES : [])],
    ],
    ["date_order", ">=", p.startUtc],
  ]
  while (out.pulled < p.budget) {
    const domain = point.writeDate
      ? [...baseDomain, ["write_date", ">=", point.writeDate]]
      : baseDomain
    const page = await p.ctx.client.searchRead<OdooSaleOrder>(
      "sale.order",
      domain,
      fields.orderFieldList,
      { limit: PAGE, offset: point.offset, order: "write_date asc, id asc" },
    )
    if (page.length === 0) {
      out.exhausted = true
      // Nothing (more) to read: the last position stays (never the overlap's
      // earlier point, or the cursor would walk back two days every run).
      if (!last) {
        await p.save(
          previous
            ? { ...previous, exhausted: true }
            : { writeDate: p.startUtc, id: 0, offset: 0, exhausted: true },
        )
      }
      break
    }
    out.pulled += page.length
    const r = await processSaleOrderPage(p.ctx, fields, page)
    out.upserted += r.upserted
    out.removed += r.removed
    out.badAmount += r.badAmount
    // Before the cursor moves past them, like the POS pull.
    await matchDays(p.ctx, r.days, p.infer)
    const tail = page[page.length - 1]
    const sameSecond = page.filter((o) => o.write_date === tail.write_date).length
    const offset = point.writeDate === tail.write_date ? point.offset + sameSecond : sameSecond
    out.exhausted = page.length < PAGE
    point = { writeDate: tail.write_date, offset }
    last = { writeDate: tail.write_date, id: tail.id, offset, exhausted: out.exhausted }
    await p.save(last)
    if (out.exhausted) break
  }
  // A full last page followed by an empty one: the position read last is complete.
  if (out.exhausted && last && !last.exhausted) await p.save({ ...last, exhausted: true })
  return out
}

/**
 * The linking that closes a run. The first time the history is complete
 * (`cursor` given, no `inferredAt` yet), the inferred pass runs once over all
 * of it; otherwise only the last few days are re-matched, for visits
 * registered after their sale was synced. Returns the cursor to report.
 */
async function finishLinks(p: {
  tenantId: string
  timezone: string
  startDate: string
  today: string
  infer: InferSettings
  backfilling: boolean
  /** The exhausted cursor, or null when the run stopped early. */
  cursor: Cursor | null
}): Promise<Cursor | null> {
  if (p.cursor && p.infer.enabled && !p.cursor.inferredAt) {
    await matchVisitsInRange(p.tenantId, p.timezone, p.startDate, p.today, p.infer)
    const cursor = { ...p.cursor, inferredAt: new Date().toISOString() }
    await db.update(posConnections).set({ cursor }).where(eq(posConnections.tenantId, p.tenantId))
    return cursor
  }
  await matchVisitsInRange(p.tenantId, p.timezone, addDays(p.today, -REMATCH_DAYS), p.today, {
    ...p.infer,
    enabled: p.infer.enabled && !p.backfilling,
  })
  return p.cursor
}

/**
 * One run for one tenant. `full` restarts from the start date (the cursor
 * is dropped). Holds the tenant lock for the whole run.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one linear run (lock → fields → page loop with cursor → closing links → status) whose branches are the stop conditions; splitting it would scatter the cursor handling
export async function syncTenant(
  tenantId: string,
  opts: { full?: boolean; maxOrders?: number } = {},
): Promise<SyncResult> {
  const result: SyncResult = {
    tenantId,
    pulled: 0,
    upserted: 0,
    matchedVisits: 0,
    inferredVisits: 0,
    skippedBadAmount: 0,
    replacedFileSales: 0,
    saleOrders: 0,
    removedSaleOrders: 0,
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
    const [tenantRow] = await db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    const maxOrders = opts.maxOrders ?? MAX_ORDERS_PER_RUN
    const startDate = String(row.startDate)
    const previous: Cursor | null = opts.full ? null : ((row.cursor as Cursor | null) ?? null)
    result.cursor = previous
    const startUtc = localMidnightUtc(startDate, timezone)
    const infer: InferSettings = {
      enabled: row.inferLinks,
      windowMinutes: row.inferWindowMinutes,
      excludedDnis: Array.isArray(row.excludedDnis) ? (row.excludedDnis as string[]) : [],
    }
    // Half-synced days would make lone candidates look unambiguous: during the
    // backfill the inferred pass waits, and runs once over the whole history at the end.
    const backfilling = !previous || !previous.exhausted
    const inferredAt = previous?.inferredAt
    const linksBefore = await linkCounts(tenantId)

    await client.authenticate()
    const [orderFields, partnerFields, lineFields] = await Promise.all([
      client.fieldNames("pos.order"),
      client.fieldNames("res.partner"),
      client.fieldNames("pos.order.line"),
    ])
    const hasIdType = partnerFields.has("l10n_latam_identification_type_id")
    const saleFields = await saleOrderFields(client)
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
        ...(saleFields?.settledAtTill ? ["sale_order_origin_id"] : []),
      ],
      hasIdType,
      clientByDni: await loadClientsByDni(tenantId, timezone),
      productCache: new Map(),
      importCache: new Map(),
      touchedImports,
      tenantName: tenantRow?.name ?? null,
      saleFields,
      startUtc,
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
      await matchVisitsInRange(tenantId, timezone, sorted[0], sorted[sorted.length - 1], {
        ...infer,
        enabled: infer.enabled && !backfilling,
      })

      const last = page[page.length - 1]
      const sameSecond = page.filter((o) => o.write_date === last.write_date).length
      const offset = point.writeDate === last.write_date ? point.offset + sameSecond : sameSecond
      exhausted = page.length < PAGE
      cursor = {
        ...(inferredAt ? { inferredAt } : {}),
        // The sales orders pull keeps its own position while this one moves.
        ...(previous?.saleOrders ? { saleOrders: previous.saleOrders } : {}),
        writeDate: last.write_date,
        id: last.id,
        offset,
        exhausted,
      }
      point = { writeDate: last.write_date, offset }
      await db
        .update(posConnections)
        .set({ cursor, updatedAt: new Date() })
        .where(eq(posConnections.tenantId, tenantId))
      result.cursor = cursor
      if (exhausted) break
    }
    if (exhausted && cursor && !cursor.exhausted) {
      cursor = { ...cursor, exhausted: true }
      await db.update(posConnections).set({ cursor }).where(eq(posConnections.tenantId, tenantId))
      result.cursor = cursor
    }
    // No POS order since the start date at all: the pull is complete all the
    // same, and the sales orders' position needs a cursor to live in.
    if (exhausted && !cursor) {
      cursor = { writeDate: startUtc, id: 0, offset: 0, exhausted: true }
      await db.update(posConnections).set({ cursor }).where(eq(posConnections.tenantId, tenantId))
      result.cursor = cursor
    }

    // Then the sales orders (Odoo Ventas), with what is left of the run's budget.
    let saleOrdersDone = previous?.saleOrders?.exhausted === true
    if (exhausted && cursor && result.pulled < maxOrders) {
      const so = await pullSaleOrders({
        ctx,
        startUtc,
        previous: previous?.saleOrders,
        full: opts.full === true,
        budget: maxOrders - result.pulled,
        infer: { ...infer, enabled: infer.enabled && !backfilling },
        save: async (saleOrders) => {
          cursor = { ...(cursor as Cursor), saleOrders }
          await db
            .update(posConnections)
            .set({ cursor, updatedAt: new Date() })
            .where(eq(posConnections.tenantId, tenantId))
          result.cursor = cursor
        },
      })
      result.pulled += so.pulled
      result.saleOrders = so.pulled
      result.upserted += so.upserted
      result.removedSaleOrders = so.removed
      result.skippedBadAmount += so.badAmount
      saleOrdersDone = so.exhausted
    } else if (!exhausted) {
      saleOrdersDone = false
    }
    result.more = !exhausted || !saleOrdersDone
    result.cursor =
      (await finishLinks({
        tenantId,
        timezone,
        startDate,
        today,
        infer,
        backfilling,
        // The whole-history inferred pass waits for both pulls (sales orders are its rivals).
        cursor: exhausted && saleOrdersDone ? cursor : null,
      })) ?? result.cursor
    // What this run added, by counting before and after (ranges overlap, so pass totals would double up).
    const linksAfter = await linkCounts(tenantId)
    result.matchedVisits = Math.max(0, linksAfter.dni - linksBefore.dni)
    result.inferredVisits = Math.max(
      0,
      linksAfter.inferredAmount +
        linksAfter.inferredTime -
        linksBefore.inferredAmount -
        linksBefore.inferredTime,
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
