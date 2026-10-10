/**
 * Pure date-bucket helpers for the tenant trend chart. Everything works on
 * "YYYY-MM-DD" strings that already represent tenant-local days, so no
 * timezone math happens here — the SQL side buckets in the tenant tz and
 * these helpers only zero-fill the gaps and validate the span.
 */

export type TrendGranularity = "day" | "week" | "month"

/** Longest allowed span (inclusive days) per granularity. */
export const MAX_RANGE_DAYS: Record<TrendGranularity, number> = {
  day: 366,
  week: 731,
  month: 1827,
}

const DAY_MS = 86_400_000

function parse(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function format(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Inclusive number of days between two YYYY-MM-DD values (from <= to). */
export function rangeDays(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / DAY_MS) + 1
}

/**
 * Start of the bucket that contains `ymd`: the same day, the Monday of its
 * ISO week (matches PostgreSQL `date_trunc('week', …)`), or the 1st of its month.
 */
export function bucketStart(ymd: string, granularity: TrendGranularity): string {
  if (granularity === "day") return ymd
  const d = parse(ymd)
  if (granularity === "week") {
    const dow = (d.getUTCDay() + 6) % 7 // Monday = 0
    d.setUTCDate(d.getUTCDate() - dow)
    return format(d)
  }
  d.setUTCDate(1)
  return format(d)
}

/** Every bucket start between `from` and `to`, inclusive, in order. */
export function buildBuckets(from: string, to: string, granularity: TrendGranularity): string[] {
  const out: string[] = []
  const end = parse(to).getTime()
  const cur = parse(bucketStart(from, granularity))
  while (cur.getTime() <= end) {
    out.push(format(cur))
    if (granularity === "day") cur.setUTCDate(cur.getUTCDate() + 1)
    else if (granularity === "week") cur.setUTCDate(cur.getUTCDate() + 7)
    else cur.setUTCMonth(cur.getUTCMonth() + 1)
  }
  return out
}

/**
 * Aligns sparse `{ date, value }` rows to the full list of buckets,
 * writing 0 where a bucket has no row. Rows outside the buckets are dropped.
 */
export function fillSeries(buckets: string[], rows: Array<{ date: string; value: number }>) {
  const byDate = new Map<string, number>()
  for (const r of rows) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.value)
  return buckets.map((b) => byDate.get(b) ?? 0)
}

/** Granularity that keeps the chart readable for a span of `days`. */
export function defaultGranularity(days: number): TrendGranularity {
  if (days <= 31) return "day"
  if (days <= 120) return "week"
  return "month"
}
