import ExcelJS from "exceljs"
import { formatDateForExport } from "@/lib/format-date"
import type { Cumulative, ReportData } from "./compute-report"
import { dayLabel, deltaShort, weekdayName } from "./period"

/**
 * The xlsx attached to the report. Sheets mirror the email sections; no
 * contact data (phones/emails) on purpose — the panel is where you contact
 * people. Column names match the panel's own exports where they overlap.
 */

const AT_RISK_NOTE =
  "Estos clientes están en riesgo por su naturaleza: solían venir seguido y dejaron de hacerlo. " +
  "Recomendamos enviarles una campaña push con un incentivo para regresar (por ejemplo, un sello extra en su próxima visita). " +
  "Desde el panel: Campañas → Nueva campaña → segmento En riesgo."

function styleHeader(sheet: ExcelJS.Worksheet, rowNumber = 1) {
  const row = sheet.getRow(rowNumber)
  // Cuik blue (#0e70db) with white text, same as the panel's primary color.
  row.font = { bold: true, color: { argb: "FFFFFFFF" } }
  row.alignment = { vertical: "middle" }
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E70DB" } }
}

function addTable(
  sheet: ExcelJS.Worksheet,
  columns: Array<{ header: string; key: string; width?: number }>,
  rows: Record<string, unknown>[],
  startRow = 1,
) {
  if (startRow === 1) {
    sheet.columns = columns.map((c) => ({ key: c.key, width: c.width ?? 18 }))
    sheet.addRow(columns.map((c) => c.header))
    styleHeader(sheet, 1)
  } else {
    for (const [i, c] of columns.entries()) {
      sheet.getColumn(i + 1).width = c.width ?? 18
    }
    sheet.getRow(startRow).values = columns.map((c) => c.header)
    styleHeader(sheet, startRow)
  }
  for (const r of rows) {
    sheet.addRow(columns.map((c) => r[c.key] ?? ""))
  }
}

function progressHeader(data: ReportData): string {
  return data.tenant.programType === "points" ? "Puntos" : "Sellos"
}

export function reportFilename(data: ReportData): string {
  const kind = data.kind === "weekly" ? "semana" : "mes"
  return `${data.tenant.slug}-${kind}-${data.period.key}.xlsx`
}

