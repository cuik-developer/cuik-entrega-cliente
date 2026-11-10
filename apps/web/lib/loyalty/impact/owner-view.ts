import type { ReportView } from "./store"
import type { ImpactSummary } from "./types"

/**
 * The corte as the merchant sees it. The numbers are theirs; what is left
 * out is personal data of people who are NOT their Cuik clients, with one
 * exception the merchant needs: the frequent buyers without a card, which
 * is their own sales data and the list to invite.
 */
export function ownerSummary(s: ImpactSummary): ImpactSummary {
  return {
    ...s,
    staff: {
      // Their own staff: the DNI is enough to recognise the account.
      detected: s.staff.detected.map((d) => ({ ...d, name: null })),
      manual: s.staff.manual,
    },
    brokenFrequency: {
      ...s.brokenFrequency,
      // Only clients with a card (the ones a campaign can reach).
      list: s.brokenFrequency.list.filter((b) => b.registered),
    },
  }
}

export function ownerReport(r: ReportView): ReportView {
  return {
    ...r,
    summary: ownerSummary(r.summary),
    previous: r.previous ? { ...r.previous, summary: ownerSummary(r.previous.summary) } : null,
  }
}
