import ExcelJS from "exceljs"
import { formatDateForExport } from "@/lib/format-date"
import type { Cumulative, ReportData } from "./compute-report"
import { buildInsights, type Insight } from "./insights"
import { dayLabel, deltaShort, weekdayName } from "./period"

/**
 * The xlsx attached to the report, in the Cuik brand kit.
 *
 * Sheet 1 "Resumen" is the dashboard: KPI tiles, the ranked insights, and
 * compact tables with data bars (visits per day / week, how clients behave,
 * branches). The following sheets are the detail to act on: Insights,
 * Visitas por día, Sucursales, Cajeros, Clientes, En riesgo, Cumpleaños and,
 * monthly, the cumulative picture. No contact data (phones/emails) on
 * purpose — the panel is where you contact people.
 *
 * ExcelJS cannot embed native charts; data bars are used instead, which also
 * survive Google Sheets and Numbers.
 */

// ── Brand kit ──────────────────────────────────────────────────────
const C = {
  blue: "FF0E70DB",
  orange: "FFFF4810",
  ink: "FF231F20",
  surface: "FFF8F8F8",
  muted: "FF6B7280",
  line: "FFE5E7EB",
  white: "FFFFFFFF",
  green: "FF059669",
  red: "FFDC2626",
} as const
const FONT = "Poppins"

type Argb = string
type Sheet = ExcelJS.Worksheet

function font(
  size: number,
  opts: { bold?: boolean; color?: Argb; italic?: boolean } = {},
): Partial<ExcelJS.Font> {
  return {
    name: FONT,
    size,
    bold: opts.bold ?? false,
    italic: opts.italic ?? false,
    color: { argb: opts.color ?? C.ink },
  }
}

function fill(argb: Argb): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } }
}

const thin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: C.line } }
const boxBorder: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin }

function colLetter(n: number): string {
  let s = ""
  let x = n
  while (x > 0) {
    const m = (x - 1) % 26
    s = String.fromCharCode(65 + m) + s
    x = Math.floor((x - 1) / 26)
  }
  return s
}

