import type { CashbackSettings } from "@cuik/shared/validators"

/**
 * Cashback as the reward of a stamps card, in ONE place.
 *
 * The card of N stamps is "the last N purchases": every stamp keeps a share
 * of its purchase (`visits.cashback_amount`), the client accumulates it on the
 * current card (`clients.cashback_balance`) and, when the card completes, the
 * accumulated amount becomes the reward (`rewards.cashback_amount`) and the
 * balance starts again at 0. Money is handled in integer cents here so
 * 0.1 + 0.2 never shows up as 0.30000000000000004 on a pass.
 */

/** Soles -> cents, rounded (amounts come from the DB as "12.50" strings or numbers). */
export function toCents(value: number | string | null | undefined): number {
  const n = typeof value === "string" ? Number.parseFloat(value) : (value ?? 0)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** Cents -> soles with two decimals, as a number (12.5 -> 12.5). */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100
}

/** Cents -> "12.50", the string the DB numeric columns take. */
export function centsToNumeric(cents: number): string {
  return fromCents(cents).toFixed(2)
}

/** "S/ 12.50": the one format the till, the pass and the panel use. */
export function formatSoles(value: number | string | null | undefined): string {
  return `S/ ${fromCents(toCents(value)).toFixed(2)}`
}

/**
 * Cashback of one purchase, in cents. `multiplier` is a bonus window set to
 * multiply the cashback (x2 = double the percentage for this purchase). The
 * result is rounded to the program's step and capped per purchase.
 */
export function cashbackCentsFor(
  amount: number | string,
  settings: CashbackSettings,
  multiplier = 1,
): number {
  const amountCents = toCents(amount)
  if (amountCents <= 0) return 0
  const raw = (amountCents * settings.percent * Math.max(1, multiplier)) / 100
  const step = Math.max(1, Math.round(settings.roundTo * 100))
  let cents = Math.round(raw / step) * step
  if (settings.maxPerPurchase !== null) {
    cents = Math.min(cents, toCents(settings.maxPerPurchase))
  }
  return Math.max(0, cents)
}

/** Reward label stored in `rewards.reward_type` and shown at the till. */
export function cashbackRewardLabel(cents: number): string {
  return `Cashback ${formatSoles(fromCents(cents))}`
}

/** "5 %" / "7.5 %": the percentage as the pass and the panel print it. */
export function formatPercent(percent: number): string {
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)} %`
}

/** Template variables for the pass and campaigns ({{cashback.balance}}…), already formatted. */
export type CashbackTemplateVars = {
  /** Accumulated on the current card: "S/ 12.50". */
  balance: string
  /** Cashback rewards waiting at the till: "S/ 25.00". */
  pending: string
  /** balance + pending. */
  total: string
  /** "5 %". */
  percent: string
}

export function cashbackTemplateVars(
  settings: CashbackSettings,
  balance: number | string | null | undefined,
  pending: number | string | null | undefined,
): CashbackTemplateVars {
  const b = toCents(balance)
  const p = toCents(pending)
  return {
    balance: formatSoles(fromCents(b)),
    pending: formatSoles(fromCents(p)),
    total: formatSoles(fromCents(b + p)),
    percent: formatPercent(settings.percent),
  }
}

/**
 * Cashback percentage of a raw promotion config as the cashier screens get it
 * from the tenant context, or null when the reward is a gift (or not stamps).
 */
export function cashbackPercentOf(promotionConfig: Record<string, unknown> | null): number | null {
  const stamps = promotionConfig?.stamps as
    | { rewardMode?: unknown; cashback?: { percent?: unknown } | null }
    | undefined
  if (!stamps || stamps.rewardMode !== "cashback") return null
  const percent = stamps.cashback?.percent
  return typeof percent === "number" && percent > 0 ? percent : null
}

/** Short description for admin screens: "5 % de cashback sobre las 5 compras de la tarjeta". */
export function describeCashback(settings: CashbackSettings, maxVisits: number): string {
  const cap =
    settings.maxPerPurchase !== null
      ? ` (máx. ${formatSoles(settings.maxPerPurchase)} por compra)`
      : ""
  return `${formatPercent(settings.percent)} de cashback sobre las ${maxVisits} compras de la tarjeta${cap}`
}
