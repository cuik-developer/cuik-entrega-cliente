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

import { getAsset, uploadAsset } from "@/lib/storage"
import { detectMapping, missingRequiredFields } from "./columns"
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

/** Mapping and options of the tenant's last processed import, to start from. */
async function lastSettings(tenantId: string): Promise<{
  mapping: ColumnMapping | null
  options: ImportOptions
}> {
  const [last] = await db
    .select({ mapping: salesImports.mapping, excluded: salesImports.excludedDnis })
    .from(salesImports)
    .where(and(eq(salesImports.tenantId, tenantId), eq(salesImports.status, "ready")))
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

/** Every sale of the tenant loaded so far, as the metrics read them. */
export async function loadTenantSales(tenantId: string): Promise<SaleOrder[]> {
  const rows = await db
    .select({
      orderRef: sales.orderRef,
      dni: sales.dni,
      name: sales.customerName,
      phone: sales.phone,
      store: sales.store,
      cashier: sales.cashier,
      day: sql<string>`to_char(${sales.soldOn}, 'YYYY-MM-DD')`,
      amount: sales.amount,
    })
    .from(sales)
    .where(eq(sales.tenantId, tenantId))
  return rows.map((r) => ({ ...r, amount: Number.parseFloat(r.amount) }))
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
    if ("error" in parsed) throw new Error(parsed.error)
    const built = buildOrders(parsed.rows, params.mapping)
    if (built.orders.length === 0)
      throw new Error("No se encontraron compras con fecha en el archivo")
    const days = built.orders.map((o) => o.day).sort()
    const from = days[0]
    const to = days[days.length - 1]
    const excluded = params.options.excludedDnis
      .map((d) => d.replace(/\D/g, ""))
      .filter((d) => d.length === 8)

    await db.transaction(async (tx) => {
      // The file's period replaces what was loaded for those days (same month twice = no duplicates).
      await tx
        .delete(sales)
        .where(
          and(
            eq(sales.tenantId, params.tenantId),
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

    const [orders, cuik, minimumPurchase, phase] = await Promise.all([
      loadTenantSales(params.tenantId),
      loadCuikData(params.tenantId),
      programMinimumPurchase(params.tenantId),
      phaseInForce(params.tenantId, to),
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
      await tx.delete(impactReports).where(eq(impactReports.importId, imp.id))
      const inserted = await tx
        .insert(impactReports)
        .values({
          tenantId: params.tenantId,
          importId: imp.id,
          phaseId: phase?.id ?? null,
          periodFrom: summary.period.from,
          periodTo: summary.period.to,
          summary,
        })
        .returning({ id: impactReports.id })
      await tx
        .update(salesImports)
        .set({ status: "ready", processedAt: new Date() })
        .where(eq(salesImports.id, imp.id))
      return inserted
    })
    return { reportId: report.id, summary }
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo procesar el archivo"
    console.error("[impact] processImport failed", err)
    await db
      .update(salesImports)
      .set({ status: "failed", error: message.slice(0, 500) })
      .where(eq(salesImports.id, imp.id))
    return { error: message }
  }
}

/** Imports of a tenant, newest first, each with its report id when computed. */
export async function listImports(tenantId: string): Promise<ImportRow[]> {
  const rows = await db
    .select({
      id: salesImports.id,
      fileName: salesImports.fileName,
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
        sql`${impactReports.computedAt} < ${r.computedAt}`,
      ),
    )
    .orderBy(desc(impactReports.computedAt))
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

/** Removes an import, its sales rows and its report (cascade). */
export async function deleteImport(importId: string, tenantId: string): Promise<boolean> {
  const deleted = await db
    .delete(salesImports)
    .where(and(eq(salesImports.id, importId), eq(salesImports.tenantId, tenantId)))
    .returning({ id: salesImports.id })
  return deleted.length > 0
}
