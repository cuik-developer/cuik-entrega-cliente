import ExcelJS from "exceljs"

import type { ImpactSummary } from "./types"

const fmtPct = (p: number | null) => (p === null ? "—" : `${p} %`)
const fmtDays = (d: number | null) => (d === null ? "—" : `${d}`)
const soles = "S/ #,##0.00"

/**
 * The corte as a workbook, same sheets as the Mascota Veloz analysis:
 * Resumen, Cobertura, Registro por cliente, Cumplimiento por tienda / por mes,
 * Visitas por cajero, Retención por mes, Frecuentes sin tarjeta, Frecuencia
 * rota, Personal excluido.
 */
export async function buildImpactExcel(s: ImpactSummary, tenantName: string): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Cuik"
  const header = (ws: ExcelJS.Worksheet, cols: number) => {
    const row = ws.getRow(1)
    row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E70DB" } }
    row.alignment = { vertical: "middle" }
    row.height = 24
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols } }
  }
  const sheet = (
    name: string,
    cols: { header: string; key: string; width?: number; money?: boolean }[],
    rows: Record<string, unknown>[],
  ) => {
    const ws = wb.addWorksheet(name)
    ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16 }))
    header(ws, cols.length)
    for (const r of rows) ws.addRow(r)
    cols.forEach((c, i) => {
      if (c.money) ws.getColumn(i + 1).numFmt = soles
    })
    ws.views = [{ state: "frozen", ySplit: 1 }]
    return ws
  }

  const f = s.frequency
  const r = s.retention
  sheet(
    "Resumen",
    [
      { header: "Indicador", key: "k", width: 64 },
      { header: "Valor", key: "v", width: 32 },
    ],
    [
      { k: "Comercio", v: tenantName },
      { k: "Ventas analizadas", v: `${s.period.from} a ${s.period.to}` },
      { k: "Compras en el archivo", v: s.coverage.orders },
      {
        k: "Compras con DNI válido",
        v: `${s.coverage.ordersWithDni} (${fmtPct(s.coverage.coveragePct)})`,
      },
      { k: "Clientes distintos (DNI)", v: s.coverage.uniqueDnis },
      { k: "Ticket promedio", v: s.coverage.avgTicket ?? "—" },
      { k: "Lanzamiento de Cuik (primer registro)", v: s.options.launch ?? "—" },
      {
        k: "Etapa del programa vigente",
        v: s.options.phase ? `${s.options.phase.name} (desde ${s.options.phase.startsOn})` : "—",
      },
      { k: "Clientes Cuik con DNI", v: s.cuik.clients },
      { k: "Clientes Cuik encontrados en las ventas", v: s.cuik.matchedInSales },
      {
        k: `Registro en caja (compras ${s.options.minimumPurchase !== null ? `≥ S/ ${s.options.minimumPurchase}` : "de cualquier monto"} con visita el mismo día)`,
        v: `${fmtPct(s.registration.pct)} (${s.registration.registeredDays} de ${s.registration.eligibleDays})`,
      },
      { k: "Compras bajo el mínimo (sin sello posible)", v: s.registration.smallDays },
      { k: "Visitas Cuik sin compra ese día en el archivo", v: s.registration.orphanVisits },
      { k: "Clientes con 100 % de registro", v: s.registration.buckets["100%"] },
      { k: "Clientes con 50-99 %", v: s.registration.buckets["50-99%"] },
      { k: "Clientes con 1-49 %", v: s.registration.buckets["1-49%"] },
      { k: "Clientes con 0 %", v: s.registration.buckets["0%"] },
      {
        k: "Con tarjeta: días entre compras antes → después del registro",
        v: `${fmtDays(f.registered.gapBefore)} → ${fmtDays(f.registered.gapAfter)} (n=${f.registered.n})`,
      },
      {
        k: "Sin tarjeta (control): antes → después del lanzamiento",
        v: `${fmtDays(f.control.gapBefore)} → ${fmtDays(f.control.gapAfter)} (n=${f.control.n})`,
      },
      {
        k: "Compras extra por cliente al año (vs tendencia del control)",
        v: f.extraPurchasesPerYear ?? "—",
      },
      { k: "Venta protegida al año (estimación)", v: f.moneyPerYear ?? "—" },
      {
        k: `Retención a ${r.windowDays} días antes del lanzamiento`,
        v: `${fmtPct(r.beforeLaunch.retained)} (${r.beforeLaunch.cohort} cohortes-mes)`,
      },
      {
        k: `Retención a ${r.windowDays} días después, todos`,
        v: `${fmtPct(r.afterLaunch.all.retained)} (${r.afterLaunch.all.cohort})`,
      },
      {
        k: `Retención después, con tarjeta`,
        v: `${fmtPct(r.afterLaunch.card.retained)} (${r.afterLaunch.card.cohort})`,
      },
      {
        k: `Retención después, sin tarjeta`,
        v: `${fmtPct(r.afterLaunch.noCard.retained)} (${r.afterLaunch.noCard.cohort})`,
      },
      {
        k: "Mismo cliente con tarjeta: retención de cada compra antes → después",
        v: `${fmtPct(r.sameClient.registered.before.pct)} → ${fmtPct(r.sameClient.registered.after.pct)} (${r.sameClient.registered.clients} clientes)`,
      },
      {
        k: "Mismo cliente sin tarjeta: antes → después del lanzamiento",
        v: `${fmtPct(r.sameClient.control.before.pct)} → ${fmtPct(r.sameClient.control.after.pct)} (${r.sameClient.control.clients} clientes)`,
      },
      { k: "Frecuentes sin tarjeta (≥ 3 compras en 12 meses)", v: s.unregisteredFrequent.count },
      { k: "Gasto de esos frecuentes", v: s.unregisteredFrequent.spend },
      {
        k: "Frecuencia rota (silencio > 1,5× su intervalo)",
        v: `${s.brokenFrequency.total} (con tarjeta ${s.brokenFrequency.registered}, sin tarjeta ${s.brokenFrequency.notRegistered})`,
      },
      {
        k: "Cuentas excluidas (personal)",
        v: [...s.staff.manual, ...s.staff.detected.map((d) => d.dni)].join(" · ") || "ninguna",
      },
    ],
  )

  sheet(
    "Cobertura",
    [
      { header: "Tienda", key: "store", width: 24 },
      { header: "Compras", key: "orders" },
      { header: "Con DNI", key: "withDni" },
      { header: "% con DNI", key: "coveragePct" },
      { header: "Venta", key: "revenue", money: true },
    ],
    s.coverage.byStore.map((b) => ({ ...b, coveragePct: fmtPct(b.coveragePct) })),
  )

  sheet(
    "Registro por cliente",
    [
      { header: "Cliente", key: "name", width: 28 },
      { header: "DNI", key: "dni", width: 12 },
      { header: "Registro Cuik", key: "registeredOn", width: 14 },
      { header: "Compras elegibles", key: "eligible" },
      { header: "Con visita ese día", key: "registered" },
      { header: "% registro", key: "pct", width: 12 },
      { header: "Tiendas", key: "stores", width: 36 },
    ],
    s.registration.perClient.map((p) => ({ ...p, pct: fmtPct(p.pct) })),
  )

  sheet(
    "Cumplimiento por tienda",
    [
      { header: "Tienda", key: "store", width: 24 },
      { header: "Compras elegibles de clientes Cuik", key: "eligible", width: 30 },
      { header: "Con visita ese día", key: "registered", width: 20 },
      { header: "% cumplimiento", key: "pct" },
      { header: "Visita marcada en otro local", key: "otherLocal", width: 26 },
    ],
    s.registration.byStore.map((b) => ({ ...b, pct: fmtPct(b.pct) })),
  )

  sheet(
    "Cumplimiento por mes",
    [
      { header: "Mes", key: "month", width: 10 },
      { header: "Compras elegibles", key: "eligible", width: 20 },
      { header: "Con visita ese día", key: "registered", width: 20 },
      { header: "% cumplimiento", key: "pct" },
    ],
    s.registration.byMonth.map((b) => ({ ...b, pct: fmtPct(b.pct) })),
  )

  sheet(
    "Visitas por cajero",
    [
      { header: "Registrada por", key: "cashier", width: 28 },
      { header: "Visitas", key: "visits", width: 10 },
      { header: "Por QR", key: "qr", width: 10 },
      { header: "Manual", key: "manual", width: 10 },
      { header: "Sin compra ese día", key: "orphan", width: 20 },
      { header: "Locales", key: "stores", width: 30 },
    ],
    s.registration.byCashier,
  )

  sheet(
    `Retención ${r.windowDays} días`,
    [
      { header: "Mes", key: "month", width: 10 },
      { header: "Clientes", key: "cohort" },
      { header: "Retenidos", key: "retained" },
      { header: "Con tarjeta", key: "cardCohort" },
      { header: "Retenidos con tarjeta", key: "cardRetained", width: 20 },
      { header: "Sin tarjeta", key: "noCardCohort" },
      { header: "Retenidos sin tarjeta", key: "noCardRetained", width: 20 },
    ],
    r.cohorts.map((c) => ({
      ...c,
      retained: fmtPct(c.retained),
      cardRetained: fmtPct(c.cardRetained),
      noCardRetained: fmtPct(c.noCardRetained),
    })),
  )

  sheet(
    "Frecuentes sin tarjeta",
    [
      { header: "Cliente", key: "name", width: 30 },
      { header: "DNI", key: "dni", width: 12 },
      { header: "Teléfono", key: "phone", width: 14 },
      { header: "Compras 12 meses", key: "purchases12m", width: 16 },
      { header: "Cada cuántos días", key: "medianGap", width: 16 },
      { header: "Última compra", key: "lastPurchase", width: 14 },
      { header: "Gasto total", key: "total", money: true },
      { header: "Tiendas", key: "stores", width: 36 },
    ],
    s.unregisteredFrequent.list,
  )

  sheet(
    "Frecuencia rota",
    [
      { header: "Cliente", key: "name", width: 30 },
      { header: "DNI", key: "dni", width: 12 },
      { header: "Teléfono", key: "phone", width: 14 },
      { header: "Con tarjeta", key: "registered", width: 12 },
      { header: "Compras", key: "purchases", width: 10 },
      { header: "Venía cada (días)", key: "medianGap", width: 16 },
      { header: "Última compra", key: "lastPurchase", width: 14 },
      { header: "Días sin comprar", key: "silence", width: 16 },
      { header: "Tiendas", key: "stores", width: 36 },
    ],
    s.brokenFrequency.list.map((b) => ({ ...b, registered: b.registered ? "Sí" : "No" })),
  )

  sheet(
    "Personal excluido",
    [
      { header: "DNI", key: "dni", width: 12 },
      { header: "Nombre", key: "name", width: 30 },
      { header: "Compras", key: "purchases", width: 10 },
      { header: "Origen", key: "origin", width: 20 },
    ],
    [
      ...s.staff.manual.map((dni) => ({ dni, name: "", purchases: "", origin: "Excluido a mano" })),
      ...s.staff.detected.map((d) => ({ ...d, origin: "Detectado (compra casi diaria)" })),
    ],
  )

  return wb.xlsx.writeBuffer() as unknown as Promise<ArrayBuffer>
}
