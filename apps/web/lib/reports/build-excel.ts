import ExcelJS from "exceljs"
import { formatDateForExport } from "@/lib/format-date"
import { actItems, happenedItems } from "./compose-email"
import type { Cumulative, ReportData } from "./compute-report"
import { buildInsights, type Insight } from "./insights"
import { dayLabel, deltaShort, weekdayName } from "./period"

/**
 * The xlsx attached to the report, in the Cuik brand kit.
 *
 * Sheet 1 "Resumen" is the dashboard: KPI tiles, the ranked insights, what
 * happened, visits per day / week, loyal clients, how clients behave, points
 * usage, branches and what to act on. The following sheets are the detail:
 * Insights, Sucursales, Cajeros, Clientes, Campañas, En riesgo, Cumpleaños
 * and, monthly, Visitas por día, Semanas del mes and the cumulative picture.
 * No contact data (phones/emails) on purpose — the panel is where you
 * contact people.
 *
 * ExcelJS cannot embed native charts, so every "chart" is a data bar whose
 * 100 % is the sum of the column (share of the total), coloured green /
 * yellow / red by size relative to the largest value.
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
  green: "FF16A34A",
  yellow: "FFF59E0B",
  red: "FFDC2626",
} as const
const FONT = "Poppins"
/** Approximate characters per Excel width unit at Poppins 10. */
const CHARS_PER_UNIT = 0.95

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

/** Row height (points) for `text` wrapped inside `widthUnits` columns. */
function wrappedHeight(text: string, widthUnits: number, lineHeight = 15, min = 18): number {
  const perLine = Math.max(10, Math.floor(widthUnits * CHARS_PER_UNIT))
  const lines = text
    .split("\n")
    .reduce((n, part) => n + Math.max(1, Math.ceil(part.length / perLine)), 0)
  return Math.max(min, lines * lineHeight + 6)
}

/**
 * "Chart" bars: one rule per cell so each bar can have its own colour.
 * Length = value / sum of the column (100 % = the total); colour by size
 * relative to the largest value (green ≥ 2/3, yellow ≥ 1/3, red below).
 */
function shareBars(
  sheet: Sheet,
  col: number,
  firstRow: number,
  values: number[],
  fixedTotal?: number,
) {
  const total = fixedTotal ?? values.reduce((a, b) => a + b, 0)
  const max = fixedTotal ?? Math.max(0, ...values)
  if (total <= 0 || max <= 0) return
  const L = colLetter(col)
  values.forEach((v, i) => {
    if (v <= 0) return
    const ratio = v / max
    const color = ratio >= 2 / 3 ? C.green : ratio >= 1 / 3 ? C.yellow : C.red
    const row = firstRow + i
    sheet.addConditionalFormatting({
      ref: `${L}${row}:${L}${row}`,
      rules: [
        {
          type: "dataBar",
          cfvo: [
            { type: "num", value: 0 },
            { type: "num", value: total },
          ],
          color: { argb: color },
          gradient: false,
          showValue: true,
          priority: 1,
        } as unknown as ExcelJS.ConditionalFormattingRule,
      ],
    })
  })
}

