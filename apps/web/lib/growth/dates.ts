/**
 * Day arithmetic on "YYYY-MM-DD" strings (tenant-local days). Everything
 * Growth decides (expected day, suggested day, cooldown end) is a local day,
 * never an instant, so a sale at 23:50 and the stamp at 00:05 do not drift.
 */

export const DAY_MS = 86_400_000

/** Local calendar day of an instant in a time zone. */
export function localYmd(instant: Date | string, timeZone: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

export function ymdToUtc(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number)
  return Date.UTC(y, m - 1, d)
}

export function utcToYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(ymd: string, n: number): string {
  return utcToYmd(ymdToUtc(ymd) + n * DAY_MS)
}

/** b - a in days (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((ymdToUtc(b) - ymdToUtc(a)) / DAY_MS)
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(ymd: string): number {
  return new Date(ymdToUtc(ymd)).getUTCDay()
}

export const WEEKDAY_NAMES = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
] as const

/** Latest day strictly before `before` whose weekday is `weekday`. */
export function previousWeekday(before: string, weekday: number): string {
  let d = addDays(before, -1)
  while (weekdayOf(d) !== weekday) d = addDays(d, -1)
  return d
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