export async function buildReportXlsx(data: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Cuik"
  const tz = data.tenant.timezone
  const isWeekly = data.kind === "weekly"
  const periodWord = isWeekly ? "semana" : "mes"

  // ── Resumen ───────────────────────────────────────────────────────
  const resumen = wb.addWorksheet("Resumen")
  resumen.getCell("A1").value = `${data.tenant.name} · ${data.periodLabel}`
  resumen.getCell("A1").font = { bold: true, size: 13 }
  resumen.getCell("A2").value =
    `Comparado con ${data.compareLabel}. Fechas en hora local del comercio (${tz}).`
  resumen.getCell("A2").font = { color: { argb: "FF71717A" } }
  const k = data.kpis
  const rows: Record<string, unknown>[] = [
    {
      indicador: "Visitas",
      actual: k.visits.current,
      anterior: k.visits.previous,
      cambio: deltaShort(k.visits.current, k.visits.previous),
    },
    {
      indicador: "Clientes distintos que visitaron",
      actual: k.uniqueClients.current,
      anterior: k.uniqueClients.previous,
      cambio: deltaShort(k.uniqueClients.current, k.uniqueClients.previous),
    },
    {
      indicador: "Clientes nuevos registrados",
      actual: k.newClients.current,
      anterior: k.newClients.previous,
      cambio: deltaShort(k.newClients.current, k.newClients.previous),
    },
    {
      indicador: "Premios canjeados",
      actual: k.rewardsRedeemed.current,
      anterior: k.rewardsRedeemed.previous,
      cambio: deltaShort(k.rewardsRedeemed.current, k.rewardsRedeemed.previous),
    },
    {
      indicador: `${data.actionable.label} (al cierre)`,
      actual: data.actionable.count,
      anterior: "",
      cambio: "",
    },
    {
      indicador: "Clientes en riesgo (al cierre)",
      actual: data.atRisk.length,
      anterior: "",
      cambio: "",
    },
    {
      indicador: "Push enviados",
      actual: data.campaigns.reduce((s, c) => s + c.sentCount, 0),
      anterior: "",
      cambio: "",
    },
  ]
  if (data.monthly?.lastYearVisits != null) {
    rows.push({
      indicador: "Visitas, mismo mes del año pasado",
      actual: data.monthly.lastYearVisits,
      anterior: "",
      cambio: "",
    })
  }
  addTable(
    resumen,
    [
      { header: "Indicador", key: "indicador", width: 40 },
      { header: `Este ${periodWord}`, key: "actual", width: 14 },
      { header: `${isWeekly ? "Semana" : "Mes"} anterior`, key: "anterior", width: 16 },
      { header: "Cambio", key: "cambio", width: 12 },
    ],
    rows,
    4,
  )

  // ── Visitas por día ───────────────────────────────────────────────
  addTable(
    wb.addWorksheet("Visitas por día"),
    [
      { header: "Fecha", key: "date", width: 12 },
      { header: "Día", key: "weekday", width: 12 },
      { header: "Visitas", key: "visits", width: 10 },
      { header: "Clientes distintos", key: "uniqueClients", width: 18 },
      { header: "Nuevos", key: "newClients", width: 10 },
      { header: "Premios canjeados", key: "rewardsRedeemed", width: 18 },
      { header: "Hora pico", key: "peakHour", width: 10 },
    ],
    data.daily.map((d) => ({ ...d, weekday: capitalize(d.weekday), peakHour: d.peakHour ?? "" })),
  )

  // ── Semanas del mes (monthly) ─────────────────────────────────────
  if (data.monthly) {
    addTable(
      wb.addWorksheet("Semanas del mes"),
      [
        { header: "Semana", key: "label", width: 22 },
        { header: "Desde", key: "start", width: 12 },
        { header: "Hasta", key: "end", width: 12 },
        { header: "Visitas", key: "visits", width: 10 },
        { header: "Nuevos", key: "newClients", width: 10 },
        { header: "Premios canjeados", key: "rewardsRedeemed", width: 18 },
      ],
      data.monthly.weeks.map((w) => ({ ...w })),
    )
  }

  // ── Clientes del período ──────────────────────────────────────────
  addTable(
    wb.addWorksheet(isWeekly ? "Clientes de la semana" : "Clientes del mes"),
    [
      { header: "Nombre", key: "name", width: 26 },
      { header: `Visitas ${periodWord}`, key: "periodVisits", width: 14 },
      { header: "Visitas totales", key: "totalVisits", width: 14 },
      { header: "Última visita", key: "lastVisitAt", width: 20 },
      { header: progressHeader(data), key: "progress", width: 12 },
      { header: "Segmento", key: "segment", width: 14 },
      ...(data.tenant.programType === "points"
        ? [{ header: `Compras ${periodWord} (S/)`, key: "amount", width: 18 }]
        : [{ header: "Premio pendiente", key: "pendingReward", width: 16 }]),
    ],
    data.clients.map((c) => ({
      ...c,
      lastVisitAt: formatDateForExport(c.lastVisitAt, tz),
      pendingReward: c.pendingReward ? "Sí" : "No",
      amount: c.amount ?? "",
    })),
  )

  // ── Campañas (monthly) ────────────────────────────────────────────
  if (data.monthly) {
    addTable(
      wb.addWorksheet("Campañas"),
      [
        { header: "Campaña", key: "name", width: 32 },
        { header: "Enviada", key: "sentAt", width: 20 },
        { header: "Push enviados", key: "sentCount", width: 14 },
      ],
      data.campaigns.map((c) => ({ ...c, sentAt: formatDateForExport(c.sentAt, tz) })),
    )
  }

  // ── En riesgo ─────────────────────────────────────────────────────
  const riesgo = wb.addWorksheet("En riesgo")
  riesgo.getCell("A1").value = AT_RISK_NOTE
  riesgo.getCell("A1").alignment = { wrapText: true, vertical: "top" }
  riesgo.mergeCells("A1:F1")
  riesgo.getRow(1).height = 48
  addTable(
    riesgo,
    [
      { header: "Nombre", key: "name", width: 26 },
      { header: "Visitas totales", key: "totalVisits", width: 14 },
      { header: "Última visita", key: "lastVisitAt", width: 20 },
      { header: "Días sin venir", key: "daysSince", width: 14 },
      { header: progressHeader(data), key: "progress", width: 12 },
      { header: "Acción sugerida", key: "action", width: 40 },
    ],
    data.atRisk.map((c) => ({
      ...c,
      lastVisitAt: formatDateForExport(c.lastVisitAt, tz),
      action: 'Campaña "te extrañamos" con incentivo para volver',
    })),
    3,
  )

  // ── Cumpleaños (only when there is someone to list) ───────────────
  if (data.birthdays.length > 0) {
    addTable(
      wb.addWorksheet(isWeekly ? "Cumpleaños" : "Cumpleaños del mes"),
      [
        { header: "Nombre", key: "name", width: 26 },
        { header: "Cumpleaños", key: "date", width: 16 },
        { header: "Día", key: "weekday", width: 12 },
        { header: "Push automático", key: "autoPush", width: 18 },
      ],
      data.birthdays.map((b) => ({ ...b, date: dayLabel(b.date), weekday: capitalize(b.weekday) })),
    )
  }

  // ── Acumulado (monthly) ───────────────────────────────────────────
  if (data.monthly) addCumulativeSheets(wb, data.monthly.cumulative, data, tz)

  return Buffer.from(await wb.xlsx.writeBuffer())
}

