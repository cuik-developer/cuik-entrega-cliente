import type { SuggestionReason } from "./audiences"
import { WEEKDAY_NAMES } from "./dates"

/** Labels shared by the Growth screens (merchant panel and super-admin). Client-safe: no DB here. */

export type Tone = "ok" | "info" | "warn" | "bad" | "mute"

export const RECIPIENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pendiente", tone: "mute" },
  opened: { label: "Abierto sin confirmar", tone: "warn" },
  sent: { label: "Enviado", tone: "ok" },
  replied: { label: "Respondió", tone: "ok" },
  skipped: { label: "Omitido", tone: "mute" },
  control: { label: "Control · no escribir", tone: "info" },
  blocked: { label: "No contactar", tone: "bad" },
}

export const BLOCK_REASONS: { value: string; label: string }[] = [
  { value: "pet_died", label: "Mascota falleció" },
  { value: "asked_no_contact", label: "Pidió no recibir mensajes" },
  { value: "wrong_number", label: "Número equivocado" },
  { value: "other", label: "Otro" },
]

export function blockReasonLabel(reason: string): string {
  return BLOCK_REASONS.find((r) => r.value === reason)?.label ?? reason
}

export const SUGGESTION_LABEL: Record<SuggestionReason, string> = {
  ready: "Listo",
  not_yet: "Todavía no le toca",
  cooldown: "Contactado hace poco",
  open_send: "En otro envío abierto",
  no_contact: "No contactar",
  control: "En control de otro envío",
}

export const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp 1 a 1",
  export: "Exportar lista",
}

export const soles = (n: number | null | undefined, decimals = 0): string =>
  n == null
    ? "—"
    : `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`

export const pct = (p: number | null | undefined): string =>
  p == null ? "—" : `${Math.round(p * 100)} %`

export const fmtDay = (ymd: string | null | undefined): string => {
  if (!ymd) return "—"
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d, 12).toLocaleDateString("es-PE", { day: "numeric", month: "short" })
}

export const fmtDayYear = (ymd: string | null | undefined): string => {
  if (!ymd) return "—"
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d, 12).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export const fmtTime = (iso: string | null | undefined, timezone: string): string => {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString("es-PE", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  })
}

export const fmtDateTime = (iso: string | null | undefined, timezone: string): string => {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("es-PE", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export const fmtMonth = (ym: string): string => {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m - 1, 1, 12).toLocaleDateString("es-PE", { month: "long", year: "numeric" })
}

export function weekdayLabel(weekday: number | null | undefined): string | null {
  return weekday == null ? null : WEEKDAY_NAMES[weekday]
}

/** "compra cada 12 días · lleva 30 sin venir". */
export function rhythmPhrase(input: {
  intervalDays: number | null
  daysSince: number | null
  habitualWeekday?: number | null
}): string {
  const parts: string[] = []
  if (input.intervalDays) parts.push(`compra cada ${Math.round(input.intervalDays)} días`)
  const wd = weekdayLabel(input.habitualWeekday)
  if (wd) parts.push(`los ${wd}${wd.endsWith("s") ? "" : "s"}`)
  if (input.daysSince != null) parts.push(`lleva ${input.daysSince} sin venir`)
  return parts.join(" · ")
}

/** Peruvian mobile shown as "998 170 096". */
export function phoneLabel(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "")
  if (digits.length === 9) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  return phone ?? "—"
}
