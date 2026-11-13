/**
 * Who issues Cuik's invoices and under which tax regime (pure). An issuer is
 * valid for a range of months ("YYYY-MM", inclusive; null = open end); a tax
 * profile applies from its month until the next profile of the same issuer.
 * Making Brands issued until 2026-10, CUIK E.I.R.L. from 2026-11.
 */

export type TaxRegime = "rmt" | "rer" | "general"

export const REGIME_LABEL: Record<TaxRegime, string> = {
  rmt: "MYPE Tributario",
  rer: "Régimen Especial (RER)",
  general: "Régimen General",
}

export type IssuerLike = {
  id: string
  fromMonth: string | null
  toMonth: string | null
}

export type ProfileLike = {
  issuerId: string
  fromMonth: string
}

/** Whether `month` falls inside the issuer's validity. */
export function issuerCovers(issuer: Pick<IssuerLike, "fromMonth" | "toMonth">, month: string) {
  return (
    (issuer.fromMonth === null || issuer.fromMonth <= month) &&
    (issuer.toMonth === null || month <= issuer.toMonth)
  )
}

/** The issuer that invoices in `month`, or null when none covers it. */
export function issuerForMonth<T extends IssuerLike>(issuers: T[], month: string): T | null {
  return issuers.find((i) => issuerCovers(i, month)) ?? null
}

/**
 * The first other issuer whose validity overlaps the candidate's, or null.
 * Two issuers can never invoice the same month.
 */
export function overlappingIssuer<T extends IssuerLike>(
  issuers: T[],
  candidate: Pick<IssuerLike, "fromMonth" | "toMonth">,
  excludeId?: string,
): T | null {
  const lo = (m: string | null) => m ?? "0000-00"
  const hi = (m: string | null) => m ?? "9999-99"
  return (
    issuers.find(
      (i) =>
        i.id !== excludeId &&
        lo(i.fromMonth) <= hi(candidate.toMonth) &&
        lo(candidate.fromMonth) <= hi(i.toMonth),
    ) ?? null
  )
}

/** The profile in force for `issuerId` in `month`: the latest one starting on or before it. */
export function profileForMonth<T extends ProfileLike>(
  profiles: T[],
  issuerId: string,
  month: string,
): T | null {
  let best: T | null = null
  for (const p of profiles) {
    if (p.issuerId !== issuerId || p.fromMonth > month) continue
    if (!best || p.fromMonth > best.fromMonth) best = p
  }
  return best
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Splits an amount into taxable base, IGV and total. When the amount already
 * includes IGV the base is amount / (1 + rate) (S/ 250 → 211.86 + 38.14);
 * otherwise IGV is added on top (S/ 250 → 250 + 45 = 295). The IGV is the
 * difference so the three always add up.
 */
export function splitIgv(
  amount: number,
  includesIgv: boolean,
  igvRate: number,
): { base: number; igv: number; total: number } {
  if (includesIgv) {
    const total = round2(amount)
    const base = round2(total / (1 + igvRate))
    return { base, igv: round2(total - base), total }
  }
  const base = round2(amount)
  const igv = round2(base * igvRate)
  return { base, igv, total: round2(base + igv) }
}

/** "2026-11" → "nov 2026". */
export function monthShort(month: string): string {
  const names = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"]
  const [y, m] = month.split("-")
  return `${names[Number(m) - 1] ?? m} ${y}`
}

/** "Desde nov 2026", "Hasta oct 2026", "nov 2026 – dic 2027" or "Siempre". */
export function validityLabel(issuer: Pick<IssuerLike, "fromMonth" | "toMonth">): string {
  const { fromMonth: f, toMonth: t } = issuer
  if (f && t) return `${monthShort(f)} – ${monthShort(t)}`
  if (f) return `Desde ${monthShort(f)}`
  if (t) return `Hasta ${monthShort(t)}`
  return "Siempre"
}
