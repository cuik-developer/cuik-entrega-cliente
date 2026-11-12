import {
  and,
  clients,
  db,
  desc,
  eq,
  impactReports,
  inArray,
  locations,
  programPhases,
  promotions,
  sales,
  salesImports,
  sql,
  tenants,
  user,
  visits,
} from "@cuik/db"
import { cashbackSettingsOf, stampsPromotionConfigSchema } from "@cuik/shared/validators"

import { connectionOwning } from "@/lib/pos/sync"
import { getAsset, uploadAsset } from "@/lib/storage"
import { detectMapping, missingRequiredFields, normalizeDay, normalizeDni } from "./columns"
import { computeImpact } from "./metrics"
import { buildOrders, readSalesFile } from "./parse"
import {
  type ColumnMapping,
  type CuikClient,
  type CuikVisit,
  DEFAULT_IMPORT_OPTIONS,
  type ImpactSummary,
  type ImportOptions,
  type SaleOrder,
} from "./types"

/**
 * Impacto, persisted: uploads (file + mapping), the sales rows, and the
 * computed reports ("cortes"). Every function takes the tenant id the route
 * already validated.
 */

export type ImportPreview = {
  importId: string
  fileName: string
  headers: string[]
  sample: unknown[][]
  rowsTotal: number
  mapping: ColumnMapping
  missing: string[]
  options: ImportOptions
  /** What the active program says: the minimum purchase for a stamp, or null. */
  minimumPurchase: number | null
}

export type ImportRow = {
  id: string
  fileName: string
  /** "file" or "pos". */
  source: string
  status: string
  error: string | null
  periodFrom: string | null
  periodTo: string | null
  rowsTotal: number
  ordersTotal: number
  ordersWithDni: number
  createdAt: string
  createdBy: string | null
  reportId: string | null
}

const SAMPLE_ROWS = 5

/** The minimum purchase of the tenant's active stamps program; null with cashback, points or no minimum. */
export async function programMinimumPurchase(tenantId: string): Promise<number | null> {
  const [promo] = await db
    .select({ type: promotions.type, config: promotions.config })
    .from(promotions)
    .where(and(eq(promotions.tenantId, tenantId), eq(promotions.active, true)))
    .orderBy(sql`CASE WHEN ${promotions.type} = 'points' THEN 0 ELSE 1 END`, promotions.createdAt)
    .limit(1)
  if (!promo || promo.type !== "stamps") return null
  const parsed = stampsPromotionConfigSchema.safeParse(promo.config ?? {})
  if (!parsed.success) return null
  if (cashbackSettingsOf(parsed.data.stamps)) return null
  return parsed.data.accumulation.minimumPurchaseAmount
}

/** Mapping and options of the tenant's last processed file import, to start from. */
export async function lastSettings(tenantId: string): Promise<{
  mapping: ColumnMapping | null
  options: ImportOptions
}> {
  const [last] = await db
    .select({ mapping: salesImports.mapping, excluded: salesImports.excludedDnis })
    .from(salesImports)
    .where(
      and(
        eq(salesImports.tenantId, tenantId),
        eq(salesImports.status, "ready"),
        eq(salesImports.source, "file"),
      ),
    )
    .orderBy(desc(salesImports.createdAt))
    .limit(1)
  const stored = (last?.mapping ?? null) as
    | (ColumnMapping & { retentionDays?: number; headers?: string[] })
    | null
  const excluded = Array.isArray(last?.excluded) ? (last.excluded as string[]) : []
  return {
    mapping: stored,
    options: {
      retentionDays: stored?.retentionDays ?? DEFAULT_IMPORT_OPTIONS.retentionDays,
      excludedDnis: excluded,
    },
  }
}

/** Reuses the last mapping only when the file has the same headers; else detects anew. */
function initialMapping(
  headers: string[],
  last: (ColumnMapping & { headers?: string[] }) | null,
): ColumnMapping {
  if (last?.headers && JSON.stringify(last.headers) === JSON.stringify(headers)) {
    const { headers: _h, ...m } = last
    const { retentionDays: _r, ...mapping } = m as ColumnMapping & { retentionDays?: number }
    return mapping
  }
  return detectMapping(headers)
}

/**
 * Step 1: keep the file, read its headers and a sample, propose a mapping.
 * The row stays in status "mapping" until the operator confirms.
 */
