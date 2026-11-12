import { z } from "zod"

/**
 * Growth rules per tenant (growth.tenant_rules): what decides whom to
 * suggest, when, how a sale is attributed and what is billed. Cuik sets them
 * from the super-admin; the merchant sees them and cannot edit them.
 * Defaults agreed with Francesco on 12 Nov 2026 (docs/GROWTH_PRODUCTO.md).
 */
export type GrowthRules = {
  /** Days without suggesting a client again after a confirmed send (any audience). */
  cooldownDays: number
  /** The suggested day is never more than this many days before the expected purchase. */
  maxEarlyDays: number
  /** Purchases (distinct days) needed to use the client's own interval. */
  minPurchases: number
  /** "En riesgo" = more than riskFactor × interval without buying. */
  riskFactor: number
  /** Days after the "Enviado" check during which a POS sale is attributed to the send. */
  attributionDays: number
  /** Share of each send drawn as control group (not contacted). */
  controlPct: number
  /** Fewer than this in control marks the result "orientativo". */
  minControl: number
  /** Fixed monthly fee (S/). */
  feeFixed: number
  /** Variable % over attributed sales; null = none. */
  feeVariablePct: number | null
  pilotMonths: number
  /** Service start (YYYY-MM-DD); null = not started. */
  startsOn: string | null
  /** Audience slugs switched off for this tenant. */
  audiencesOff: string[]
}

export const DEFAULT_RULES: GrowthRules = {
  cooldownDays: 14,
  maxEarlyDays: 7,
  minPurchases: 3,
  riskFactor: 1.5,
  attributionDays: 10,
  controlPct: 10,
  minControl: 30,
  feeFixed: 199,
  feeVariablePct: null,
  pilotMonths: 2,
  startsOn: null,
  audiencesOff: [],
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** Body of PUT /api/admin/tenants/[id]/growth: every field optional, the rest is kept. */
export const growthRulesSchema = z.object({
  cooldownDays: z.number().int().min(3).max(60).optional(),
  maxEarlyDays: z.number().int().min(0).max(14).optional(),
  minPurchases: z.number().int().min(2).max(10).optional(),
  riskFactor: z.number().min(1.2).max(3).optional(),
  attributionDays: z.number().int().min(3).max(30).optional(),
  controlPct: z.number().int().min(0).max(30).optional(),
  minControl: z.number().int().min(5).max(200).optional(),
  feeFixed: z.number().min(0).max(100_000).optional(),
  feeVariablePct: z.number().min(0).max(50).nullable().optional(),
  pilotMonths: z.number().int().min(0).max(12).optional(),
  startsOn: z.string().regex(YMD, "Fecha inválida").nullable().optional(),
  audiencesOff: z.array(z.string().min(1).max(40)).max(50).optional(),
})
export type GrowthRulesPatch = z.infer<typeof growthRulesSchema>

/** Variable fee of a month: attributed sales × pct, rounded to cents. */
export function variableFee(attributed: number, pct: number | null): number {
  if (!pct || attributed <= 0) return 0
  return Math.round(attributed * pct) / 100
}
