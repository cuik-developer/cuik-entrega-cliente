/**
 * Which POS sale belongs to which send. A sale is attributed when the same
 * client got a confirmed send ("Enviado" check) before it and the sale falls
 * inside that send's attribution window. One sale, one send: the latest
 * confirmed send wins. Control, pending, skipped and blocked rows never
 * attribute anything.
 */

export type SentRow = {
  recipientId: string
  sendId: string
  clientId: string
  /** Instant of the "Enviado" check (UTC). */
  sentAt: Date
  /** Window of that send, in days. */
  attributionDays: number
}

export type SaleRow = {
  saleId: string
  clientId: string
  soldAt: Date
  /** Tenant-local day of the sale. */
  soldOn: string
  amount: number
}

export type Attribution = {
  recipientId: string
  sendId: string
  clientId: string
  saleId: string
  amount: number
  soldOn: string
  daysAfter: number
}

import { daysBetween } from "./dates"

const DAY_MS = 86_400_000

export function attributeSales(sent: SentRow[], sales: SaleRow[]): Attribution[] {
  const byClient = new Map<string, SentRow[]>()
  for (const s of sent) {
    const list = byClient.get(s.clientId) ?? []
    list.push(s)
    byClient.set(s.clientId, list)
  }
  for (const list of byClient.values()) list.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())

  const out: Attribution[] = []
  for (const sale of sales) {
    if (sale.amount <= 0) continue
    const candidates = byClient.get(sale.clientId)
    if (!candidates) continue
    const t = sale.soldAt.getTime()
    // Latest send first: the first one that contains the sale wins.
    const hit = candidates.find((s) => {
      const start = s.sentAt.getTime()
      return t >= start && t <= start + s.attributionDays * DAY_MS
    })
    if (!hit) continue
    out.push({
      recipientId: hit.recipientId,
      sendId: hit.sendId,
      clientId: sale.clientId,
      saleId: sale.saleId,
      amount: sale.amount,
      soldOn: sale.soldOn,
      daysAfter: Math.floor((t - hit.sentAt.getTime()) / DAY_MS),
    })
  }
  return out
}

/**
 * Buyers and sales of the sent group against the control group of one send.
 * `incremental` is what the sent group sold beyond the control's rate; null
 * without control. `orientative` when the control is too small to trust.
 */
export function sendImpact(input: {
  sent: number
  sentBuyers: number
  sentSales: number
  control: number
  controlBuyers: number
  controlSales: number
  minControl: number
}): {
  sentRate: number | null
  controlRate: number | null
  incremental: number | null
  orientative: boolean
} {
  const sentRate = input.sent > 0 ? input.sentBuyers / input.sent : null
  const controlRate = input.control > 0 ? input.controlBuyers / input.control : null
  let incremental: number | null = null
  if (input.sent > 0 && input.control > 0) {
    const expected = (input.controlSales / input.control) * input.sent
    incremental = Math.round((input.sentSales - expected) * 100) / 100
  }
  return {
    sentRate,
    controlRate,
    incremental,
    orientative: input.control < input.minControl,
  }
}

/**
 * Day of the measuring window today, counted from the first "Enviado" check;
 * null once the last check's window has passed (or nothing was sent).
 */
export function measuringDayOf(
  counts: { firstSentAt: string | null; lastSentAt: string | null },
  attributionDays: number,
  today: string,
  timezone: string,
): number | null {
  if (!counts.firstSentAt || !counts.lastSentAt) return null
  const firstOn = new Date(counts.firstSentAt).toLocaleDateString("en-CA", { timeZone: timezone })
  const lastOn = new Date(counts.lastSentAt).toLocaleDateString("en-CA", { timeZone: timezone })
  if (daysBetween(lastOn, today) > attributionDays) return null
  const day = daysBetween(firstOn, today) + 1
  return day >= 1 ? day : null
}