export async function createImport(params: {
  tenantId: string
  file: { name: string; buffer: Buffer }
  userId: string
}): Promise<ImportPreview | { error: string }> {
  const parsed = await readSalesFile(params.file.buffer, params.file.name)
  if ("error" in parsed) return parsed
  // With a POS connector, the API owns the sales from its start date: a file
  // reaching those days is refused here, before anything is stored.
  const connector = await connectionOwning(params.tenantId)
  if (connector) {
    const dateCol = detectMapping(parsed.headers).date
    const lastDay =
      dateCol === null
        ? null
        : parsed.rows.reduce<string | null>((max, r) => {
            const d = normalizeDay(r[dateCol])
            return d && (!max || d > max) ? d : max
          }, null)
    if (lastDay && lastDay >= connector.startDate) return { error: connectorOwnsMessage(connector) }
  }
  const [row] = await db
    .insert(salesImports)
    .values({
      tenantId: params.tenantId,
      fileName: params.file.name.slice(0, 200),
      status: "mapping",
      rowsTotal: parsed.rows.length,
      createdBy: params.userId,
    })
    .returning({ id: salesImports.id })
  const ext = params.file.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx"
  const key = `tenants/${params.tenantId}/impact/${row.id}.${ext}`
  try {
    await uploadAsset(
      key,
      params.file.buffer,
      ext === "csv"
        ? "text/csv"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    await db.update(salesImports).set({ fileKey: key }).where(eq(salesImports.id, row.id))
  } catch (err) {
    console.error("[impact] file upload failed", err)
    await db.delete(salesImports).where(eq(salesImports.id, row.id))
    return { error: "No se pudo guardar el archivo. Intenta de nuevo." }
  }
  const last = await lastSettings(params.tenantId)
  const mapping = initialMapping(parsed.headers, last.mapping)
  return {
    importId: row.id,
    fileName: params.file.name,
    headers: parsed.headers,
    sample: parsed.rows.slice(0, SAMPLE_ROWS).map((r) => r.map(sampleCell)),
    rowsTotal: parsed.rows.length,
    mapping,
    missing: missingRequiredFields(mapping),
    options: last.options,
    minimumPurchase: await programMinimumPurchase(params.tenantId),
  }
}

function sampleCell(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === "number" || typeof v === "string") return v
  return v == null ? null : String(v)
}

async function readStoredFile(key: string): Promise<Buffer> {
  const { stream } = await getAsset(key)
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

/** Cuik clients (with DNI) and visits of the tenant, in the tenant's timezone. */
export async function loadCuikData(
  tenantId: string,
): Promise<{ clients: CuikClient[]; visits: CuikVisit[] }> {
  const [t] = await db
    .select({ timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const tz = t?.timezone ?? "America/Lima"
  const clientRows = await db
    .select({
      id: clients.id,
      dni: clients.dni,
      name: clients.name,
      lastName: clients.lastName,
      createdAt: sql<string>`to_char(${clients.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tz}, 'YYYY-MM-DD')`,
    })
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), sql`${clients.status} <> 'deleted'`))
  const clientList: CuikClient[] = []
  const dniOfClient = new Map<string, string>()
  for (const c of clientRows) {
    const dni = (c.dni ?? "").replace(/\D/g, "")
    if (dni.length !== 8) continue
    dniOfClient.set(c.id, dni)
    clientList.push({
      dni,
      name: `${c.name}${c.lastName ? ` ${c.lastName}` : ""}`.trim(),
      registeredOn: c.createdAt,
    })
  }
  const visitRows = await db
    .select({
      clientId: visits.clientId,
      day: sql<string>`to_char(${visits.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tz}, 'YYYY-MM-DD')`,
      store: locations.name,
      cashier: user.name,
      source: visits.source,
    })
    .from(visits)
    .leftJoin(locations, eq(locations.id, visits.locationId))
    .leftJoin(user, eq(user.id, visits.registeredBy))
    .where(and(eq(visits.tenantId, tenantId), sql`${visits.source} <> 'bonus'`))
  const visitList: CuikVisit[] = []
  for (const v of visitRows) {
    const dni = dniOfClient.get(v.clientId)
    if (!dni) continue
    visitList.push({
      dni,
      day: v.day,
      store: v.store ?? "(sin local)",
      cashier: v.cashier ?? "(sin nombre)",
      source: v.source,
    })
  }
  return { clients: clientList, visits: visitList }
}

