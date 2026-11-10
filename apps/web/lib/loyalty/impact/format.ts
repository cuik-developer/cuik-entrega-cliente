/** Formatters shared by the Impacto screens (super-admin and merchant panel). */

export const pctText = (p: number | null | undefined) => (p == null ? "—" : `${p} %`)
export const daysText = (d: number | null | undefined) => (d == null ? "—" : `${d} d`)
export const soles = (n: number | null | undefined) =>
  n == null ? "—" : `S/ ${Math.round(n).toLocaleString("es-PE")}`
export const fmtDay = (ymd: string | null | undefined) => {
  if (!ymd) return "—"
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d, 12).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}
export const fmtMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m - 1, 1, 12).toLocaleDateString("es-PE", { month: "short", year: "2-digit" })
}
export const delta = (
  now: number | null | undefined,
  before: number | null | undefined,
  unit = "",
) => {
  if (now == null || before == null) return null
  const d = Math.round((now - before) * 10) / 10
  return `${d > 0 ? "+" : ""}${d}${unit}`
}
