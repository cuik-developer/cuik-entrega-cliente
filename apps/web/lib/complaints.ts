import { businessDaysBetween } from "./business-days"

/**
 * Libro de Reclamaciones helpers shared by the public route and the
 * super-admin screen. Pure: safe in client components.
 */

export type ComplaintStatus = "pending" | "answered" | "closed"
export type EmailStatus = "sent" | "failed" | "partial"

/** "9 de noviembre de 2026" for a "YYYY-MM-DD" date. */
export function longDate(ymd: string): string {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", dateStyle: "long" }).format(
    new Date(`${ymd}T00:00:00Z`),
  )
}

/** sendEmail never throws: it resolves to `{ error }` when Resend refuses. */
export function emailDelivered(r: PromiseSettledResult<{ id: string } | { error: string }>) {
  return r.status === "fulfilled" && !("error" in r.value)
}

/** All delivered → sent, none → failed, some → partial. */
export function emailStatusOf(
  results: PromiseSettledResult<{ id: string } | { error: string }>[],
): EmailStatus {
  const ok = results.filter(emailDelivered).length
  if (ok === results.length) return "sent"
  if (ok === 0) return "failed"
  return "partial"
}

export type DeadlineBadge = {
  label: string
  tone: "bad" | "warn" | "mute" | "ok"
}

/**
 * Deadline badge of a complaint on `today` (Lima "YYYY-MM-DD"): answered or
 * closed ones show "Respondido"/"Cerrado"; pending ones are overdue after the
 * due date, amber when 3 business days or fewer remain (the due day included),
 * neutral otherwise.
 */
export function deadlineBadge(
  c: { status: ComplaintStatus; dueOn: string },
  today: string,
): DeadlineBadge {
  if (c.status === "answered") return { label: "Respondido", tone: "ok" }
  if (c.status === "closed") return { label: "Cerrado", tone: "mute" }
  if (today > c.dueOn) return { label: "Vencido", tone: "bad" }
  if (today === c.dueOn) return { label: "Vence hoy", tone: "warn" }
  const left = businessDaysBetween(today, c.dueOn)
  const label = left === 1 ? "1 día hábil" : `${left} días hábiles`
  return { label, tone: left <= 3 ? "warn" : "mute" }
}