/** Every sale of the tenant up to `until` (inclusive), as the metrics read them. */
export async function loadTenantSales(tenantId: string, until?: string): Promise<SaleOrder[]> {
  // A sale linked to a client by inference (guest at the till) counts as that
  // client's purchase: it borrows the client's DNI and name.
  const clientDni = sql<
    string | null
  >`nullif(regexp_replace(coalesce(${clients.dni}, ''), '\\D', '', 'g'), '')`
  const rows = await db
    .select({
      orderRef: sales.orderRef,
      // Only while the visit still exists: a deleted visit takes the inference with it.
      dni: sql<
        string | null
      >`coalesce(${sales.dni}, CASE WHEN ${sales.visitId} IS NOT NULL THEN ${clientDni} END)`,
      name: sql<
        string | null
      >`coalesce(${sales.customerName}, CASE WHEN ${sales.visitId} IS NOT NULL THEN ${clients.name} END)`,
      phone: sales.phone,
      store: sales.store,
      cashier: sales.cashier,
      day: sql<string>`to_char(${sales.soldOn}, 'YYYY-MM-DD')`,
      amount: sales.amount,
    })
    .from(sales)
    .leftJoin(clients, eq(clients.id, sales.clientId))
    .where(
      and(eq(sales.tenantId, tenantId), until ? sql`${sales.soldOn} <= ${until}::date` : undefined),
    )
  return rows.map((r) => ({ ...r, dni: normalizeDni(r.dni), amount: Number.parseFloat(r.amount) }))
}

/** The phase in force at `day` (latest startsOn ≤ day), if any. */
async function phaseInForce(
  tenantId: string,
  day: string,
): Promise<{ id: string; name: string; startsOn: string } | null> {
  const [p] = await db
    .select({ id: programPhases.id, name: programPhases.name, startsOn: programPhases.startsOn })
    .from(programPhases)
    .where(
      and(eq(programPhases.tenantId, tenantId), sql`${programPhases.startsOn} <= ${day}::date`),
    )
    .orderBy(desc(programPhases.startsOn), desc(programPhases.createdAt))
    .limit(1)
  return p ? { id: p.id, name: p.name, startsOn: String(p.startsOn) } : null
}

/**
 * Step 2: with the confirmed mapping, turn the file into sales rows (the
 * period of the file replaces what was loaded for those days before), then
 * compute the corte over every sale of the tenant and keep it.
 */
/** A problem with the file itself, safe to show to whoever uploaded it. */
class ImpactInputError extends Error {}

function connectorOwnsMessage(connector: { startDate: string }): string {
  return `Desde el ${connector.startDate} las ventas llegan solas desde el POS; el archivo solo puede traer fechas anteriores.`
}

