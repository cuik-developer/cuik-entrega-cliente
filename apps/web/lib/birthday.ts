import { BIRTHDAY_UNKNOWN_YEAR } from "@cuik/shared/validators"

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

/** False when the client gave day and month only (stored with the sentinel year). */
export function hasBirthYear(ymd: string | null | undefined): boolean {
  return !!ymd && Number(ymd.slice(0, 4)) !== BIRTHDAY_UNKNOWN_YEAR
}

/** "12 de mayo" or, when the year is known, "12 de mayo de 1990". */
export function formatBirthday(ymd: string | null | undefined): string {
  if (!ymd) return ""
  const [y, m, d] = ymd.split("-").map(Number)
  const base = `${d} de ${MONTHS[(m - 1 + 12) % 12] ?? m}`
  return hasBirthYear(ymd) ? `${base} de ${y}` : base
}

/** "12/05" or "12/05/1990", for spreadsheets. */
export function formatBirthdayShort(ymd: string | null | undefined): string {
  if (!ymd) return ""
  const [y, m, d] = ymd.split("-")
  return hasBirthYear(ymd) ? `${d}/${m}/${y}` : `${d}/${m}`
}
