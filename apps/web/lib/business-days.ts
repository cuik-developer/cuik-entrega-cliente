/**
 * Business days in Peru, for the Libro de Reclamaciones deadline.
 *
 * The provider must answer a reclamo or queja within 15 business days
 * (Código de Protección y Defensa del Consumidor, art. 24, as amended by
 * Ley 31435; DS 011-2011-PCM). "Business day" means Monday to Friday that is
 * not a national holiday, so to show the exact legal date we skip:
 *
 * - Saturdays and Sundays.
 * - The fixed national holidays: 1 Jan, 1 May, 7 Jun, 29 Jun, 23 Jul,
 *   28 Jul, 29 Jul, 6 Aug, 30 Aug, 8 Oct, 1 Nov, 8 Dec, 9 Dec, 25 Dec.
 * - Holy Thursday and Good Friday, which move with Easter (computed below).
 *
 * Not skipped: one-off "días no laborables" decreed for the public sector
 * (they do not suspend private deadlines) and regional holidays. If the list
 * of national holidays changes by law, update FIXED_HOLIDAYS. The day the
 * sheet is filed does not count: day 1 is the next business day, and the due
 * date is the 15th.
 *
 * All dates are plain "YYYY-MM-DD" strings in America/Lima; arithmetic runs
 * on UTC midnights so the host time zone never shifts a day.
 */

/** MM-DD of Peru's fixed national holidays. */
const FIXED_HOLIDAYS = [
  "01-01",
  "05-01",
  "06-07",
  "06-29",
  "07-23",
  "07-28",
  "07-29",
  "08-06",
  "08-30",
  "10-08",
  "11-01",
  "12-08",
  "12-09",
  "12-25",
] as const

export const COMPLAINT_DEADLINE_BUSINESS_DAYS = 15

/** "YYYY-MM-DD" of `date` as seen in Lima. */
export function limaYmd(date: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Easter Sunday (Gregorian), anonymous algorithm (Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

const holidayCache = new Map<number, Set<string>>()

/** Every national holiday of `year`: the fixed ones plus Holy Thursday and Good Friday. */
export function peruHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year)
  if (cached) return cached
  const easter = easterSunday(year)
  const set = new Set<string>(FIXED_HOLIDAYS.map((md) => `${year}-${md}`))
  set.add(addDays(easter, -3))
  set.add(addDays(easter, -2))
  holidayCache.set(year, set)
  return set
}

export function isBusinessDay(ymd: string): boolean {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay()
  if (dow === 0 || dow === 6) return false
  return !peruHolidays(Number(ymd.slice(0, 4))).has(ymd)
}

/** The `n`th business day after `ymd` (`ymd` itself never counts). */
export function addBusinessDays(ymd: string, n: number): string {
  let day = ymd
  let left = n
  while (left > 0) {
    day = addDays(day, 1)
    if (isBusinessDay(day)) left--
  }
  return day
}

/**
 * Business days in (from, to]: how many business days remain after `from`
 * up to and including `to`. 0 when `to` is `from` or earlier — compare the
 * dates themselves to tell an overdue one.
 */
export function businessDaysBetween(from: string, to: string): number {
  let count = 0
  let day = from
  while (day < to) {
    day = addDays(day, 1)
    if (isBusinessDay(day)) count++
  }
  return count
}

/** Legal due date of a complaint filed at `filedAt`: its Lima date + 15 business days. */
export function complaintDueOn(filedAt: Date = new Date()): string {
  return addBusinessDays(limaYmd(filedAt), COMPLAINT_DEADLINE_BUSINESS_DAYS)
}
