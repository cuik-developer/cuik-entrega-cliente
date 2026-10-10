import { db, sql } from "@cuik/db"
import ExcelJS from "exceljs"
import { formatDateForExport } from "@/lib/format-date"
import {
  computeClientSegment,
  SEGMENT_LABELS,
  type SegmentationThresholds,
} from "@/lib/loyalty/client-segments"
import {
  ALL_TIME,
  type ClientStatusFilter,
  columnsFor,
  type DatasetDef,
  datasetByKey,
  type ProgramType,
  resolveAllTimeRange,
  type TenantStartFacts,
} from "./dataset-columns"

/**
 * Builds the Excel file of the "Exportar datos" page: one dataset, the
 * columns the user picked, in their order. Every dataset is one SQL query
 * per tenant; values are formatted in the tenant's timezone.
 */

export type DatasetRequest = {
  tenantId: string
  dataset: string
  /** Column keys in the order they should appear; unknown keys are ignored. */
  columns: string[]
  /** YYYY-MM-DD, inclusive, tenant-local (visits and points only). */
  from?: string
  to?: string
  /** The range came from the "Acumulado" preset (labels the file; the dates are already resolved). */
  allTime?: boolean
  clientStatus?: ClientStatusFilter
  timezone: string
  thresholds: SegmentationThresholds
  /** Active program of the tenant; limits datasets and columns. */
  program: ProgramType | null
}

/** Type of the tenant's active promotion (newest wins when several are active). */
export async function activeProgramType(tenantId: string): Promise<ProgramType | null> {
  const res = await db.execute<{ type: string }>(sql`
    SELECT p.type::text AS type FROM loyalty.promotions p
    WHERE p.tenant_id = ${tenantId}::uuid AND p.active = true
    ORDER BY p.created_at DESC LIMIT 1`)
  const t = res.rows[0]?.type
  return t === "stamps" || t === "points" ? t : null
}

/**
 * Facts that bound "since the business started" for one tenant, then the
 * resolved inclusive range in the tenant timezone (see `resolveAllTimeRange`).
 */
export async function resolveTenantAllTimeRange(
  tenantId: string,
  timezone: string,
  now: Date = new Date(),
): Promise<{ from: string; to: string }> {
  const res = await db.execute<{
    service_start_on: string | null
    first_visit_at: Date | string | null
    first_client_at: Date | string | null
    tenant_created_at: Date | string | null
  }>(sql`
    SELECT tb.service_start_on::text AS service_start_on,
           (SELECT min(created_at) FROM loyalty.visits WHERE tenant_id = t.id) AS first_visit_at,
           (SELECT min(created_at) FROM loyalty.clients WHERE tenant_id = t.id) AS first_client_at,
           t.created_at AS tenant_created_at
    FROM tenants t
    LEFT JOIN tenant_billing tb ON tb.tenant_id = t.id
    WHERE t.id = ${tenantId}::uuid
    LIMIT 1`)
  const row = res.rows[0]
  const facts: TenantStartFacts = {
    serviceStartOn: row?.service_start_on ?? null,
    firstVisitAt: asDate(row?.first_visit_at),
    firstClientAt: asDate(row?.first_client_at),
    tenantCreatedAt: asDate(row?.tenant_created_at),
  }
  return resolveAllTimeRange(facts, timezone, now)
}

export type DatasetResult = {
  buffer: Buffer
  filename: string
  rows: number
  /** Resolved inclusive range actually used (dated datasets only). */
  from?: string
  to?: string
}

type Row = Record<string, unknown>
type Cell = string | number | null

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  inactive: "Inactivo",
  blocked: "Bloqueado",
  archived: "Archivado",
  deleted: "Eliminado",
}
const SOURCE_LABEL: Record<string, string> = { qr: "QR", manual: "Manual", bonus: "Bono" }
const TX_LABEL: Record<string, string> = {
  earn: "Ganados",
  redeem: "Canjeados",
  expire: "Vencidos",
  adjust: "Ajuste",
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v)
}
function date(v: unknown, tz: string): string {
  return formatDateForExport(v as Date | string | null, tz)
}
/** A `date` column arrives as YYYY-MM-DD; shown as DD/MM/YYYY. */
function ymd(v: unknown): string {
  const s = str(v).slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s
}
function asDate(v: unknown): Date | null {
  if (!v) return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v !== "string" && typeof v !== "number") return null
  // Timestamps without zone arrive as "YYYY-MM-DD HH:MM:SS" holding UTC wall time.
  const d = new Date(
    typeof v === "string" && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(v) ? `${v.replace(" ", "T")}Z` : v,
  )
  return Number.isNaN(d.getTime()) ? null : d
}

