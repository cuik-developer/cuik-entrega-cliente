/**
 * Period presets for the Analítica toolbar. All dates are "YYYY-MM-DD" as seen
 * in the tenant's timezone — the API buckets by tenant-local day, so the range
 * must be expressed the same way.
 */

export type Preset = "today" | "7d" | "30d" | "90d" | "thisMonth" | "lastMonth" | "custom"

export const PRESETS: Array<{ v: Exclude<Preset, "custom">; label: string }> = [
  { v: "today", label: "Hoy" },
  { v: "7d", label: "7 días" },
  { v: "30d", label: "30 días" },
  { v: "90d", label: "90 días" },
  { v: "thisMonth", label: "Este mes" },
  { v: "lastMonth", label: "Mes pasado" },
]

export function toYMD(d: Date, tz: string): string {
  return d.toLocaleDateString("en-CA", { timeZone: tz })
}

/** Today in the tenant tz as a local-noon Date (safe for day arithmetic). */
function todayIn(tz: string): Date {
  const [y, m, d] = toYMD(new Date(), tz).split("-").map(Number)
  return new Date(y, m - 1, d, 12)
}

const localYMD = (d: Date) => d.toLocaleDateString("en-CA")

export function presetRange(
  p: Exclude<Preset, "custom">,
  tz: string,
): { from: string; to: string } {
  const today = todayIn(tz)
  const start = new Date(today)
  const end = new Date(today)
  switch (p) {
    case "today":
      break
    case "7d":
      start.setDate(start.getDate() - 6)
      break
    case "30d":
      start.setDate(start.getDate() - 29)
      break
    case "90d":
      start.setDate(start.getDate() - 89)
      break
    case "thisMonth":
      start.setDate(1)
      break
    case "lastMonth":
      start.setMonth(start.getMonth() - 1, 1)
      end.setDate(0) // last day of previous month
      break
  }
  return { from: localYMD(start), to: localYMD(end) }
}

/** "9 oct" / "9 oct 2026" from a YYYY-MM-DD, without timezone drift. */
export function formatYMD(ymd: string, withYear = false): string {
  const [y, m, d] = ymd.split("-").map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d, 12).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  })
}
