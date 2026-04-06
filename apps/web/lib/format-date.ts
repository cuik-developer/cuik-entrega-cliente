/**
 * Formats a date using the tenant's timezone.
 * Uses Intl.DateTimeFormat for proper timezone-aware formatting.
 */
export function formatDate(
  date: Date | string | null | undefined,
  timezone: string,
  options?: { includeTime?: boolean },
): string {
  if (!date) return ""

  const d = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ""

  const includeTime = options?.includeTime ?? true

  const formatOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(includeTime && {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
  }

  return new Intl.DateTimeFormat("es-PE", formatOptions).format(d)
}

/**
 * Formats a date for XLSX exports using the tenant's timezone.
 */
export function formatDateForExport(
  date: Date | string | null | undefined,
  timezone: string,
): string {
  if (!date) return ""

  const d = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ""

  return new Intl.DateTimeFormat("es-PE", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).format(d)
}