/** "Instalado", "Eliminado", "No instalado" or "Sin pase", from the pass rows. */
export function passStatus(p: {
  hasPass: boolean
  appleInstalled: boolean
  googleUrl: boolean
  googleSavedAt: Date | null
  googleDeletedAt: Date | null
}): { status: string; platform: string } {
  if (!p.hasPass) return { status: "Sin pase", platform: "Sin Wallet" }
  const googleRemoved =
    p.googleDeletedAt !== null && (p.googleSavedAt === null || p.googleDeletedAt > p.googleSavedAt)
  if (p.appleInstalled) return { status: "Instalado", platform: "Apple Wallet" }
  if (p.googleUrl && !googleRemoved) return { status: "Instalado", platform: "Google Wallet" }
  if (p.googleUrl && googleRemoved) return { status: "Eliminado", platform: "Google Wallet" }
  // Apple pass generated but no device registered: never installed, or
  // removed (Apple deletes the registration, so both look the same).
  return { status: "No instalado", platform: "Sin Wallet" }
}

/* ── Queries ─────────────────────────────────────────────────────── */

/** Pass state per client of one tenant (pass_instances has no tenant_id: scope via clients). */
function walletSubquery(tenantId: string) {
  return sql`
  SELECT pi.client_id,
         bool_or(ad.serial_number IS NOT NULL) AS apple_installed,
         bool_or(pi.google_save_url IS NOT NULL AND pi.google_save_url <> '') AS google_url,
         max(pi.google_saved_at) AS google_saved_at,
         max(pi.google_deleted_at) AS google_deleted_at,
         min(ad.created_at) AS apple_installed_at
  FROM passes.pass_instances pi
  LEFT JOIN passes.apple_devices ad ON ad.serial_number = pi.serial_number
  WHERE pi.client_id IN (SELECT id FROM loyalty.clients WHERE tenant_id = ${tenantId}::uuid)
  GROUP BY pi.client_id`
}

function localDay(col: string, tz: string) {
  return sql`(${sql.raw(col)} AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date`
}

async function queryClients(r: DatasetRequest): Promise<Row[]> {
  const status = r.clientStatus && r.clientStatus !== "all" ? r.clientStatus : null
  const res = await db.execute<Row>(sql`
    SELECT c.id, c.name, c.last_name, c.email, c.phone, c.dni, c.status, c.total_visits,
           c.current_cycle, c.tier, c.points_balance, c.marketing_opt_in, c.birthday::text AS birthday,
           c.created_at, vs.last_visit_at, vs.avg_days, vs.visit_count, vs.avg_points,
           (w.client_id IS NOT NULL) AS has_pass, coalesce(w.apple_installed, false) AS apple_installed,
           coalesce(w.google_url, false) AS google_url, w.google_saved_at, w.google_deleted_at, w.apple_installed_at,
           (SELECT string_agg(t.name, '; ' ORDER BY t.name)
              FROM loyalty.client_tag_assignments a JOIN loyalty.client_tags t ON t.id = a.tag_id
             WHERE a.client_id = c.id) AS tags
    FROM loyalty.clients c
    LEFT JOIN (
      SELECT client_id, max(created_at) AS last_visit_at, count(*)::int AS visit_count,
             avg(points) AS avg_points,
             CASE WHEN count(*) <= 1 THEN NULL
                  ELSE EXTRACT(EPOCH FROM (max(created_at) - min(created_at))) / (count(*) - 1) / 86400.0 END AS avg_days
      FROM loyalty.visits WHERE tenant_id = ${r.tenantId}::uuid AND source <> 'bonus' GROUP BY client_id
    ) vs ON vs.client_id = c.id
    LEFT JOIN (${walletSubquery(r.tenantId)}) w ON w.client_id = c.id
    WHERE c.tenant_id = ${r.tenantId}::uuid
      AND ${status ? sql`c.status = ${status}` : sql`c.status <> 'deleted'`}
    ORDER BY c.created_at, c.id`)
  return res.rows
}

