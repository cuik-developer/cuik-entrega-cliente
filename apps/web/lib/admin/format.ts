/**
 * Shared formatting and fetch helpers of the super-admin Finanzas screens
 * (client-safe: no server imports).
 */

/** "S/ 1,234.50"; never "-0.00". */
export function soles(n: number): string {
  const v = Math.abs(n) < 0.005 ? 0 : n
  return `S/ ${v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Whole soles, as declared in the PDT 621. */
export function solesInt(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`
}

/** "S/ 250.00" or "US$ 12.00". */
export function money(n: number, currency: "PEN" | "USD"): string {
  const v = Math.abs(n) < 0.005 ? 0 : n
  return `${currency === "USD" ? "US$" : "S/"} ${v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** "2026-11-05" → "05/11/2026"; "—" when empty. */
export function ymd(d: string | null | undefined): string {
  if (!d) return "—"
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y}`
}

/** Today in Lima as "YYYY-MM-DD". */
export function todayLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" })
}

/**
 * fetch + JSON for the admin API ({ success, data, error, details }); throws
 * the API's Spanish message (first field error first).
 */
export async function apiCall<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) {
    const fe = json?.details?.fieldErrors as Record<string, string[]> | undefined
    const first = fe ? Object.values(fe).flat()[0] : undefined
    const form = (json?.details?.formErrors as string[] | undefined)?.[0]
    throw new Error(first ?? form ?? json?.error ?? "No se pudo guardar")
  }
  return json.data as T
}

/** POST of one file as multipart (field "file", plus extra fields). */
export async function apiUpload<T>(
  url: string,
  file: File,
  fields: Record<string, string> = {},
): Promise<T> {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  fd.set("file", file)
  const res = await fetch(url, { method: "POST", body: fd })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) throw new Error(json?.error ?? "No se pudo subir el archivo")
  return json.data as T
}
