/** Campaign wording shared by the super-admin views (client-safe, no server imports). */

export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled"
export type CampaignType = "push" | "wallet_update" | "email"
export type RecurringStatus = "active" | "paused" | "finished"
export type ChipTone = "ok" | "info" | "warn" | "bad" | "mute"

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Borrador",
  scheduled: "Programada",
  sending: "Enviando",
  sent: "Enviada",
  cancelled: "Cancelada",
}

export const CAMPAIGN_STATUS_TONE: Record<CampaignStatus, ChipTone> = {
  draft: "mute",
  scheduled: "info",
  sending: "warn",
  sent: "ok",
  cancelled: "mute",
}

export const CAMPAIGN_TYPE_LABEL: Record<CampaignType, string> = {
  push: "Push",
  wallet_update: "Actualización de pase",
  email: "Correo",
}

export const RECURRING_STATUS_LABEL: Record<RecurringStatus, string> = {
  active: "Activa",
  paused: "Pausada",
  finished: "Terminada",
}

export const RECURRING_STATUS_TONE: Record<RecurringStatus, ChipTone> = {
  active: "ok",
  paused: "warn",
  finished: "mute",
}

export const CHANNEL_LABEL: Record<string, string> = {
  wallet_push: "Wallet (push)",
  email: "Correo",
}

/** A draft that carries a send error is what the super-admin calls "fallida". */
export function isFailed(c: { status: string; lastError: string | null }): boolean {
  return c.status === "draft" && Boolean(c.lastError)
}

export function statusLabel(c: { status: string; lastError: string | null }): string {
  if (isFailed(c)) return "Fallida"
  return CAMPAIGN_STATUS_LABEL[c.status as CampaignStatus] ?? c.status
}

export function statusTone(c: { status: string; lastError: string | null }): ChipTone {
  if (isFailed(c)) return "bad"
  return CAMPAIGN_STATUS_TONE[c.status as CampaignStatus] ?? "mute"
}