export async function processImport(params: {
  tenantId: string
  importId: string
  mapping: ColumnMapping
  headers: string[]
  options: ImportOptions
}): Promise<{ reportId: string; summary: ImpactSummary } | { error: string }> {
  const [imp] = await db
    .select({ id: salesImports.id, fileKey: salesImports.fileKey, fileName: salesImports.fileName })
    .from(salesImports)
    .where(and(eq(salesImports.id, params.importId), eq(salesImports.tenantId, params.tenantId)))
    .limit(1)
  if (!imp?.fileKey) return { error: "Carga no encontrada" }
  const missing = missingRequiredFields(params.mapping)
  if (missing.length > 0) return { error: "Faltan columnas obligatorias: DNI, fecha y monto" }

  await db
    .update(salesImports)
    .set({ status: "processing", error: null })
    .where(eq(salesImports.id, imp.id))
  try {
    const parsed = await readSalesFile(await readStoredFile(imp.fileKey), imp.fileName)
    if ("error" in parsed) throw new ImpactInputError(parsed.error)
    const built = buildOrders(parsed.rows, params.mapping)
    if (built.orders.length === 0)
      throw new ImpactInputError("No se encontraron compras con fecha en el archivo")
    const days = built.orders.map((o) => o.day).sort()
    const from = days[0]
    const to = days[days.length - 1]
    // With a POS connector, its period is not loaded from files (the API owns it, on or paused).
    const connector = await connectionOwning(params.tenantId)
    if (connector && to >= connector.startDate) {
      throw new ImpactInputError(connectorOwnsMessage(connector))
    }
    const excluded = params.options.excludedDnis
      .map((d) => d.replace(/\D/g, ""))
      .filter((d) => d.length === 8)

    await db.transaction(async (tx) => {
      // The file's period replaces what earlier files loaded for those days
      // (same month twice = no duplicates); synced rows are never touched.
      await tx
        .delete(sales)
        .where(
          and(
            eq(sales.tenantId, params.tenantId),
            eq(sales.source, "file"),
            sql`${sales.soldOn} BETWEEN ${from}::date AND ${to}::date`,
          ),
        )
      await tx.delete(sales).where(eq(sales.importId, imp.id))
      const seenRefs = new Set<string>()
      const values = built.orders
        .filter((o) => {
          if (!o.orderRef) return true
          if (seenRefs.has(o.orderRef)) return false
          seenRefs.add(o.orderRef)
          return true
        })
        .map((o) => ({
          tenantId: params.tenantId,
          importId: imp.id,
          orderRef: o.orderRef,
          dni: o.dni,
          customerName: o.name?.slice(0, 200) ?? null,
          phone: o.phone,
          store: o.store?.slice(0, 120) ?? null,
          cashier: o.cashier?.slice(0, 120) ?? null,
          soldOn: o.day,
          amount: o.amount.toFixed(2),
        }))
      for (let i = 0; i < values.length; i += 1000) {
        await tx
          .insert(sales)
          .values(values.slice(i, i + 1000))
          .onConflictDoNothing({ target: [sales.tenantId, sales.orderRef] })
      }
      await tx
        .update(salesImports)
        .set({
          mapping: {
            ...params.mapping,
            headers: params.headers,
            retentionDays: params.options.retentionDays,
          },
          excludedDnis: excluded,
          periodFrom: from,
          periodTo: to,
          rowsTotal: built.rowsTotal,
          ordersTotal: built.orders.length,
          ordersWithDni: built.orders.filter((o) => o.dni).length,
        })
        .where(eq(salesImports.id, imp.id))
    })

    return await computeReportForImport({
      tenantId: params.tenantId,
      importId: imp.id,
      until: to,
      options: { retentionDays: params.options.retentionDays, excludedDnis: excluded },
    })
  } catch (err) {
    // Our own messages are short and in Spanish; anything else (a DB error that
    // carries the whole INSERT) stays in the log and the user gets a plain line.
    const own = err instanceof ImpactInputError
    const message = own
      ? err.message
      : "No se pudo procesar el archivo. Revisa que las columnas sean las correctas o escríbenos."
    console.error("[impact] processImport failed", own ? err.message : err)
    await db
      .update(salesImports)
      .set({ status: "failed", error: message.slice(0, 500) })
      .where(eq(salesImports.id, imp.id))
    return { error: message }
  }
}

/**
 * Computes the corte over every sale of the tenant and keeps it as the
 * report of `importId` (replacing that import's previous report). Shared by
 * the file upload and the POS connector's monthly corte.
 */
export async function computeReportForImport(params: {
  tenantId: string
  importId: string
  /** Last day the corte covers: sales after it stay out, and it picks the program phase in force. */
  until: string
  options: ImportOptions
}): Promise<{ reportId: string; summary: ImpactSummary }> {
  const excluded = params.options.excludedDnis
    .map((d) => d.replace(/\D/g, ""))
    .filter((d) => d.length === 8)
  const [orders, cuik, minimumPurchase, phase] = await Promise.all([
    loadTenantSales(params.tenantId, params.until),
    loadCuikData(params.tenantId),
    programMinimumPurchase(params.tenantId),
    phaseInForce(params.tenantId, params.until),
  ])
  const summary = computeImpact({
    orders,
    clients: cuik.clients,
    visits: cuik.visits,
    options: {
      retentionDays: params.options.retentionDays,
      excludedDnis: excluded,
      minimumPurchase,
      phase,
    },
  })
  const [report] = await db.transaction(async (tx) => {
    await tx.delete(impactReports).where(eq(impactReports.importId, params.importId))
    const inserted = await tx
      .insert(impactReports)
      .values({
        tenantId: params.tenantId,
        importId: params.importId,
        phaseId: phase?.id ?? null,
        periodFrom: summary.period.from,
        periodTo: params.until,
        summary,
      })
      .returning({ id: impactReports.id })
    await tx
      .update(salesImports)
      .set({ status: "ready", processedAt: new Date() })
      .where(eq(salesImports.id, params.importId))
    return inserted
  })
  return { reportId: report.id, summary }
}

