/**
 * Wall-clock time in a named timezone <-> UTC instant. No library: the
 * offset is read from Intl for the instant in question (two passes so a
 * DST boundary resolves correctly). Safe in client components.
 */

function partsInZone(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0")
  return {
    y: get("year"),
    mo: get("month"),
    d: get("day"),
    h: get("hour"),
    mi: get("minute"),
    s: get("second"),
  }
}

function offsetMs(instant: Date, timeZone: string): number {
  const p = partsInZone(instant, timeZone)
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s)
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/**
 * "YYYY-MM-DDTHH:mm" read as wall time in `timeZone` -> UTC Date.
 * Returns null for an empty or malformed string.
 */
export function wallTimeToUtc(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (!m) return null
  const [, y, mo, d, h, mi] = m.map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  let off = offsetMs(new Date(guess), timeZone)
  let result = new Date(guess - off)
  const off2 = offsetMs(result, timeZone)
  if (off2 !== off) {
    off = off2
    result = new Date(guess - off)
  }
  return result
}

/** UTC instant -> "YYYY-MM-DDTHH:mm" wall time in `timeZone` (for a datetime-local input). */
export function utcToWallTime(instant: Date | string, timeZone: string): string {
  const p = partsInZone(new Date(instant), timeZone)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`
}