function deltaColor(text: unknown): Argb {
  const t = String(text ?? "")
  if (t.startsWith("+")) return C.green
  if (t.startsWith("-")) return C.red
  return C.muted
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Blue data bar over a column range. */
function dataBar(sheet: Sheet, col: number, firstRow: number, lastRow: number) {
  if (lastRow < firstRow) return
  const L = colLetter(col)
  sheet.addConditionalFormatting({
    ref: `${L}${firstRow}:${L}${lastRow}`,
    rules: [
      {
        type: "dataBar",
        cfvo: [{ type: "min" }, { type: "max" }],
        color: { argb: C.blue },
        gradient: false,
        showValue: true,
        priority: 1,
      } as unknown as ExcelJS.ConditionalFormattingRule,
    ],
  })
}

// ── Table helper ───────────────────────────────────────────────────
type Col = {
  header: string
  key: string
  width?: number
  /** Excel number format for the column's data cells. */
  numFmt?: string
  /** Colour text by sign (+ green, - red). */
  delta?: boolean
  /** Draw a blue data bar behind the numbers. */
  bar?: boolean
  wrap?: boolean
  align?: "left" | "right" | "center"
}

type TableOpts = {
  startRow?: number
  /** Bold title above the table (with an optional muted subtitle). */
  title?: string
  subtitle?: string
  zebra?: boolean
  freeze?: boolean
  filter?: boolean
}

/** Renders a branded table and returns the row number after it. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one pass over header, rows and per-column options
function addTable(
  sheet: Sheet,
  columns: Col[],
  rows: Record<string, unknown>[],
  opts: TableOpts = {},
) {
  let r = opts.startRow ?? 1
  for (const [i, c] of columns.entries()) {
    const col = sheet.getColumn(i + 1)
    if (!col.width || (c.width && c.width > col.width)) col.width = c.width ?? 18
  }
  if (opts.title) {
    const cell = sheet.getCell(r, 1)
    cell.value = opts.title
    cell.font = font(13, { bold: true })
    r += 1
    if (opts.subtitle) {
      const sub = sheet.getCell(r, 1)
      sub.value = opts.subtitle
      sub.font = font(9, { color: C.muted })
      r += 1
    }
    r += 1
  }
  const headerRow = r
  const header = sheet.getRow(headerRow)
  for (const [i, c] of columns.entries()) {
    const cell = header.getCell(i + 1)
    cell.value = c.header
    cell.font = font(10, { bold: true, color: C.white })
    cell.fill = fill(C.blue)
    cell.alignment = { vertical: "middle", horizontal: c.align ?? "left", wrapText: true }
    cell.border = boxBorder
  }
  header.height = 22
  r += 1
  const firstData = r
  for (const [ri, row] of rows.entries()) {
    const excelRow = sheet.getRow(r)
    for (const [i, c] of columns.entries()) {
      const cell = excelRow.getCell(i + 1)
      const v = row[c.key]
      cell.value = (v ?? "") as ExcelJS.CellValue
      cell.font = font(10, { color: c.delta ? deltaColor(v) : C.ink, bold: Boolean(c.delta && v) })
      cell.border = boxBorder
      cell.alignment = {
        vertical: "top",
        horizontal: c.align ?? (typeof v === "number" ? "right" : "left"),
        wrapText: c.wrap ?? false,
      }
      if (c.numFmt && typeof v === "number") cell.numFmt = c.numFmt
      if ((opts.zebra ?? true) && ri % 2 === 1) cell.fill = fill(C.surface)
    }
    r += 1
  }
  const lastData = r - 1
  for (const [i, c] of columns.entries()) {
    if (c.bar && rows.length > 0) dataBar(sheet, i + 1, firstData, lastData)
  }
  if (opts.filter && rows.length > 0) {
    sheet.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: lastData, column: columns.length },
    }
  }
  if (opts.freeze) sheet.views = [{ state: "frozen", ySplit: headerRow }]
  return r + 1
}

function detailSheet(wb: ExcelJS.Workbook, name: string): Sheet {
  const sheet = wb.addWorksheet(name, {
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0, orientation: "landscape" },
  })
  sheet.properties.defaultRowHeight = 18
  return sheet
}

// ── Dashboard pieces ───────────────────────────────────────────────
function band(sheet: Sheet, row: number, cols: number, text: string, sub?: string) {
  sheet.mergeCells(row, 1, row, cols)
  const cell = sheet.getCell(row, 1)
  cell.value = text
  cell.font = font(16, { bold: true, color: C.white })
  cell.fill = fill(C.blue)
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 }
  sheet.getRow(row).height = 34
  if (sub) {
    sheet.mergeCells(row + 1, 1, row + 1, cols)
    const s = sheet.getCell(row + 1, 1)
    s.value = sub
    s.font = font(9, { color: C.white })
    s.fill = fill(C.blue)
    s.alignment = { vertical: "middle", horizontal: "left", indent: 1 }
    sheet.getRow(row + 1).height = 18
  }
}

function sectionLabel(sheet: Sheet, row: number, text: string, cols: number) {
  sheet.mergeCells(row, 1, row, cols)
  const cell = sheet.getCell(row, 1)
  cell.value = text.toUpperCase()
  cell.font = font(9, { bold: true, color: C.muted })
  cell.alignment = { vertical: "bottom" }
  cell.border = { bottom: { style: "thin", color: { argb: C.line } } }
  sheet.getRow(row).height = 20
}

type Tile = {
  label: string
  value: string | number
  numFmt?: string
  delta?: string
  direction?: "up" | "down" | "flat"
  hint?: string
}

/** Four tiles across 8 columns (two columns each), three rows tall. */
function tileRow(sheet: Sheet, top: number, tiles: Tile[]) {
  for (const [i, t] of tiles.slice(0, 4).entries()) {
    const c1 = i * 2 + 1
    const c2 = c1 + 1
    for (let r = top; r <= top + 2; r++) {
      sheet.mergeCells(r, c1, r, c2)
      const cell = sheet.getCell(r, c1)
      cell.fill = fill(C.surface)
      cell.border = {
        top: r === top ? thin : undefined,
        bottom: r === top + 2 ? thin : undefined,
        left: thin,
        right: thin,
      }
    }
    const label = sheet.getCell(top, c1)
    label.value = t.label
    label.font = font(9, { color: C.muted })
    label.alignment = { vertical: "bottom", horizontal: "left", indent: 1 }
    const value = sheet.getCell(top + 1, c1)
    value.value = t.value
    if (t.numFmt && typeof t.value === "number") value.numFmt = t.numFmt
    value.font = font(20, { bold: true, color: C.blue })
    value.alignment = { vertical: "middle", horizontal: "left", indent: 1 }
    const delta = sheet.getCell(top + 2, c1)
    delta.value = t.delta ?? t.hint ?? ""
    const color = t.direction === "up" ? C.green : t.direction === "down" ? C.red : C.muted
    delta.font = font(9, { color: t.delta ? color : C.muted, bold: Boolean(t.delta) })
    delta.alignment = { vertical: "top", horizontal: "left", indent: 1 }
  }
  sheet.getRow(top).height = 16
  sheet.getRow(top + 1).height = 30
  sheet.getRow(top + 2).height = 16
}

function insightRows(sheet: Sheet, top: number, insights: Insight[], cols: number): number {
  let r = top
  for (const i of insights) {
    const mark = sheet.getCell(r, 1)
    mark.value = i.tone === "good" ? "▲" : i.tone === "warn" ? "▼" : "•"
    mark.font = font(12, {
      bold: true,
      color: i.tone === "good" ? C.green : i.tone === "warn" ? C.orange : C.muted,
    })
    mark.alignment = { vertical: "top", horizontal: "center" }
    sheet.mergeCells(r, 2, r, cols)
    const text = sheet.getCell(r, 2)
    text.value = {
      richText: [
        { text: `${i.title}. `, font: font(10, { bold: true }) },
        { text: `${i.what} `, font: font(10) },
        { text: i.action, font: font(10, { color: C.muted }) },
      ],
    }
    text.alignment = { vertical: "top", wrapText: true }
    sheet.getRow(r).height = Math.max(
      30,
      Math.ceil((i.title.length + i.what.length + i.action.length) / 95) * 15,
    )
    r += 1
  }
  return r
}

/** Compact table inside the dashboard (keeps the sheet's column widths). */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: same shape as addTable, with column spans
function miniTable(
  sheet: Sheet,
  top: number,
  columns: Array<Col & { col: number; span?: number }>,
  rows: Record<string, unknown>[],
): number {
  const header = sheet.getRow(top)
  for (const c of columns) {
    if (c.span && c.span > 1) sheet.mergeCells(top, c.col, top, c.col + c.span - 1)
    const cell = header.getCell(c.col)
    cell.value = c.header
    cell.font = font(9, { bold: true, color: C.white })
    cell.fill = fill(C.blue)
    cell.alignment = { vertical: "middle", horizontal: c.align ?? "left", indent: 1 }
  }
  header.height = 18
  let r = top + 1
  for (const [ri, row] of rows.entries()) {
    const excelRow = sheet.getRow(r)
    for (const c of columns) {
      if (c.span && c.span > 1) sheet.mergeCells(r, c.col, r, c.col + c.span - 1)
      const cell = excelRow.getCell(c.col)
      const v = row[c.key]
      cell.value = (v ?? "") as ExcelJS.CellValue
      cell.font = font(10, { color: c.delta ? deltaColor(v) : C.ink, bold: Boolean(c.delta && v) })
      cell.alignment = {
        vertical: "middle",
        horizontal: c.align ?? (typeof v === "number" ? "right" : "left"),
        indent: 1,
      }
      if (c.numFmt && typeof v === "number") cell.numFmt = c.numFmt
      cell.border = { bottom: thin }
      if (ri % 2 === 1) cell.fill = fill(C.surface)
    }
    r += 1
  }
  for (const c of columns) {
    if (c.bar && rows.length > 0) dataBar(sheet, c.col, top + 1, r - 1)
  }
  return r + 1
}

// ── Public API ─────────────────────────────────────────────────────
export function reportFilename(data: ReportData): string {
  const kind = data.kind === "weekly" ? "semana" : "mes"
  return `${data.tenant.slug}-${kind}-${data.period.key}.xlsx`
}

function progressHeader(data: ReportData): string {
  return data.tenant.programType === "points" ? "Puntos" : "Sellos"
}

const AT_RISK_NOTE =
  "Estos clientes solían venir seguido y dejaron de hacerlo. " +
  "Recomendamos enviarles una campaña push con un incentivo para regresar (por ejemplo, un sello extra en su próxima visita). " +
  "Desde el panel: Campañas → Nueva campaña → segmento En riesgo."

const CASHIERS_NOTE =
  '"Días activos" = días del período en que la persona registró al menos una visita.'

type Dir = "up" | "down" | "flat"
function dir(current: number | null, previous: number | null): Dir {
  if (current == null || previous == null || previous === 0) return "flat"
  return current > previous ? "up" : current < previous ? "down" : "flat"
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one linear pass that lays out every sheet of the workbook
export async function buildReportXlsx(data: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Cuik"
  wb.created = new Date()
  const tz = data.tenant.timezone
  const isWeekly = data.kind === "weekly"
  const periodWord = isWeekly ? "semana" : "mes"
  const prevWord = isWeekly ? "Semana anterior" : "Mes anterior"
  const isPoints = data.tenant.programType === "points"
  const rewardsWord = isPoints ? "Canjes" : "Premios canjeados"
  const insights = buildInsights(data)

  // ═══════════════ Resumen (dashboard) ═══════════════
  const dash = wb.addWorksheet("Resumen", {
    views: [{ showGridLines: false }],
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0, orientation: "portrait" },
  })
  const COLS = 8
  for (let c = 1; c <= COLS; c++) dash.getColumn(c).width = 15
  dash.getColumn(1).width = 16

  band(
    dash,
    1,
    COLS,
    `${data.tenant.name} · Reporte ${isWeekly ? "semanal" : "mensual"}`,
    `${capitalize(data.periodLabel)} · comparado con ${data.compareLabel} · hora local del comercio (${tz})`,
  )

  let r = 4
  sectionLabel(dash, r, "Indicadores clave", COLS)
  r += 1
  const k = data.kpis
  const kpiTile = (label: string, kp: ReportData["kpis"]["visits"]): Tile => ({
    label,
    value: kp.current,
    numFmt: "#,##0",
    delta: `${deltaShort(kp.current, kp.previous)} · antes ${kp.previous}`,
    direction: kp.delta.direction,
  })
  tileRow(dash, r, [
    kpiTile("Visitas", k.visits),
    kpiTile("Clientes distintos", k.uniqueClients),
    kpiTile("Clientes nuevos", k.newClients),
    kpiTile(rewardsWord, k.rewardsRedeemed),
  ])
  r += 4

  const d = data.signals.depth
  const passPct =
    d.funnel.registered > 0 ? Math.round((d.funnel.withPass / d.funnel.registered) * 100) : 0
  const ticketTile: Tile = {
    label: "Ticket promedio",
    value: d.ticket.current ?? "—",
    numFmt: '"S/ "#,##0.00',
    delta:
      d.ticket.current != null && d.ticket.previous != null
        ? `${deltaShort(Math.round(d.ticket.current * 100), Math.round(d.ticket.previous * 100))} · antes S/ ${d.ticket.previous.toFixed(2)}`
        : undefined,
    direction: dir(d.ticket.current, d.ticket.previous),
    hint: `${d.ticket.visitsWithAmount} compras con monto`,
  }
  const riskTile: Tile = {
    label: "Clientes en riesgo",
    value: data.atRisk.length,
    numFmt: "#,##0",
    hint: "al cierre del período",
  }
  tileRow(dash, r, [
    {
      label: "Visitas por cliente",
      value: d.frequency.current,
      numFmt: "0.0",
      delta: d.frequency.previous > 0 ? `antes ${d.frequency.previous}` : undefined,
      direction: dir(d.frequency.current, d.frequency.previous),
      hint: d.medianDaysBetween != null ? `${d.medianDaysBetween} días entre visitas` : "sin dato",
    },
    {
      label: "Segunda visita (30 días)",
      value: d.secondVisit.cohort > 0 ? `${d.secondVisit.pct} %` : "—",
      hint:
        d.secondVisit.cohort > 0
          ? `${d.secondVisit.returned} de ${d.secondVisit.cohort} que empezaron hace 1-2 meses`
          : "aún sin clientes de hace 1-2 meses",
    },
    {
      label: "Con pase instalado",
      value: d.funnel.registered > 0 ? `${passPct} %` : "—",
      hint: `${d.funnel.withPass} de ${d.funnel.registered} registrados`,
    },
    isPoints || d.ticket.current != null ? ticketTile : riskTile,
  ])
  r += 4

  // Insights
  if (insights.length > 0) {
    sectionLabel(dash, r, "Lo más importante", COLS)
    r += 1
    r = insightRows(dash, r, insights.slice(0, 5), COLS)
    if (insights.length > 5) {
      const more = dash.getCell(r, 2)
      more.value = `${insights.length - 5} más en la hoja "Insights".`
      more.font = font(9, { color: C.muted, italic: true })
      r += 1
    }
    r += 1
  }

  // Visits per day (weekly) / per week (monthly)
  sectionLabel(dash, r, isWeekly ? "Visitas por día" : "Visitas por semana", COLS)
  r += 1
  if (isWeekly || !data.monthly) {
    r = miniTable(
      dash,
      r,
      [
        { header: "Día", key: "day", col: 1, span: 2 },
        { header: "Visitas", key: "visits", col: 3, span: 2, bar: true, numFmt: "#,##0" },
        { header: "Clientes", key: "uniqueClients", col: 5, numFmt: "#,##0" },
        { header: "Nuevos", key: "newClients", col: 6, numFmt: "#,##0" },
        { header: rewardsWord, key: "rewardsRedeemed", col: 7, numFmt: "#,##0" },
        { header: "Hora pico", key: "peakHour", col: 8, align: "center" },
      ],
      data.daily.map((x) => ({
        day: `${capitalize(x.weekday)} ${dayLabel(x.date).split(" de ")[0]}`,
        visits: x.visits,
        uniqueClients: x.uniqueClients,
        newClients: x.newClients,
        rewardsRedeemed: x.rewardsRedeemed,
        peakHour: x.peakHour ?? "",
      })),
    )
  } else {
    r = miniTable(
      dash,
      r,
      [
        { header: "Semana", key: "label", col: 1, span: 3 },
        { header: "Visitas", key: "visits", col: 4, span: 2, bar: true, numFmt: "#,##0" },
        { header: "Nuevos", key: "newClients", col: 6, numFmt: "#,##0" },
        { header: rewardsWord, key: "rewardsRedeemed", col: 7, span: 2, numFmt: "#,##0" },
      ],
      data.monthly.weeks.map((w) => ({ ...w })),
    )
  }

  // How clients behave
  sectionLabel(dash, r, "Cómo se comportan tus clientes", COLS)
  r += 1
  const b = d.buckets
  const bucketTotal = b.one + b.twoThree + b.fourSeven + b.eightPlus
  const bp = (n: number) => (bucketTotal > 0 ? `${Math.round((n / bucketTotal) * 100)} %` : "—")
  r = miniTable(
    dash,
    r,
    [
      { header: `Visitas en ${isWeekly ? "la semana" : "el mes"}`, key: "label", col: 1, span: 3 },
      { header: "Clientes", key: "n", col: 4, span: 2, bar: true, numFmt: "#,##0" },
      { header: "%", key: "pct", col: 6, align: "right" },
    ],
    [
      { label: "1 visita", n: b.one, pct: bp(b.one) },
      { label: "2 a 3 visitas", n: b.twoThree, pct: bp(b.twoThree) },
      { label: "4 a 7 visitas", n: b.fourSeven, pct: bp(b.fourSeven) },
      { label: "8 o más", n: b.eightPlus, pct: bp(b.eightPlus) },
    ],
  )
  const f = d.funnel
  const fp = (n: number) => (f.registered > 0 ? `${Math.round((n / f.registered) * 100)} %` : "—")
  r = miniTable(
    dash,
    r,
    [
      { header: "Embudo (al cierre)", key: "label", col: 1, span: 3 },
      { header: "Clientes", key: "n", col: 4, span: 2, bar: true, numFmt: "#,##0" },
      { header: "%", key: "pct", col: 6, align: "right" },
      { header: `Nuevos ${periodWord}`, key: "nuevos", col: 7, span: 2, numFmt: "#,##0" },
    ],
    [
      { label: "Registrados", n: f.registered, pct: fp(f.registered), nuevos: f.newRegistered },
      { label: "Con pase instalado", n: f.withPass, pct: fp(f.withPass), nuevos: f.newWithPass },
      {
        label: "Con al menos una visita",
        n: f.withVisit,
        pct: fp(f.withVisit),
        nuevos: f.newWithVisit,
      },
    ],
  )
  if (d.timeToFirstReward.medianDays != null && d.timeToFirstReward.clients >= 3) {
    dash.mergeCells(r, 1, r, COLS)
    const cell = dash.getCell(r, 1)
    cell.value = `Del registro al primer ${isPoints ? "canje" : "premio"} pasan ${d.timeToFirstReward.medianDays} días (mediana sobre ${d.timeToFirstReward.clients} clientes).`
    cell.font = font(10, { color: C.muted })
    r += 2
  }

  // Branches
  if (data.team.showBranches) {
    sectionLabel(dash, r, "Sucursales", COLS)
    r += 1
    r = miniTable(
      dash,
      r,
      [
        { header: "Sucursal", key: "name", col: 1, span: 3 },
        {
          header: `Visitas ${periodWord}`,
          key: "visits",
          col: 4,
          span: 2,
          bar: true,
          numFmt: "#,##0",
        },
        { header: "% del total", key: "share", col: 6, align: "right" },
        { header: "Cambio", key: "change", col: 7, delta: true, align: "right" },
        { header: "Nuevos", key: "newClients", col: 8, numFmt: "#,##0" },
      ],
      data.team.branches.map((x) => ({
        name: x.id === null || x.active ? x.name : `${x.name} (inactiva)`,
        visits: x.visits,
        share: `${x.share} %`,
        change: deltaShort(x.visits, x.previousVisits),
        newClients: x.newClients,
      })),
    )
  }

  // Footer
  dash.mergeCells(r, 1, r, COLS)
  const foot = dash.getCell(r, 1)
  foot.value = "Cuik · cuik.org · El detalle para actuar está en las hojas siguientes."
  foot.font = font(9, { color: C.muted, italic: true })

  // ═══════════════ Insights ═══════════════
  if (insights.length > 0) {
    addTable(
      detailSheet(wb, "Insights"),
      [
        { header: "#", key: "prio", width: 5, align: "center" },
        { header: "Tema", key: "title", width: 34, wrap: true },
        { header: "Qué pasó", key: "what", width: 55, wrap: true },
        { header: "Por qué importa", key: "why", width: 55, wrap: true },
        { header: "Qué hacer", key: "action", width: 55, wrap: true },
      ],
      insights.map((i, idx) => ({
        prio: idx + 1,
        title: `${i.tone === "good" ? "▲ " : i.tone === "warn" ? "▼ " : ""}${i.title}`,
        what: i.what,
        why: i.why,
        action: i.action,
      })),
      {
        title: "Lo más importante, en orden de prioridad",
        subtitle: "Cada fila: qué pasó, por qué importa y qué hacer. ▲ va bien · ▼ atención.",
        freeze: true,
      },
    )
  }

  // ═══════════════ Visitas por día ═══════════════
  addTable(
    detailSheet(wb, "Visitas por día"),
    [
      { header: "Fecha", key: "date", width: 12 },
      { header: "Día", key: "weekday", width: 12 },
      { header: "Visitas", key: "visits", width: 12, bar: true, numFmt: "#,##0" },
      { header: "Clientes distintos", key: "uniqueClients", width: 18, numFmt: "#,##0" },
      { header: "Nuevos", key: "newClients", width: 10, numFmt: "#,##0" },
      { header: rewardsWord, key: "rewardsRedeemed", width: 18, numFmt: "#,##0" },
      { header: "Hora pico", key: "peakHour", width: 10, align: "center" },
    ],
    data.daily.map((x) => ({ ...x, weekday: capitalize(x.weekday), peakHour: x.peakHour ?? "" })),
    { title: `Visitas por día · ${capitalize(data.periodLabel)}`, freeze: true, filter: true },
  )

  // ═══════════════ Semanas del mes ═══════════════
  if (data.monthly) {
    addTable(
      detailSheet(wb, "Semanas del mes"),
      [
        { header: "Semana", key: "label", width: 22 },
        { header: "Desde", key: "start", width: 12 },
        { header: "Hasta", key: "end", width: 12 },
        { header: "Visitas", key: "visits", width: 12, bar: true, numFmt: "#,##0" },
        { header: "Nuevos", key: "newClients", width: 10, numFmt: "#,##0" },
        { header: rewardsWord, key: "rewardsRedeemed", width: 18, numFmt: "#,##0" },
      ],
      data.monthly.weeks.map((w) => ({ ...w })),
      { title: "Semanas del mes", freeze: true },
    )
  }

  // ═══════════════ Sucursales / Cajeros ═══════════════
  if (data.team.showBranches) {
    addTable(
      detailSheet(wb, "Sucursales"),
      [
        { header: "Sucursal", key: "name", width: 28 },
        { header: `Visitas ${periodWord}`, key: "visits", width: 14, bar: true, numFmt: "#,##0" },
        { header: prevWord, key: "previousVisits", width: 16, numFmt: "#,##0" },
        { header: "Cambio", key: "change", width: 12, delta: true, align: "right" },
        { header: "% del total", key: "share", width: 12, align: "right" },
        { header: "Clientes distintos", key: "uniqueClients", width: 18, numFmt: "#,##0" },
        { header: "Clientes nuevos", key: "newClients", width: 16, numFmt: "#,##0" },
      ],
      data.team.branches.map((x) => ({
        name: x.id === null || x.active ? x.name : `${x.name} (inactiva)`,
        visits: x.visits,
        previousVisits: x.previousVisits,
        change: deltaShort(x.visits, x.previousVisits),
        share: `${x.share} %`,
        uniqueClients: x.uniqueClients,
        newClients: x.newClients,
      })),
      { title: "Visitas por sucursal", freeze: true, filter: true },
    )
  }
  if (data.team.showCashiers) {
    addTable(
      detailSheet(wb, "Cajeros"),
      [
        { header: "Nombre", key: "name", width: 26 },
        { header: "Rol", key: "role", width: 10 },
        { header: `Visitas ${periodWord}`, key: "visits", width: 14, bar: true, numFmt: "#,##0" },
        { header: prevWord, key: "previousVisits", width: 16, numFmt: "#,##0" },
        { header: "Cambio", key: "change", width: 12, delta: true, align: "right" },
        { header: "Días activos", key: "activeDays", width: 12, numFmt: "#,##0" },
        { header: "Visitas por día activo", key: "perActiveDay", width: 20, numFmt: "0.0" },
        { header: "Clientes nuevos", key: "newClients", width: 16, numFmt: "#,##0" },
        { header: "Última visita registrada", key: "lastVisitAt", width: 22 },
        { header: "Observación", key: "note", width: 36, wrap: true },
      ],
      data.team.cashiers.map((c) => ({
        name: c.name,
        role: c.role,
        visits: c.visits,
        previousVisits: c.previousVisits,
        change: deltaShort(c.visits, c.previousVisits),
        activeDays: c.activeDays,
        perActiveDay: c.perActiveDay,
        newClients: c.newClients,
        lastVisitAt: formatDateForExport(c.lastVisitAt, tz),
        note:
          c.visits === 0
            ? `No registró visitas ${isWeekly ? "esta semana" : "este mes"}`
            : c.previousVisits > 0 && c.visits < c.previousVisits / 2
              ? "Cayó a menos de la mitad"
              : "",
      })),
      { title: "Visitas por cajero", subtitle: CASHIERS_NOTE, freeze: true, filter: true },
    )
  }

  // ═══════════════ Clientes del período ═══════════════
  addTable(
    detailSheet(wb, isWeekly ? "Clientes de la semana" : "Clientes del mes"),
    [
      { header: "Nombre", key: "name", width: 26 },
      {
        header: `Visitas ${periodWord}`,
        key: "periodVisits",
        width: 14,
        bar: true,
        numFmt: "#,##0",
      },
      { header: "Visitas totales", key: "totalVisits", width: 14, numFmt: "#,##0" },
      { header: "Última visita", key: "lastVisitAt", width: 20 },
      { header: progressHeader(data), key: "progress", width: 12, align: "right" },
      { header: "Segmento", key: "segment", width: 14 },
      ...(isPoints
        ? [
            {
              header: `Compras ${periodWord} (S/)`,
              key: "amount",
              width: 18,
              numFmt: '"S/ "#,##0.00',
            },
          ]
        : [
            {
              header: "Premio pendiente",
              key: "pendingReward",
              width: 16,
              align: "center" as const,
            },
          ]),
    ],
    data.clients.map((c) => ({
      ...c,
      lastVisitAt: formatDateForExport(c.lastVisitAt, tz),
      pendingReward: c.pendingReward ? "Sí" : "No",
      amount: c.amount ?? "",
    })),
    {
      title: isWeekly ? "Clientes que visitaron esta semana" : "Clientes que visitaron este mes",
      subtitle:
        "Ordenados por visitas del período. Sin teléfonos ni correos: contáctalos desde el panel.",
      freeze: true,
      filter: true,
    },
  )

  // ═══════════════ Campañas (monthly) ═══════════════
  if (data.monthly) {
    addTable(
      detailSheet(wb, "Campañas"),
      [
        { header: "Campaña", key: "name", width: 32 },
        { header: "Enviada", key: "sentAt", width: 20 },
        { header: "Push enviados", key: "sentCount", width: 14, numFmt: "#,##0" },
        { header: "Visitas 48 h después", key: "after", width: 20, numFmt: "#,##0" },
        { header: "Esperado", key: "expected", width: 12, numFmt: "0.0" },
        { header: "Efecto", key: "lift", width: 12, delta: true, align: "right" },
      ],
      data.campaigns.map((c) => {
        const lift = data.signals.campaignLift.find((l) => l.name === c.name)
        return {
          ...c,
          sentAt: formatDateForExport(c.sentAt, tz),
          after: lift?.visitsAfter ?? "",
          expected: lift?.expected ?? "",
          lift: lift?.liftPct != null ? `${lift.liftPct > 0 ? "+" : ""}${lift.liftPct} %` : "",
        }
      }),
      {
        title: "Campañas push del mes",
        subtitle:
          "Efecto = visitas en las 48 horas siguientes al envío frente a lo esperado en cualquier ventana de 48 horas.",
        freeze: true,
      },
    )
  }

  // ═══════════════ En riesgo ═══════════════
  if (data.atRisk.length > 0) {
    addTable(
      detailSheet(wb, "En riesgo"),
      [
        { header: "Nombre", key: "name", width: 26 },
        { header: "Visitas totales", key: "totalVisits", width: 14, bar: true, numFmt: "#,##0" },
        { header: "Última visita", key: "lastVisitAt", width: 20 },
        { header: "Días sin venir", key: "daysSince", width: 14, numFmt: "#,##0" },
        { header: progressHeader(data), key: "progress", width: 12, align: "right" },
        { header: "Acción sugerida", key: "action", width: 40 },
      ],
      data.atRisk.map((c) => ({
        ...c,
        lastVisitAt: formatDateForExport(c.lastVisitAt, tz),
        action: 'Campaña "te extrañamos" con incentivo para volver',
      })),
      { title: "Clientes en riesgo", subtitle: AT_RISK_NOTE, freeze: true, filter: true },
    )
  }

  // ═══════════════ Cumpleaños ═══════════════
  if (data.birthdays.length > 0) {
    addTable(
      detailSheet(wb, isWeekly ? "Cumpleaños" : "Cumpleaños del mes"),
      [
        { header: "Nombre", key: "name", width: 26 },
        { header: "Cumpleaños", key: "date", width: 16 },
        { header: "Día", key: "weekday", width: 12 },
        { header: "Push automático", key: "autoPush", width: 18 },
      ],
      data.birthdays.map((x) => ({ ...x, date: dayLabel(x.date), weekday: capitalize(x.weekday) })),
      {
        title: isWeekly ? "Cumpleaños de la semana que empieza" : "Cumpleaños del mes que empieza",
      },
    )
  }

  // ═══════════════ Acumulado (monthly) ═══════════════
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
  addTable(
    detailSheet(wb, "Resumen histórico"),
    [
      { header: "Indicador", key: "k", width: 40 },
      { header: "Total", key: "v", width: 24, align: "right" },
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
    { title: `${data.tenant.name} · desde ${c.sinceLabel}` },
  )

  addTable(
    detailSheet(wb, "Mes a mes"),
    [
      { header: "Mes", key: "label", width: 18 },
      { header: "Visitas", key: "visits", width: 12, bar: true, numFmt: "#,##0" },
      { header: "Clientes nuevos", key: "newClients", width: 16, numFmt: "#,##0" },
      { header: "Premios canjeados", key: "rewardsRedeemed", width: 18, numFmt: "#,##0" },
    ],
    c.months.map((m) => ({ ...m, label: capitalize(m.label) })),
    { title: "Mes a mes", freeze: true },
  )

  addTable(
    detailSheet(wb, "Top 20 histórico"),
    [
      { header: "Nombre", key: "name", width: 26 },
      { header: "Visitas totales", key: "totalVisits", width: 14, bar: true, numFmt: "#,##0" },
      { header: "Última visita", key: "lastVisitAt", width: 20 },
      {
        header: data.tenant.programType === "points" ? "Puntos" : "Sellos",
        key: "progress",
        width: 12,
        align: "right",
      },
    ],
    c.topClients.map((t) => ({ ...t, lastVisitAt: formatDateForExport(t.lastVisitAt, tz) })),
    { title: "Tus 20 clientes históricos", freeze: true },
  )

  addTable(
    detailSheet(wb, "Segmentos hoy"),
    [
      { header: "Segmento", key: "label", width: 18 },
      { header: "Clientes", key: "count", width: 12, bar: true, numFmt: "#,##0" },
    ],
    c.segments.map((s) => ({ ...s })),
    { title: "Segmentos hoy" },
  )
}

export { weekdayName }