async function queryVisits(r: DatasetRequest): Promise<Row[]> {
  const res = await db.execute<Row>(sql`
    SELECT v.created_at, v.visit_num, v.cycle_number, v.points, v.source, v.amount,
           c.name, c.last_name, c.email, c.phone, c.dni, c.created_at AS client_created_at,
           l.name AS location_name, u.name AS cashier_name,
           (w.client_id IS NOT NULL) AS has_pass, coalesce(w.apple_installed, false) AS apple_installed,
           coalesce(w.google_url, false) AS google_url, w.google_saved_at, w.google_deleted_at
    FROM loyalty.visits v
    JOIN loyalty.clients c ON c.id = v.client_id
    LEFT JOIN loyalty.locations l ON l.id = v.location_id
    LEFT JOIN "user" u ON u.id = v.registered_by
    LEFT JOIN (${walletSubquery(r.tenantId)}) w ON w.client_id = c.id
    WHERE v.tenant_id = ${r.tenantId}::uuid
      AND ${localDay("v.created_at", r.timezone)} BETWEEN ${r.from}::date AND ${r.to}::date
    ORDER BY v.created_at, v.id`)
  return res.rows
}

async function queryPoints(r: DatasetRequest): Promise<Row[]> {
  const res = await db.execute<Row>(sql`
    SELECT pt.created_at, pt.type, pt.amount, pt.description, pt.expires_at, pt.remaining,
           c.name, c.last_name, c.email, c.phone, c.dni, l.name AS location_name
    FROM loyalty.points_transactions pt
    JOIN loyalty.clients c ON c.id = pt.client_id
    LEFT JOIN loyalty.visits v ON v.id = pt.visit_id
    LEFT JOIN loyalty.locations l ON l.id = v.location_id
    WHERE pt.tenant_id = ${r.tenantId}::uuid
      AND ${localDay("pt.created_at", r.timezone)} BETWEEN ${r.from}::date AND ${r.to}::date
    ORDER BY pt.created_at, pt.id`)
  return res.rows
}

/* ── Row → cells ─────────────────────────────────────────────────── */

function clientCells(row: Row, r: DatasetRequest, now: Date): Record<string, Cell> {
  const lastVisit = asDate(row.last_visit_at)
  const avg = num(row.avg_days)
  const pass = passStatus({
    hasPass: Boolean(row.has_pass),
    appleInstalled: Boolean(row.apple_installed),
    googleUrl: Boolean(row.google_url),
    googleSavedAt: asDate(row.google_saved_at),
    googleDeletedAt: asDate(row.google_deleted_at),
  })
  const createdAt = asDate(row.created_at) ?? now
  const segment = computeClientSegment(
    {
      createdAt,
      totalVisits: num(row.total_visits) ?? 0,
      lastVisitAt: lastVisit,
      avgDaysBetweenVisits: avg,
    },
    r.thresholds,
    now,
  )
  const installedAt =
    pass.platform === "Apple Wallet" ? asDate(row.apple_installed_at) : asDate(row.google_saved_at)
  return {
    name: str(row.name),
    lastName: str(row.last_name),
    email: str(row.email),
    phone: str(row.phone),
    dni: str(row.dni),
    status: STATUS_LABEL[str(row.status)] ?? str(row.status),
    birthday: ymd(row.birthday),
    marketingOptIn: row.marketing_opt_in ? "Sí" : "No",
    createdAt: date(row.created_at, r.timezone),
    totalVisits: num(row.total_visits) ?? 0,
    lastVisitAt: date(row.last_visit_at, r.timezone),
    avgDaysBetweenVisits: avg === null ? null : Math.round(avg * 10) / 10,
    daysSinceLastVisit: lastVisit
      ? Math.floor((now.getTime() - lastVisit.getTime()) / 86_400_000)
      : null,
    currentCycle: num(row.current_cycle),
    pointsBalance: num(row.points_balance),
    avgPointsPerVisit:
      num(row.avg_points) === null ? null : Math.round((num(row.avg_points) ?? 0) * 10) / 10,
    tier: str(row.tier),
    segment: SEGMENT_LABELS[segment],
    tags: str(row.tags),
    passStatus: pass.status,
    walletPlatform: pass.platform,
    passInstalledAt: pass.status === "Instalado" ? date(installedAt, r.timezone) : "",
    passRemovedAt: pass.status === "Eliminado" ? date(row.google_deleted_at, r.timezone) : "",
  }
}