/** White → blue colour scale over a block (the "heat map"). */
function heatScale(
  sheet: Sheet,
  fromCol: number,
  toCol: number,
  firstRow: number,
  lastRow: number,
) {
  if (lastRow < firstRow) return
  sheet.addConditionalFormatting({
    ref: `${colLetter(fromCol)}${firstRow}:${colLetter(toCol)}${lastRow}`,
    rules: [
      {
        type: "colorScale",
        cfvo: [{ type: "num", value: 0 }, { type: "max" }],
        color: [{ argb: C.white }, { argb: C.blue }],
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
  /** Draw share bars behind the numbers (100 % = column total, or `barTotal`). */
  bar?: boolean
  barTotal?: number
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

function headerHeight(
  columns: Array<{ header: string; width?: number }>,
  widthOf: (i: number) => number,
) {
  let lines = 1
  for (const [i, c] of columns.entries()) {
    const perLine = Math.max(6, Math.floor(widthOf(i) * CHARS_PER_UNIT))
    lines = Math.max(lines, Math.ceil(c.header.length / perLine))
  }
  return Math.max(22, lines * 14 + 10)
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
    sheet.getRow(r).height = 24
    r += 1
    if (opts.subtitle) {
      sheet.mergeCells(r, 1, r, Math.max(columns.length, 4))
      const sub = sheet.getCell(r, 1)
      sub.value = opts.subtitle
      sub.font = font(9, { color: C.muted })
      sub.alignment = { wrapText: true, vertical: "top" }
      const width = columns.reduce((acc, c) => acc + (c.width ?? 18), 0)
      sheet.getRow(r).height = wrappedHeight(opts.subtitle, width, 13, 16)
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
    cell.alignment = {
      vertical: "middle",
      horizontal: c.align ?? "left",
      wrapText: true,
      indent: 1,
    }
    cell.border = boxBorder
  }
  header.height = headerHeight(columns, (i) => columns[i].width ?? 18)
  r += 1
  const firstData = r
  for (const [ri, row] of rows.entries()) {
    const excelRow = sheet.getRow(r)
    let tallest = 18
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
        indent: 1,
      }
      if (c.numFmt && typeof v === "number") cell.numFmt = c.numFmt
      if ((opts.zebra ?? true) && ri % 2 === 1) cell.fill = fill(C.surface)
      if (c.wrap && typeof v === "string") {
        tallest = Math.max(tallest, wrappedHeight(v, c.width ?? 18))
      }
    }
    excelRow.height = tallest
    r += 1
  }
  const lastData = r - 1
  for (const [i, c] of columns.entries()) {
    if (c.bar && rows.length > 0) {
      shareBars(
        sheet,
        i + 1,
        firstData,
        rows.map((row) => Number(row[c.key] ?? 0) || 0),
        c.barTotal,
      )
    }
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
const COLS = 8
/** Column widths of the dashboard: a wide label column and seven regular ones. */
const DASH_WIDTHS = [22, 14, 14, 14, 14, 14, 14, 14]
const DASH_WIDTH = DASH_WIDTHS.reduce((a, b) => a + b, 0)
function spanWidth(fromCol: number, span: number): number {
  let w = 0
  for (let c = fromCol; c < fromCol + span; c++) w += DASH_WIDTHS[c - 1] ?? 14
  return w
}

function band(sheet: Sheet, row: number, text: string, sub?: string) {
  sheet.mergeCells(row, 1, row, COLS)
  const cell = sheet.getCell(row, 1)
  cell.value = text
  cell.font = font(16, { bold: true, color: C.white })
  cell.fill = fill(C.blue)
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 }
  sheet.getRow(row).height = 34
  if (sub) {
    sheet.mergeCells(row + 1, 1, row + 1, COLS)
    const s = sheet.getCell(row + 1, 1)
    s.value = sub
    s.font = font(9, { color: C.white })
    s.fill = fill(C.blue)
    s.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true }
    sheet.getRow(row + 1).height = wrappedHeight(sub, DASH_WIDTH, 13, 18)
  }
}

function sectionLabel(sheet: Sheet, row: number, text: string) {
  sheet.mergeCells(row, 1, row, COLS)
  const cell = sheet.getCell(row, 1)
  cell.value = text.toUpperCase()
  cell.font = font(9, { bold: true, color: C.muted })
  cell.alignment = { vertical: "bottom" }
  cell.border = { bottom: { style: "thin", color: { argb: C.line } } }
  sheet.getRow(row).height = 22
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
    delta.alignment = { vertical: "top", horizontal: "left", indent: 1, wrapText: true }
  }
  sheet.getRow(top).height = 16
  sheet.getRow(top + 1).height = 30
  sheet.getRow(top + 2).height = 24
}

function insightRows(sheet: Sheet, top: number, insights: Insight[]): number {
  let r = top
  const textWidth = spanWidth(2, COLS - 1)
  for (const i of insights) {
    const mark = sheet.getCell(r, 1)
    mark.value = i.tone === "good" ? "▲" : i.tone === "warn" ? "▼" : "•"
    mark.font = font(12, {
      bold: true,
      color: i.tone === "good" ? C.green : i.tone === "warn" ? C.orange : C.muted,
    })
    mark.alignment = { vertical: "top", horizontal: "center" }
    sheet.mergeCells(r, 2, r, COLS)
    const text = sheet.getCell(r, 2)
    text.value = {
      richText: [
        { text: `${i.title}. `, font: font(10, { bold: true }) },
        { text: `${i.what} `, font: font(10) },
        { text: i.action, font: font(10, { color: C.muted }) },
      ],
    }
    text.alignment = { vertical: "top", wrapText: true }
    // Generous: merged cells never auto-fit, and bold runs are wider.
    const full = `${i.title}. ${i.what} ${i.action}`
    sheet.getRow(r).height = wrappedHeight(full, textWidth * 0.8, 15, 32) + 6
    r += 1
  }
  return r
}

/** Plain bullet lines (one merged row each). */
function bulletRows(sheet: Sheet, top: number, lines: string[]): number {
  let r = top
  for (const line of lines) {
    const mark = sheet.getCell(r, 1)
    mark.value = "•"
    mark.font = font(11, { bold: true, color: C.blue })
    mark.alignment = { vertical: "top", horizontal: "center" }
    sheet.mergeCells(r, 2, r, COLS)
    const cell = sheet.getCell(r, 2)
    cell.value = line
    cell.font = font(10)
    cell.alignment = { vertical: "top", wrapText: true }
    sheet.getRow(r).height = wrappedHeight(line, spanWidth(2, COLS - 1) * 0.85, 15, 18) + 4
    r += 1
  }
  return r + 1
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
    cell.alignment = {
      vertical: "middle",
      horizontal: c.align ?? "left",
      indent: 1,
      wrapText: true,
    }
  }
  header.height = headerHeight(
    columns.map((c) => ({ header: c.header })),
    (i) => spanWidth(columns[i].col, columns[i].span ?? 1),
  )
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
    excelRow.height = 18
    r += 1
  }
  for (const c of columns) {
    if (c.bar && rows.length > 0) {
      shareBars(
        sheet,
        c.col,
        top + 1,
        rows.map((row) => Number(row[c.key] ?? 0) || 0),
        c.barTotal,
      )
    }
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

/** Fraction 0-1 for a percent cell (formatted "0%"), or "" when there is no base. */
function frac(part: number, total: number): number | "" {
  return total > 0 ? part / total : ""
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one linear pass that lays out every sheet of the workbook
export async function buildReportXlsx(data: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Cuik"
  wb.created = new Date()
  const tz = data.tenant.timezone
  const isWeekly = data.kind === "weekly"
  const periodWord = isWeekly ? "semana" : "mes"
  const here = isWeekly ? "esta semana" : "este mes"
  const prevWord = isWeekly ? "Semana anterior" : "Mes anterior"
  const isPoints = data.tenant.programType === "points"
  const rewardsWord = isPoints ? "Canjes" : "Premios canjeados"
  const insights = buildInsights(data)
  const d = data.signals.depth
  const k = data.kpis

  // ═══════════════ Resumen (dashboard) ═══════════════
  const dash = wb.addWorksheet("Resumen", {
    views: [{ showGridLines: false }],
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0, orientation: "portrait" },
  })
  DASH_WIDTHS.forEach((w, i) => {
    dash.getColumn(i + 1).width = w
  })

  band(
    dash,
    1,
    `${data.tenant.name} · Reporte ${isWeekly ? "semanal" : "mensual"}`,
    `${capitalize(data.periodLabel)} · comparado con ${data.compareLabel} · hora local del comercio (${tz})`,
  )

  let r = 4
  sectionLabel(dash, r, "Indicadores clave")
  r += 1
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

  const repeatShare =
    k.uniqueClients.current > 0 ? data.repeatClients / k.uniqueClients.current : null
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
      label: "Tasa de retorno",
      value:
        k.uniqueClients.current > 0 ? data.signals.returningClients / k.uniqueClients.current : "—",
      numFmt: "0%",
      hint: `${data.signals.returningClients} de ${k.uniqueClients.current} ya te conocían · ${data.signals.newVisitors} primerizos`,
    },
    {
      label: `Repitieron ${here}`,
      value: repeatShare ?? "—",
      numFmt: "0%",
      hint: `${data.repeatClients} de ${k.uniqueClients.current} vinieron 2 o más veces`,
    },
    isPoints || d.ticket.current != null ? ticketTile : riskTile,
  ])
  r += 4

  // Insights
  if (insights.length > 0) {
    sectionLabel(dash, r, "Lo más importante")
    r += 1
    r = insightRows(dash, r, insights.slice(0, 5))
    if (insights.length > 5) {
      const more = dash.getCell(r, 2)
      more.value = `${insights.length - 5} más en el correo.`
      more.font = font(9, { color: C.muted, italic: true })
      r += 1
    }
    r += 1
  }

  // What happened
  const happened = happenedItems(data, here)
  if (happened.length > 0) {
    sectionLabel(dash, r, "Lo que pasó")
    r += 1
    r = bulletRows(dash, r, happened)
  }

  // Visits per day (weekly) / per week (monthly)
  sectionLabel(dash, r, isWeekly ? "Visitas por día" : "Visitas por semana")
  r += 1
  if (isWeekly || !data.monthly) {
    r = miniTable(
      dash,
      r,
      [
        { header: "Día", key: "day", col: 1 },
        { header: "Visitas", key: "visits", col: 2, span: 2, bar: true, numFmt: "#,##0" },
        { header: "% de la semana", key: "share", col: 4, numFmt: "0%", align: "right" },
        { header: "Clientes", key: "uniqueClients", col: 5, numFmt: "#,##0" },
        { header: "Nuevos", key: "newClients", col: 6, numFmt: "#,##0" },
        { header: rewardsWord, key: "rewardsRedeemed", col: 7, numFmt: "#,##0" },
        { header: "Hora pico", key: "peakHour", col: 8, align: "center" },
      ],
      data.daily.map((x) => ({
        day: `${capitalize(x.weekday)} ${dayLabel(x.date).split(" de ")[0]}`,
        visits: x.visits,
        share: frac(x.visits, k.visits.current),
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
        { header: "Semana", key: "label", col: 1, span: 2 },
        { header: "Visitas", key: "visits", col: 3, span: 2, bar: true, numFmt: "#,##0" },
        { header: "% del mes", key: "share", col: 5, numFmt: "0%", align: "right" },
        { header: "Nuevos", key: "newClients", col: 6, numFmt: "#,##0" },
        { header: rewardsWord, key: "rewardsRedeemed", col: 7, span: 2, numFmt: "#,##0" },
      ],
      data.monthly.weeks.map((w) => ({ ...w, share: frac(w.visits, k.visits.current) })),
    )
  }

  // Loyal clients
  if (data.clients.length > 0) {
    sectionLabel(
      dash,
      r,
      isWeekly ? "Los que más vinieron esta semana" : "Los que más vinieron este mes",
    )
    r += 1
    r = miniTable(
      dash,
      r,
      [
        { header: "Cliente", key: "name", col: 1, span: 2 },
        {
          header: `Visitas ${periodWord}`,
          key: "periodVisits",
          col: 3,
          span: 2,
          bar: true,
          numFmt: "#,##0",
        },
        { header: "Visitas totales", key: "totalVisits", col: 5, numFmt: "#,##0" },
        { header: progressHeader(data), key: "progress", col: 6, align: "right" },
        { header: "Segmento", key: "segment", col: 7, span: 2 },
      ],
      data.clients.slice(0, 5).map((c) => ({
        name: c.name,
        periodVisits: c.periodVisits,
        totalVisits: c.totalVisits,
        progress: c.progress,
        segment: c.segment,
      })),
    )
  }

  // When do clients come: weekday × time band, coloured white → blue
  sectionLabel(dash, r, "Cuándo vienen tus clientes")
  r += 1
  const heat = data.signals.heat
  const heatTotal = heat.reduce((acc, h) => acc + h.morning + h.afternoon + h.evening, 0)
  {
    const top = r
    r = miniTable(
      dash,
      r,
      [
        { header: "Día", key: "weekday", col: 1 },
        {
          header: "Mañana (hasta 12)",
          key: "morning",
          col: 2,
          span: 2,
          numFmt: "#,##0",
          align: "center",
        },
        {
          header: "Tarde (12 a 18)",
          key: "afternoon",
          col: 4,
          span: 2,
          numFmt: "#,##0",
          align: "center",
        },
        {
          header: "Noche (desde 18)",
          key: "evening",
          col: 6,
          span: 2,
          numFmt: "#,##0",
          align: "center",
        },
        { header: "% total", key: "share", col: 8, numFmt: "0%", align: "right" },
      ],
      heat.map((h) => ({
        weekday: capitalize(h.weekday),
        morning: h.morning,
        afternoon: h.afternoon,
        evening: h.evening,
        share: frac(h.morning + h.afternoon + h.evening, heatTotal),
      })),
    )
    heatScale(dash, 2, 7, top + 1, top + heat.length)
  }
  const f = d.funnel
  r = miniTable(
    dash,
    r,
    [
      { header: "Embudo (al cierre)", key: "label", col: 1, span: 2 },
      {
        header: "Clientes",
        key: "n",
        col: 3,
        span: 2,
        bar: true,
        barTotal: f.registered,
        numFmt: "#,##0",
      },
      { header: "% de registrados", key: "pct", col: 5, numFmt: "0%", align: "right" },
      {
        header: `Nuevos ${periodWord}`,
        key: "nuevos",
        col: 6,
        bar: true,
        barTotal: f.newRegistered,
        numFmt: "#,##0",
      },
      { header: "% de nuevos", key: "nuevosPct", col: 7, span: 2, numFmt: "0%", align: "right" },
    ],
    [
      { label: "Registrados", n: f.registered, nuevos: f.newRegistered },
      { label: "Con al menos 1 visita", n: f.withVisit, nuevos: f.newWithVisit },
      { label: "Volvieron (2 o más visitas)", n: f.repeaters, nuevos: f.newRepeaters },
      {
        label: isPoints ? "Canjearon puntos" : "Cobraron un premio",
        n: f.redeemers,
        nuevos: f.newRedeemers,
      },
    ].map((x) => ({
      ...x,
      pct: frac(x.n, f.registered),
      nuevosPct: frac(x.nuevos, f.newRegistered),
    })),
  )
  if (d.timeToFirstReward.medianDays != null && d.timeToFirstReward.clients >= 3) {
    dash.mergeCells(r, 1, r, COLS)
    const cell = dash.getCell(r, 1)
    cell.value = `Del registro al primer ${isPoints ? "canje" : "premio"} pasan ${d.timeToFirstReward.medianDays} días (mediana sobre ${d.timeToFirstReward.clients} clientes).`
    cell.font = font(10, { color: C.muted })
    r += 2
  }

  // Points usage
  const pts = data.signals.points
  if (isPoints && pts) {
    sectionLabel(dash, r, "Puntos")
    r += 1
    const ptsTotal = pts.earned || 1
    r = miniTable(
      dash,
      r,
      [
        { header: `Puntos ${periodWord}`, key: "label", col: 1, span: 2 },
        { header: "Puntos", key: "n", col: 3, span: 2, bar: true, numFmt: "#,##0" },
        { header: "% de lo ganado", key: "pct", col: 5, numFmt: "0%", align: "right" },
        { header: "Detalle", key: "note", col: 6, span: 3 },
      ],
      [
        { label: "Ganados", n: pts.earned, pct: frac(pts.earned, ptsTotal), note: "" },
        {
          label: "Canjeados",
          n: pts.redeemed,
          pct: frac(pts.redeemed, ptsTotal),
          note: `${k.rewardsRedeemed.current} canjes`,
        },
        {
          label: "Vencidos",
          n: pts.expired,
          pct: frac(pts.expired, ptsTotal),
          note: pts.expired > 0 ? "sin usar" : "",
        },
        {
          label: "Por vencer (7 días)",
          n: pts.expiringNext.points,
          pct: frac(pts.expiringNext.points, ptsTotal),
          note: `${pts.expiringNext.clients} ${pts.expiringNext.clients === 1 ? "cliente" : "clientes"} · aviso ${pts.warningEnabled ? "activo" : "apagado"}`,
        },
      ],
    )
  }

  // Branches
  if (data.team.showBranches) {
    sectionLabel(dash, r, "Sucursales")
    r += 1
    r = miniTable(
      dash,
      r,
      [
        { header: "Sucursal", key: "name", col: 1, span: 2 },
        {
          header: `Visitas ${periodWord}`,
          key: "visits",
          col: 3,
          span: 2,
          bar: true,
          numFmt: "#,##0",
        },
        { header: "% del total", key: "share", col: 5, numFmt: "0%", align: "right" },
        { header: prevWord, key: "previousVisits", col: 6, numFmt: "#,##0" },
        { header: "Cambio", key: "change", col: 7, delta: true, align: "right" },
        { header: "Nuevos", key: "newClients", col: 8, numFmt: "#,##0" },
      ],
      data.team.branches.map((x) => ({
        name: x.id === null || x.active ? x.name : `${x.name} (inactiva)`,
        visits: x.visits,
        share: x.share / 100,
        previousVisits: x.previousVisits,
        change: deltaShort(x.visits, x.previousVisits),
        newClients: x.newClients,
      })),
    )
  }

  // To act on
  const act = actItems(data, isWeekly)
  if (act.length > 0) {
    sectionLabel(dash, r, isWeekly ? "Para actuar esta semana" : "Para actuar este mes")
    r += 1
    r = bulletRows(dash, r, act)
  }

  // Footer
  dash.mergeCells(r, 1, r, COLS)
  const foot = dash.getCell(r, 1)
  foot.value = "Cuik · cuik.org · El detalle para actuar está en las hojas siguientes."
  foot.font = font(9, { color: C.muted, italic: true })

  // ═══════════════ Cajeros ═══════════════
  if (data.team.showCashiers) {
    const cashierTotal = data.team.cashiers.reduce((a, c) => a + c.visits, 0)
    addTable(
      detailSheet(wb, "Cajeros"),
      [
        { header: "Nombre", key: "name", width: 26 },
        { header: "Rol", key: "role", width: 10 },
        { header: `Visitas ${periodWord}`, key: "visits", width: 16, bar: true, numFmt: "#,##0" },
        { header: "% del total", key: "share", width: 12, numFmt: "0%", align: "right" },
        { header: prevWord, key: "previousVisits", width: 16, numFmt: "#,##0" },
        { header: "Cambio", key: "change", width: 12, delta: true, align: "right" },
        { header: "Días activos", key: "activeDays", width: 13, numFmt: "#,##0" },
        { header: "Visitas por día activo", key: "perActiveDay", width: 20, numFmt: "0.0" },
        { header: "Clientes nuevos", key: "newClients", width: 16, numFmt: "#,##0" },
        { header: "Última visita registrada", key: "lastVisitAt", width: 22 },
        { header: "Observación", key: "note", width: 36, wrap: true },
      ],
      data.team.cashiers.map((c) => ({
        name: c.name,
        role: c.role,
        visits: c.visits,
        share: frac(c.visits, cashierTotal),
        previousVisits: c.previousVisits,
        change: deltaShort(c.visits, c.previousVisits),
        activeDays: c.activeDays,
        perActiveDay: c.perActiveDay,
        newClients: c.newClients,
        lastVisitAt: formatDateForExport(c.lastVisitAt, tz),
        note:
          c.visits === 0
            ? `No registró visitas ${here}`
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
        width: 16,
        bar: true,
        numFmt: "#,##0",
      },
      { header: "Visitas totales", key: "totalVisits", width: 15, numFmt: "#,##0" },
      { header: "Última visita", key: "lastVisitAt", width: 20 },
      { header: progressHeader(data), key: "progress", width: 12, align: "right" },
      { header: "Segmento", key: "segment", width: 14 },
      ...(isPoints
        ? [
            {
              header: `Compras ${periodWord} (S/)`,
              key: "amount",
              width: 20,
              numFmt: '"S/ "#,##0.00',
            },
          ]
        : [
            {
              header: "Premio pendiente",
              key: "pendingReward",
              width: 17,
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

  // ═══════════════ Campañas ═══════════════
  if (data.campaigns.length > 0) {
    addTable(
      detailSheet(wb, "Campañas"),
      [
        { header: "Campaña", key: "name", width: 32 },
        { header: "Enviada", key: "sentAt", width: 20 },
        { header: "Push enviados", key: "sentCount", width: 15, numFmt: "#,##0" },
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
        title: isWeekly ? "Campañas push de la semana" : "Campañas push del mes",
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
        { header: "Visitas totales", key: "totalVisits", width: 16, bar: true, numFmt: "#,##0" },
        { header: "Última visita", key: "lastVisitAt", width: 20 },
        { header: "Días sin venir", key: "daysSince", width: 15, numFmt: "#,##0" },
        { header: progressHeader(data), key: "progress", width: 12, align: "right" },
        { header: "Acción sugerida", key: "action", width: 44 },
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

  // ═══════════════ Monthly detail: days, weeks, cumulative ═══════════════
  if (data.monthly) {
    addTable(
      detailSheet(wb, "Visitas por día"),
      [
        { header: "Fecha", key: "date", width: 12 },
        { header: "Día", key: "weekday", width: 12 },
        { header: "Visitas", key: "visits", width: 14, bar: true, numFmt: "#,##0" },
        { header: "Clientes distintos", key: "uniqueClients", width: 18, numFmt: "#,##0" },
        { header: "Nuevos", key: "newClients", width: 10, numFmt: "#,##0" },
        { header: rewardsWord, key: "rewardsRedeemed", width: 18, numFmt: "#,##0" },
        { header: "Hora pico", key: "peakHour", width: 10, align: "center" },
      ],
      data.daily.map((x) => ({ ...x, weekday: capitalize(x.weekday), peakHour: x.peakHour ?? "" })),
      { title: `Visitas por día · ${capitalize(data.periodLabel)}`, freeze: true, filter: true },
    )
    addTable(
      detailSheet(wb, "Semanas del mes"),
      [
        { header: "Semana", key: "label", width: 22 },
        { header: "Desde", key: "start", width: 12 },
        { header: "Hasta", key: "end", width: 12 },
        { header: "Visitas", key: "visits", width: 14, bar: true, numFmt: "#,##0" },
        { header: "Nuevos", key: "newClients", width: 10, numFmt: "#,##0" },
        { header: rewardsWord, key: "rewardsRedeemed", width: 18, numFmt: "#,##0" },
      ],
      data.monthly.weeks.map((w) => ({ ...w })),
      { title: "Semanas del mes", freeze: true },
    )
    addCumulativeSheets(wb, data.monthly.cumulative, data, tz)
  }

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
      { header: "Visitas", key: "visits", width: 14, bar: true, numFmt: "#,##0" },
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
      { header: "Visitas totales", key: "totalVisits", width: 16, bar: true, numFmt: "#,##0" },
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
      { header: "Clientes", key: "count", width: 14, bar: true, numFmt: "#,##0" },
    ],
    c.segments.map((s) => ({ ...s })),
    { title: "Segmentos hoy" },
  )
}

export { weekdayName }
