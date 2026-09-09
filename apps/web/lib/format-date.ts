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

/**
 * The panel's one date-time format: "9 set. 2026, 15:32" (es-PE, 24 h, tenant
 * timezone). Every on-screen date in /panel goes through this so Clientes,
 * Campañas, Cajeros and the Dashboard read the same. Exports keep their own
 * spreadsheet-friendly format (formatDateForExport).
 */
export function formatDateTime(
  date: Date | string | null | undefined,
  timezone: string,
  options?: { placeholder?: string },
): string {
  const placeholder = options?.placeholder ?? "—"
  if (!date) return placeholder

  const d = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return placeholder

  return new Intl.DateTimeFormat("es-PE", {
    timeZone: timezone || "America/Lima",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d)
}
