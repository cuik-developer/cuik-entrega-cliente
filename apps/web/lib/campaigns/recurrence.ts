import { addDays, localDateString, nthWeekdayOfMonth, weekdayOf } from "@/lib/loyalty/expiration"
import { wallTimeToUtc } from "@/lib/zoned-time"

/**
 * Recurrence math for recurring campaigns. Pure: no DB, no clock. Everything
 * is reasoned in the tenant timezone on "YYYY-MM-DD" strings and converted to
 * a UTC instant only at the end.
 */

export type RecurrenceRule = {
  frequency: "weekly" | "monthly_weekday"
  /** weekly: every N weeks (1 = every week). */
  intervalWeeks: number
  /** 0 = Sunday .. 6 = Saturday. weekly: one or more; monthly_weekday: exactly one. */
  weekdays: number[]
  /** monthly_weekday only: 1..4, or -1 for the last one of the month. */
  weekOfMonth?: number | null
  sendHour: number
  sendMinute: number
  /** "YYYY-MM-DD" local. Also anchors which week is "week 1" when intervalWeeks > 1. */
  startsOn: string
  endsOn?: string | null
  maxOccurrences?: number | null
}

const MAX_LOOKAHEAD_DAYS = 400
const MAX_LOOKAHEAD_MONTHS = 14
const DAY_MS = 86_400_000

function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS)
}

/** Monday-based start of the week containing `ymd` (so a Sunday belongs to the week before). */
function weekIndex(ymd: string): number {
  const day = dayNumber(ymd)
  const dow = weekdayOf(ymd) // 0 = Sunday
  const mondayOffset = (dow + 6) % 7
  return Math.floor((day - mondayOffset) / 7)
}

function instantFor(ymd: string, rule: RecurrenceRule, timezone: string): Date | null {
  const hh = String(rule.sendHour).padStart(2, "0")
  const mm = String(rule.sendMinute).padStart(2, "0")
  return wallTimeToUtc(`${ymd}T${hh}:${mm}`, timezone)
}

/** True when `ymd` is a send day for the rule (ignores time and bounds). */
export function isSendDay(rule: RecurrenceRule, ymd: string): boolean {
  if (ymd < rule.startsOn) return false
  if (rule.endsOn && ymd > rule.endsOn) return false
  const dow = weekdayOf(ymd)
  if (rule.frequency === "weekly") {
    if (!rule.weekdays.includes(dow)) return false
    const interval = Math.max(1, rule.intervalWeeks)
    return (weekIndex(ymd) - weekIndex(rule.startsOn)) % interval === 0
  }
  const weekday = rule.weekdays[0]
  if (weekday === undefined || dow !== weekday) return false
  const ordinal = rule.weekOfMonth === -1 ? "last" : (rule.weekOfMonth as 1 | 2 | 3 | 4)
  if (!ordinal) return false
  return nthWeekdayOfMonth(ymd, weekday, ordinal) === ymd
}

/**
 * First send instant strictly after `after` (UTC), or null when the rule has
 * run its course (endsOn passed, maxOccurrences reached, or nothing matches
 * within the lookahead window).
 */
export function computeNextRun(
  rule: RecurrenceRule,
  after: Date,
  timezone: string,
  occurrencesSoFar = 0,
): Date | null {
  if (rule.maxOccurrences && occurrencesSoFar >= rule.maxOccurrences) return null
  if (rule.weekdays.length === 0) return null

  // Start the scan one day before `after` (local) so a same-day later hour is found.
  let ymd = localDateString(after, timezone)
  ymd = addDays(ymd, -1)
  if (ymd < rule.startsOn) ymd = addDays(rule.startsOn, -1)

  const limit = rule.frequency === "weekly" ? MAX_LOOKAHEAD_DAYS : MAX_LOOKAHEAD_MONTHS * 31 + 7
  for (let i = 0; i < limit; i++) {
    ymd = addDays(ymd, 1)
    if (rule.endsOn && ymd > rule.endsOn) return null
    if (!isSendDay(rule, ymd)) continue
    const instant = instantFor(ymd, rule, timezone)
    if (instant && instant.getTime() > after.getTime()) return instant
  }
  return null
}

/** The next `count` send instants after `after`, for the "próximos envíos" preview. */
export function nextOccurrences(
  rule: RecurrenceRule,
  after: Date,
  timezone: string,
  count: number,
  occurrencesSoFar = 0,
): Date[] {
  const out: Date[] = []
  let cursor = after
  let n = occurrencesSoFar
  while (out.length < count) {
    const next = computeNextRun(rule, cursor, timezone, n)
    if (!next) break
    out.push(next)
    cursor = next
    n++
  }
  return out
}

const WEEKDAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]
const ORDINALS: Record<number, string> = {
  1: "primer",
  2: "segundo",
  3: "tercer",
  4: "cuarto",
  [-1]: "último",
}

/** "Cada 2 semanas los miércoles a las 10:00" style summary for the UI and emails. */
export function describeRecurrence(rule: RecurrenceRule): string {
  const time = `${String(rule.sendHour).padStart(2, "0")}:${String(rule.sendMinute).padStart(2, "0")}`
  if (rule.frequency === "weekly") {
    const days = [...rule.weekdays]
      .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
      .map((d) => WEEKDAY_NAMES[d] ?? "")
      .filter(Boolean)
    const dayList =
      days.length <= 1 ? days.join("") : `${days.slice(0, -1).join(", ")} y ${days.at(-1)}`
    const every =
      rule.intervalWeeks <= 1
        ? `todos los ${dayList}`
        : `cada ${rule.intervalWeeks} semanas los ${dayList}`
    return `${every} a las ${time}`
  }
  const ordinal = ORDINALS[rule.weekOfMonth ?? 1] ?? "primer"
  const day = WEEKDAY_NAMES[rule.weekdays[0] ?? 1]
  return `el ${ordinal} ${day} de cada mes a las ${time}`
}
