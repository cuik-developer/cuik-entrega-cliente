import { and, db, eq, impactReports, posConnections, salesImports, sql, tenants } from "@cuik/db"
import { previousMonth } from "@/lib/loyalty/impact/reminder"
import { computeReportForImport, lastSettings } from "@/lib/loyalty/impact/store"
import { dayInTz } from "./match"
import { type Cursor, type SyncResult, syncedMonths } from "./sync"

/**
 * The monthly corte for tenants on the POS connector: the same report the
 * file upload produces, computed over the synced month's import row and cut
 * at the month's last day.
 */

/** Last day of "YYYY-MM". */
export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

/** Retention window and excluded DNIs for a connector tenant: the connection's, else the last file's. */
async function corteOptions(tenantId: string) {
  const [conn] = await db
    .select({ retentionDays: posConnections.retentionDays, excluded: posConnections.excludedDnis })
    .from(posConnections)
    .where(eq(posConnections.tenantId, tenantId))
    .limit(1)
  const fromFile = await lastSettings(tenantId)
  const excluded = Array.isArray(conn?.excluded) ? (conn.excluded as string[]) : []
  return {
    retentionDays: conn?.retentionDays ?? fromFile.options.retentionDays,
    excludedDnis: excluded.length > 0 ? excluded : fromFile.options.excludedDnis,
  }
}

export async function computeSyncedCorte(
  tenantId: string,
  month: string,
): Promise<{ reportId: string } | { error: string }> {
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Mes inválido" }
  const [conn] = await db
    .select({ cursor: posConnections.cursor, lastError: posConnections.lastError })
    .from(posConnections)
    .where(eq(posConnections.tenantId, tenantId))
    .limit(1)
  const cursor = (conn?.cursor as Cursor | null) ?? null
  if (!cursor || !cursor.exhausted) {
    return { error: "La carga inicial desde el POS todavía no termina; el corte saldría a medias." }
  }
  if (conn?.lastError) {
    return { error: `El conector tiene un error pendiente: ${conn.lastError}` }
  }
  const synced = await syncedMonths(tenantId)
  const target = synced.find((m) => m.month === month)
  if (!target) return { error: `No hay ventas sincronizadas de ${month}` }
  try {
    const r = await computeReportForImport({
      tenantId,
      importId: target.importId,
      until: lastDayOfMonth(month),
      options: await corteOptions(tenantId),
    })
    return { reportId: r.reportId }
  } catch (err) {
    console.error("[pos-corte] failed", tenantId, month, err)
    return { error: "No se pudo calcular el corte" }
  }
}

/**
 * For every enabled connector that has finished its backfill without error:
 * computes the previous month's corte once, from the 2nd of the month on and
 * only after a sync that ran past the month's end (so the last day's late
 * orders are in). Tenants still pulling in this run are skipped.
 */
export async function computeMissingCortes(
  synced: SyncResult[] = [],
): Promise<{ tenantId: string; month: string }[]> {
  const busy = new Set(synced.filter((s) => s.more || s.error).map((s) => s.tenantId))
  const rows = await db
    .select({
      tenantId: posConnections.tenantId,
      timezone: tenants.timezone,
      cursor: posConnections.cursor,
      lastSyncAt: posConnections.lastSyncAt,
    })
    .from(posConnections)
    .innerJoin(tenants, eq(tenants.id, posConnections.tenantId))
    .where(and(eq(posConnections.enabled, true), sql`${posConnections.lastError} IS NULL`))
  const done: { tenantId: string; month: string }[] = []
  for (const r of rows) {
    if (busy.has(r.tenantId)) continue
    const cursor = (r.cursor as Cursor | null) ?? null
    if (!cursor?.exhausted || !r.lastSyncAt) continue
    const timezone = r.timezone ?? "America/Lima"
    const today = dayInTz(new Date(), timezone)
    if (Number(today.slice(8, 10)) < 2) continue
    const { key: month } = previousMonth(today)
    // The sync must have run on a local day after the month ended.
    if (dayInTz(r.lastSyncAt, timezone) <= lastDayOfMonth(month)) continue
    const [imp] = await db
      .select({ id: salesImports.id })
      .from(salesImports)
      .where(
        and(
          eq(salesImports.tenantId, r.tenantId),
          eq(salesImports.source, "pos"),
          eq(salesImports.fileName, `Odoo · ${month}`),
        ),
      )
      .limit(1)
    if (!imp) continue
    const [existing] = await db
      .select({ id: impactReports.id })
      .from(impactReports)
      .where(eq(impactReports.importId, imp.id))
      .limit(1)
    if (existing) continue
    const result = await computeSyncedCorte(r.tenantId, month)
    if ("reportId" in result) done.push({ tenantId: r.tenantId, month })
  }
  return done
}