function visitCells(row: Row, r: DatasetRequest): Record<string, Cell> {
  const pass = passStatus({
    hasPass: Boolean(row.has_pass),
    appleInstalled: Boolean(row.apple_installed),
    googleUrl: Boolean(row.google_url),
    googleSavedAt: asDate(row.google_saved_at),
    googleDeletedAt: asDate(row.google_deleted_at),
  })
  return {
    createdAt: date(row.created_at, r.timezone),
    visitNum: num(row.visit_num),
    cycleNumber: num(row.cycle_number),
    points: num(row.points),
    amount: num(row.amount),
    source: SOURCE_LABEL[str(row.source)] ?? str(row.source),
    locationName: str(row.location_name),
    cashierName: str(row.cashier_name),
    name: str(row.name),
    lastName: str(row.last_name),
    email: str(row.email),
    phone: str(row.phone),
    dni: str(row.dni),
    clientCreatedAt: date(row.client_created_at, r.timezone),
    walletPlatform: pass.platform,
  }
}

function pointCells(row: Row, r: DatasetRequest): Record<string, Cell> {
  return {
    createdAt: date(row.created_at, r.timezone),
    type: TX_LABEL[str(row.type)] ?? str(row.type),
    amount: num(row.amount),
    description: str(row.description),
    expiresAt: date(row.expires_at, r.timezone),
    remaining: num(row.remaining),
    locationName: str(row.location_name),
    name: str(row.name),
    lastName: str(row.last_name),
    email: str(row.email),
    phone: str(row.phone),
    dni: str(row.dni),
  }
}

/* ── Workbook ────────────────────────────────────────────────────── */

export function pickColumns(def: DatasetDef, keys: string[], program: ProgramType | null) {
  const allowed = columnsFor(def, program)
  const byKey = new Map(allowed.map((c) => [c.key, c]))
  const picked = keys.map((k) => byKey.get(k)).filter((c): c is NonNullable<typeof c> => Boolean(c))
  return picked.length ? picked : allowed
}

export class DatasetError extends Error {}

/** Workbooks are built in memory: keep one request bounded. */
export const MAX_ROWS = 100_000