/** The tenant's current corte: the one covering the latest period (ties: the newest computed). */
export async function latestReportId(tenantId: string): Promise<string | null> {
  const [latest] = await db
    .select({ id: impactReports.id })
    .from(impactReports)
    .where(eq(impactReports.tenantId, tenantId))
    .orderBy(desc(impactReports.periodTo), desc(impactReports.computedAt))
    .limit(1)
  return latest?.id ?? null
}

/** Imports of a tenant, newest first, each with its report id when computed. */
export async function listImports(tenantId: string): Promise<ImportRow[]> {
  const rows = await db
    .select({
      id: salesImports.id,
      fileName: salesImports.fileName,
      source: salesImports.source,
      status: salesImports.status,
      error: salesImports.error,
      periodFrom: salesImports.periodFrom,
      periodTo: salesImports.periodTo,
      rowsTotal: salesImports.rowsTotal,
      ordersTotal: salesImports.ordersTotal,
      ordersWithDni: salesImports.ordersWithDni,
      createdAt: salesImports.createdAt,
      createdBy: user.name,
    })
    .from(salesImports)
    .leftJoin(user, eq(user.id, salesImports.createdBy))
    .where(eq(salesImports.tenantId, tenantId))
    .orderBy(desc(salesImports.createdAt))
    .limit(100)
  const ids = rows.map((r) => r.id)
  const reports = ids.length
    ? await db
        .select({ id: impactReports.id, importId: impactReports.importId })
        .from(impactReports)
        .where(inArray(impactReports.importId, ids))
    : []
  const reportOf = new Map(reports.map((r) => [r.importId, r.id]))
  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    source: r.source,
    status: r.status,
    error: r.error,
    periodFrom: r.periodFrom ? String(r.periodFrom) : null,
    periodTo: r.periodTo ? String(r.periodTo) : null,
    rowsTotal: r.rowsTotal,
    ordersTotal: r.ordersTotal,
    ordersWithDni: r.ordersWithDni,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy,
    reportId: reportOf.get(r.id) ?? null,
  }))
}

export type ReportView = {
  id: string
  tenantId: string
  computedAt: string
  summary: ImpactSummary
  /** The corte before this one (by period end), for the month-to-month comparison. */
  previous: { id: string; computedAt: string; periodTo: string; summary: ImpactSummary } | null
}

export async function getReport(reportId: string, tenantId: string): Promise<ReportView | null> {
  const [r] = await db
    .select()
    .from(impactReports)
    .where(and(eq(impactReports.id, reportId), eq(impactReports.tenantId, tenantId)))
    .limit(1)
  if (!r) return null
  const [prev] = await db
    .select({
      id: impactReports.id,
      computedAt: impactReports.computedAt,
      periodTo: impactReports.periodTo,
      summary: impactReports.summary,
    })
    .from(impactReports)
    .where(
      and(
        eq(impactReports.tenantId, tenantId),
        sql`${impactReports.id} <> ${reportId}::uuid`,
        // The corte of the period before this one (not whichever was computed before).
        sql`(${impactReports.periodTo}, ${impactReports.computedAt}) < (${r.periodTo}::date, ${r.computedAt})`,
      ),
    )
    .orderBy(desc(impactReports.periodTo), desc(impactReports.computedAt))
    .limit(1)
  return {
    id: r.id,
    tenantId: r.tenantId,
    computedAt: r.computedAt.toISOString(),
    summary: r.summary as ImpactSummary,
    previous: prev
      ? {
          id: prev.id,
          computedAt: prev.computedAt.toISOString(),
          periodTo: String(prev.periodTo),
          summary: prev.summary as ImpactSummary,
        }
      : null,
  }
}

/**
 * Removes a file import, its sales rows and its report (cascade). A synced
 * month is never deleted this way: its orders would not come back (the
 * connector's cursor is past them).
 */
export async function deleteImport(
  importId: string,
  tenantId: string,
): Promise<{ ok: true } | { error: string; status: 404 | 409 }> {
  const [imp] = await db
    .select({ source: salesImports.source })
    .from(salesImports)
    .where(and(eq(salesImports.id, importId), eq(salesImports.tenantId, tenantId)))
    .limit(1)
  if (!imp) return { error: "Carga no encontrada", status: 404 }
  if (imp.source !== "file") {
    return {
      error: "Este mes viene del conector POS y no se puede eliminar desde aquí.",
      status: 409,
    }
  }
  await db
    .delete(salesImports)
    .where(and(eq(salesImports.id, importId), eq(salesImports.tenantId, tenantId)))
  return { ok: true }
}