/** Sheets of the all-time picture; also used standalone by the on-demand export. */
export function addCumulativeSheets(
  wb: ExcelJS.Workbook,
  c: Cumulative,
  data: Pick<ReportData, "tenant">,
  tz: string,
) {
  const hist = wb.addWorksheet("Resumen histórico")
  hist.getCell("A1").value = `${data.tenant.name} · desde ${c.sinceLabel}`
  hist.getCell("A1").font = { bold: true, size: 13 }
  addTable(
    hist,
    [
      { header: "Indicador", key: "k", width: 40 },
      { header: "Total", key: "v", width: 14 },
    ],
    [
      { k: "Visitas", v: c.totals.visits },
      { k: "Clientes registrados", v: c.totals.clients },
      { k: "Clientes con al menos una visita", v: c.totals.activeClients },
      { k: "Premios canjeados", v: c.totals.rewardsRedeemed },
      { k: "Promedio de visitas por cliente", v: c.totals.avgVisitsPerClient },
      {
        k: "Mejor mes",
        v: c.bestMonth ? `${capitalize(c.bestMonth.label)} (${c.bestMonth.visits} visitas)` : "",
      },
    ],
    3,
  )

  addTable(
    wb.addWorksheet("Mes a mes"),
    [
      { header: "Mes", key: "label", width: 18 },
      { header: "Visitas", key: "visits", width: 10 },
      { header: "Clientes nuevos", key: "newClients", width: 16 },
      { header: "Premios canjeados", key: "rewardsRedeemed", width: 18 },
    ],
    c.months.map((m) => ({ ...m, label: capitalize(m.label) })),
  )

  addTable(
    wb.addWorksheet("Top 20 histórico"),
    [
      { header: "Nombre", key: "name", width: 26 },
      { header: "Visitas totales", key: "totalVisits", width: 14 },
      { header: "Última visita", key: "lastVisitAt", width: 20 },
      {
        header: data.tenant.programType === "points" ? "Puntos" : "Sellos",
        key: "progress",
        width: 12,
      },
    ],
    c.topClients.map((t) => ({ ...t, lastVisitAt: formatDateForExport(t.lastVisitAt, tz) })),
  )

  addTable(
    wb.addWorksheet("Segmentos hoy"),
    [
      { header: "Segmento", key: "label", width: 18 },
      { header: "Clientes", key: "count", width: 10 },
    ],
    c.segments.map((s) => ({ ...s })),
  )
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

export { weekdayName }
