import { MensajePersonalizado, sendEmail } from "@cuik/email"
import { limaYmd } from "./business-days"

/**
 * Daily cap on the notification emails Cuik sends to itself (SA_EMAIL) from
 * public forms, so a flood that gets past Turnstile and the per-IP limits
 * cannot bury the inbox. The first DAILY_NOTIFY_CAP of each kind per Lima day
 * are emailed; the next one triggers a single "cap reached" notice; the rest
 * are not emailed. Complaints and merchant requests are still stored and
 * listed in super-admin; contact messages are not stored, so past the cap they
 * are only logged. In memory: a redeploy starts the count again.
 */

export const DAILY_NOTIFY_CAP = 20

export type NotifyKind = "reclamaciones" | "solicitudes" | "contacto"

export type NotifyDecision = "send" | "cap-reached" | "skip"

const counters = new Map<string, number>()

export function notifyDecision(kind: NotifyKind, now: Date = new Date()): NotifyDecision {
  const day = limaYmd(now)
  for (const key of counters.keys()) {
    if (!key.endsWith(`:${day}`)) counters.delete(key)
  }
  const key = `${kind}:${day}`
  const n = (counters.get(key) ?? 0) + 1
  counters.set(key, n)
  if (n <= DAILY_NOTIFY_CAP) return "send"
  if (n === DAILY_NOTIFY_CAP + 1) return "cap-reached"
  return "skip"
}

/** Test hook. */
export function resetNotifyCounters() {
  counters.clear()
}

const WHERE: Record<NotifyKind, { label: string; after: string }> = {
  reclamaciones: {
    label: "Libro de Reclamaciones",
    after:
      "Las hojas siguientes de hoy se siguen registrando y numerando (el consumidor recibe su copia); revísalas en Super-admin › Reclamaciones.",
  },
  solicitudes: {
    label: "Solicitudes de comercios",
    after:
      "Las solicitudes siguientes de hoy se siguen guardando; revísalas en Super-admin › Solicitudes.",
  },
  contacto: {
    label: "Contacto",
    after:
      "Los mensajes de Contacto no se guardan en la base: los siguientes de hoy no te llegarán por correo (quedan solo en los logs del servidor).",
  },
}

/** The single notice sent when a kind passes the daily cap. */
export function sendCapReachedNotice(kind: NotifyKind) {
  const to = process.env.SA_EMAIL || "sa@cuik.app"
  const { label, after } = WHERE[kind]
  return sendEmail({
    to,
    subject: `Tope diario de avisos alcanzado · ${label}`,
    template: MensajePersonalizado({
      preview: `Más de ${DAILY_NOTIFY_CAP} avisos de ${label} hoy`,
      heading: `Llegaron más de ${DAILY_NOTIFY_CAP} avisos de ${label} hoy`,
      paragraphs: [
        `Para no llenar tu bandeja, dejamos de enviarte un correo por cada uno hasta mañana.`,
        after,
        "Si no esperabas tanto movimiento, podría ser un intento de spam: avísale al equipo técnico.",
      ],
    }),
  }).catch((err) => console.error("[notify-cap] notice failed", kind, err))
}
