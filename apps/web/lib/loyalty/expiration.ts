import type { ExpirationPolicy } from "@cuik/shared/validators"

/**
 * Date math for points / stamps expiration. Everything is computed in the
 * tenant timezone and returned as UTC instants. A "cutoff" is always the end
 * of a local day, represented as the next local midnight (Friday 00:00 when
 * the policy says "vence el jueves").
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** "YYYY-MM-DD" of `date` in `timezone`. */
export function localDateString(date: Date, timezone: string): string {
  return date.toLocaleDateString("en-CA", { timeZone: timezone })
}

function splitDate(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split("-").map(Number)
  return [y, m, d]
}

function tzOffsetMs(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0")
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  )
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/** UTC instant of local midnight at the start of `ymd` in `timezone`. */
export function localMidnight(ymd: string, timezone: string): Date {
  const [y, m, d] = splitDate(ymd)
  const guess = Date.UTC(y, m - 1, d)
  let offset = tzOffsetMs(new Date(guess), timezone)
  let result = new Date(guess - offset)
  // Second pass in case the offset differs across the DST boundary.
  const offset2 = tzOffsetMs(result, timezone)
  if (offset2 !== offset) {
    offset = offset2
    result = new Date(guess - offset)
  }
  return result
}

/** Add `days` calendar days to a "YYYY-MM-DD" (pure calendar math, no timezone). */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = splitDate(ymd)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Weekday 0-6 of a "YYYY-MM-DD". */
export function weekdayOf(ymd: string): number {
  const [y, m, d] = splitDate(ymd)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const [y1, m1, d1] = splitDate(fromYmd)
  const [y2, m2, d2] = splitDate(toYmd)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS)
}

/** "YYYY-MM-DD" of the `ordinal`-th `weekday` of the month that contains `ymd`. */
export function nthWeekdayOfMonth(
  ymd: string,
  weekday: number,
  ordinal: 1 | 2 | 3 | 4 | "last",
): string {
  const [y, m] = splitDate(ymd)
  if (ordinal === "last") {
    const lastDay = new Date(Date.UTC(y, m, 0)) // day 0 of next month
    const back = (lastDay.getUTCDay() - weekday + 7) % 7
    return new Date(Date.UTC(y, m - 1, lastDay.getUTCDate() - back)).toISOString().slice(0, 10)
  }
  const first = new Date(Date.UTC(y, m - 1, 1))
  const forward = (weekday - first.getUTCDay() + 7) % 7
  return new Date(Date.UTC(y, m - 1, 1 + forward + (ordinal - 1) * 7)).toISOString().slice(0, 10)
}

function nextMonth(ymd: string): string {
  const [y, m] = splitDate(ymd)
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
}

/**
 * Local "YYYY-MM-DD" of the LAST VALID DAY for something earned on `earnedYmd`.
 * Null when the policy never expires. Points earned on a cutoff day belong to
 * the next period (a Thursday purchase is never gone that same night).
 */
export function lastValidDay(policy: ExpirationPolicy, earnedYmd: string): string | null {
  switch (policy.mode) {
    case "never":
      return null
    case "rolling":
      return addDays(earnedYmd, policy.days)
    case "weekly": {
      const delta = (policy.weekday - weekdayOf(earnedYmd) + 7) % 7
      return addDays(earnedYmd, delta === 0 ? 7 : delta)
    }
    case "monthly": {
      const thisMonth = nthWeekdayOfMonth(earnedYmd, policy.weekday, policy.ordinal)
      if (thisMonth > earnedYmd) return thisMonth
      return nthWeekdayOfMonth(nextMonth(earnedYmd), policy.weekday, policy.ordinal)
    }
    case "interval": {
      const elapsed = daysBetween(policy.anchor, earnedYmd)
      const periods = Math.floor(elapsed / policy.days)
      const periodEnd = addDays(policy.anchor, (periods + 1) * policy.days - 1)
      // Earned on the period's last day -> next period.
      return periodEnd > earnedYmd ? periodEnd : addDays(periodEnd, policy.days)
    }
  }
}

/**
 * UTC instant at which something earned at `earnedAt` expires under `policy`:
 * the local midnight that ends its last valid day. Null when it never expires.
 */
export function computeExpiresAt(
  policy: ExpirationPolicy,
  earnedAt: Date,
  timezone: string,
): Date | null {
  const last = lastValidDay(policy, localDateString(earnedAt, timezone))
  return last ? localMidnight(addDays(last, 1), timezone) : null
}

const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]
const ORDINALS: Record<string, string> = {
  1: "primer",
  2: "segundo",
  3: "tercer",
  4: "cuarto",
  last: "último",
}

/** Human label of the policy, for the panel and the cashier screen. */
export function describeExpirationPolicy(policy: ExpirationPolicy): string {
  switch (policy.mode) {
    case "never":
      return "No vencen"
    case "rolling":
      return `Vencen ${policy.days} días después de ganarse`
    case "weekly":
      return `Se reinician cada ${DAY_NAMES[policy.weekday]}`
    case "monthly":
      return `Se reinician el ${ORDINALS[String(policy.ordinal)]} ${DAY_NAMES[policy.weekday]} de cada mes`
    case "interval":
      return `Se reinician cada ${policy.days} días`
  }
}

/** "jue 8 oct" style label of an expiry instant, in the tenant timezone. */
export function formatExpiry(expiresAt: Date, timezone: string): string {
  // The instant is the midnight AFTER the last valid day: show that day.
  const lastValid = new Date(expiresAt.getTime() - 1)
  return lastValid
    .toLocaleDateString("es-PE", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: timezone,
    })
    .replace(/\./g, "")
    .replace(",", "")
}