/** Real calendar date in YYYY-MM-DD (rejects 2026-02-31). */
export function isRealYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const t = Date.parse(`${s}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s
}

function validateRequest(def: DatasetDef, r: DatasetRequest): void {
  if (r.columns.length > 0 && !columnsFor(def, r.program).some((c) => r.columns.includes(c.key))) {
    throw new DatasetError("Ninguna de las columnas pedidas existe para este conjunto")
  }
  if (def.program && r.program && def.program !== r.program) {
    throw new DatasetError("Este comercio no tiene programa de puntos")
  }
  if (!def.dated) return
  if (!(r.from && r.to)) throw new DatasetError("Rango de fechas requerido")
  // The routes validate the query string, but a resolved "Acumulado" range
  // goes straight into SQL: check the real dates here too.
  if (!isRealYmd(r.from) || !isRealYmd(r.to) || r.from > r.to) {
    throw new DatasetError("Rango de fechas inválido")
  }
}

/**
 * Human label of the range for the file properties (Excel > Info) and the
 * stamp for the file name, so an "Acumulado" download says which dates it covers.
 */
function describeRange(def: DatasetDef, r: DatasetRequest): { label: string; stamp: string } {
  if (!def.dated) {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: r.timezone })
    return { label: `Al ${ymd(today)}`, stamp: today }
  }
  const kind = r.allTime ? "Acumulado" : "Periodo"
  return {
    label: `${kind}: del ${ymd(r.from)} al ${ymd(r.to)}`,
    stamp: `${r.allTime ? "acumulado-" : ""}${r.from}-a-${r.to}`,
  }
}

const FILE_BASENAME: Record<string, string> = {
  clients: "clientes",
  visits: "visitas",
  points: "puntos",
}

export async function buildDatasetXlsx(r: DatasetRequest): Promise<DatasetResult> {
  const def = datasetByKey(r.dataset)
  if (!def) throw new DatasetError("Conjunto de datos inválido")
  validateRequest(def, r)
  const columns = pickColumns(def, r.columns, r.program)
  const now = new Date()

  let cells: Record<string, Cell>[]
  if (def.key === "clients") {
    cells = (await queryClients(r)).map((row) => clientCells(row, r, now))
  } else if (def.key === "visits") {
    cells = (await queryVisits(r)).map((row) => visitCells(row, r))
  } else {
    cells = (await queryPoints(r)).map((row) => pointCells(row, r))
  }
  if (cells.length > MAX_ROWS) {
    throw new DatasetError(
      `El archivo tendría ${cells.length.toLocaleString("es-PE")} filas; el máximo es ${MAX_ROWS.toLocaleString("es-PE")}. Acorta el rango de fechas.`,
    )
  }

  const range = describeRange(def, r)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Cuik"
  workbook.title = `${def.label} · ${range.label}`
  workbook.subject = range.label
  const sheet = workbook.addWorksheet(def.label)
  sheet.columns = columns.map((c) => ({ header: c.label, key: c.key, width: c.width ?? 16 }))
  const header = sheet.getRow(1)
  header.font = { bold: true, color: { argb: "FFFFFFFF" } }
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B5FC0" } }
  header.height = 24
  for (const row of cells) {
    sheet.addRow(Object.fromEntries(columns.map((c) => [c.key, row[c.key] ?? ""])))
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
  sheet.views = [{ state: "frozen", ySplit: 1 }]

  return {
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    filename: `${FILE_BASENAME[def.key] ?? def.key}-${range.stamp}.xlsx`,
    rows: cells.length,
    from: def.dated ? r.from : undefined,
    to: def.dated ? r.to : undefined,
  }
}

/**
 * Query-string parsing shared by both routes. `from=all` (the "Acumulado"
 * preset) returns `allTime: true` with no dates: the route resolves them per
 * tenant with `resolveTenantAllTimeRange` before building.
 */
export function parseDatasetQuery(url: URL): {
  dataset: string
  columns: string[]
  from?: string
  to?: string
  allTime: boolean
  clientStatus: ClientStatusFilter
  error?: string
} {
  const p = url.searchParams
  const dataset = p.get("dataset") ?? ""
  const def = datasetByKey(dataset)
  const bad = (error: string) => ({
    dataset,
    columns: [],
    allTime: false,
    clientStatus: "all" as const,
    error,
  })
  if (!def) return bad("Conjunto de datos inválido")
  const columns = (p.get("columns") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const statusRaw = p.get("status") ?? "all"
  const clientStatus = (
    ["all", "active", "inactive", "blocked", "archived"].includes(statusRaw) ? statusRaw : "all"
  ) as ClientStatusFilter
  const fromRaw = p.get("from") ?? undefined
  const to = p.get("to") ?? undefined
  if (def.dated && fromRaw === ALL_TIME) {
    // Only the preset flag: a `to` here would be ambiguous.
    if (to) return bad("Rango de fechas inválido")
    return { dataset, columns, allTime: true, clientStatus }
  }
  const from = fromRaw
  if (def.dated) {
    if (!from || !to || !isRealYmd(from) || !isRealYmd(to)) return bad("Rango de fechas inválido")
    if (from > to) return bad("El rango está invertido")
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000
    if (days > 366) return bad("Máximo un año por archivo")
  }
  return { dataset, columns, from, to, allTime: false, clientStatus }
}
