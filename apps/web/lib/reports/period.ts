/**
 * Report periods, all as "YYYY-MM-DD" local dates (tenant timezone), inclusive.
 * Pure date math on strings so it is trivially testable and never touches
 * the server's own timezone.
 */

export type ReportKind = "weekly" | "monthly"

export type Period = {
  /** First day, inclusive. */
  start: string
  /** Last day, inclusive. */
  end: string
  /** Idempotency key: the period start ("2026-09-07") or the month ("2026-09"). */
  key: string
}

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
]
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

function parse(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number)
  return { y, m, d }
}

function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

/** Add `days` (may be negative) to a "YYYY-MM-DD" date. */
export function addDays(ymd: string, days: number): string {
  const { y, m, d } = parse(ymd)
  const t = Date.UTC(y, m - 1, d + days)
  const dt = new Date(t)
  return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

/** 0 = Sunday … 6 = Saturday, like Date#getDay. */
export function weekday(ymd: string): number {
  const { y, m, d } = parse(ymd)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** ISO weekday 1 = Monday … 7 = Sunday. */
export function isoWeekday(ymd: string): number {
  const w = weekday(ymd)
  return w === 0 ? 7 : w
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function daysBetweenInclusive(start: string, end: string): number {
  const a = parse(start)
  const b = parse(end)
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000) + 1
}

/** Every date from start to end, inclusive. */
export function eachDay(start: string, end: string): string[] {
  const n = daysBetweenInclusive(start, end)
  return Array.from({ length: Math.max(n, 0) }, (_, i) => addDays(start, i))
}

/**
 * The last fully closed Monday–Sunday week before `todayLocal`.
 * On a Monday that is last week; on any other day, the week before the current one.
 */
export function lastClosedWeek(todayLocal: string): Period {
  const thisMonday = addDays(todayLocal, -(isoWeekday(todayLocal) - 1))
  const start = addDays(thisMonday, -7)
  const end = addDays(thisMonday, -1)
  return { start, end, key: start }
}

/** The week right before `p` (same length). */
export function previousWeek(p: Period): Period {
  const start = addDays(p.start, -7)
  return { start, end: addDays(p.end, -7), key: start }
}

/** A whole calendar month, given "YYYY-MM". */
export function monthPeriod(ym: string): Period {
  const [y, m] = ym.split("-").map(Number)
  return {
    start: fmt(y, m, 1),
    end: fmt(y, m, daysInMonth(y, m)),
    key: `${y}-${String(m).padStart(2, "0")}`,
  }
}

/** The last fully closed calendar month before `todayLocal`. */
export function lastClosedMonth(todayLocal: string): Period {
  const { y, m } = parse(todayLocal)
  const py = m === 1 ? y - 1 : y
  const pm = m === 1 ? 12 : m - 1
  return monthPeriod(`${py}-${String(pm).padStart(2, "0")}`)
}

/** The month right before the month period `p`. */
export function previousMonth(p: Period): Period {
  const { y, m } = parse(p.start)
  const py = m === 1 ? y - 1 : y
  const pm = m === 1 ? 12 : m - 1
  return monthPeriod(`${py}-${String(pm).padStart(2, "0")}`)
}

/** Same month, one year earlier. */
export function sameMonthLastYear(p: Period): Period {
  const { y, m } = parse(p.start)
  return monthPeriod(`${y - 1}-${String(m).padStart(2, "0")}`)
}

/** Every "YYYY-MM" from the month of `fromYmd` up to the month of `toYmd`, inclusive. */
export function eachMonth(fromYmd: string, toYmd: string): string[] {
  const a = parse(fromYmd)
  const b = parse(toYmd)
  const out: string[] = []
  let y = a.y
  let m = a.m
  while (y < b.y || (y === b.y && m <= b.m)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

// ── Labels (Spanish, es-PE style) ───────────────────────────────────

export function monthName(m: number): string {
  return MONTHS[m - 1] ?? ""
}

export function weekdayName(ymd: string): string {
  return WEEKDAYS[weekday(ymd)]
}

/** "7 de setiembre" */
export function dayLabel(ymd: string): string {
  const { m, d } = parse(ymd)
  return `${d} de ${monthName(m)}`
}

/** "lunes 7 al domingo 13 de setiembre de 2026" / "28 de setiembre al 4 de octubre de 2026" */
export function weekLabel(p: Period): string {
  const a = parse(p.start)
  const b = parse(p.end)
  if (a.m === b.m) {
    return `${weekdayName(p.start)} ${a.d} al ${weekdayName(p.end)} ${b.d} de ${monthName(b.m)} de ${b.y}`
  }
  return `${weekdayName(p.start)} ${a.d} de ${monthName(a.m)} al ${weekdayName(p.end)} ${b.d} de ${monthName(b.m)} de ${b.y}`
}

/** "setiembre de 2026" */
export function monthLabel(p: Period): string {
  const { y, m } = parse(p.start)
  return `${monthName(m)} de ${y}`
}

export function periodLabel(kind: ReportKind, p: Period): string {
  return kind === "weekly" ? weekLabel(p) : monthLabel(p)
}

// ── Deltas ──────────────────────────────────────────────────────────

export type Delta = { direction: "up" | "down" | "flat"; text: string; pct: number | null }

/**
 * Human delta between two counts. Percent when there is a base, absolute
 * difference otherwise; never "sin base".
 */
export function delta(current: number, previous: number): Delta {
  const diff = current - previous
  if (diff === 0) return { direction: "flat", text: "igual que antes", pct: 0 }
  const direction = diff > 0 ? "up" : "down"
  if (previous > 0) {
    const pct = Math.round((diff / previous) * 100)
    return { direction, text: `${pct > 0 ? "+" : ""}${pct} % · antes ${previous}`, pct }
  }
  return { direction, text: `${diff > 0 ? "+" : ""}${diff} · antes ${previous}`, pct: null }
}

/** "+14 %" for subjects; falls back to "+3" when there is no base. */
export function deltaShort(current: number, previous: number): string {
  const d = delta(current, previous)
  if (d.direction === "flat") return "sin cambio"
  if (d.pct !== null) return `${d.pct > 0 ? "+" : ""}${d.pct} %`
  const diff = current - previous
  return `${diff > 0 ? "+" : ""}${diff}`
}
