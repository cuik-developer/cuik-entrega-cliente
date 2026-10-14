/**
 * CRM math (pure): stage labels, the weighted pipeline and how open
 * prospects enter the Tablero projection.
 */

import type { Currency, ExpectedBillingLike } from "./finance"

export type ProspectStage =
  | "lead"
  | "demo_scheduled"
  | "demo_done"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost"
  | "standby"

export const PROSPECT_STAGE_LABEL: Record<ProspectStage, string> = {
  lead: "Contacto inicial",
  demo_scheduled: "Demo agendada",
  demo_done: "Demo realizada",
  proposal: "Propuesta enviada",
  negotiation: "Negociación",
  won: "Cerrado ganado",
  lost: "Cerrado perdido",
  standby: "Stand-by / sin respuesta",
}
/** Probability suggested when a prospect moves to a stage (editable). */
export const PROSPECT_STAGE_PROBABILITY: Record<ProspectStage, number> = {
  lead: 10,
  demo_scheduled: 30,
  demo_done: 50,
  proposal: 65,
  negotiation: 80,
  won: 100,
  lost: 0,
  standby: 5,
}
/** Still in play (stand-by included, at a low probability). */
export const OPEN_STAGES: ProspectStage[] = [
  "lead",
  "demo_scheduled",
  "demo_done",
  "proposal",
  "negotiation",
  "standby",
]
export const DEMO_STAGES: ProspectStage[] = ["demo_scheduled", "demo_done"]

export type ProspectLike = {
  stage: ProspectStage
  probability: number
  monthlyAmount: number | null
  currency: Currency
  intervalMonths: number
  billingMode: "advance" | "arrears"
  expectedStartMonth: string | null
  demoEndOn: string | null
  nextStepOn: string | null
}

export function isOpen(p: { stage: ProspectStage }): boolean {
  return OPEN_STAGES.includes(p.stage)
}

/** Monthly income in soles a prospect would bring (amount per invoice / interval). */
export function prospectMonthlyPen(p: ProspectLike, usdPen: number): number {
  if (!p.monthlyAmount || p.monthlyAmount <= 0) return 0
  const pen = p.currency === "USD" ? p.monthlyAmount * usdPen : p.monthlyAmount
  return Math.round((pen / Math.max(1, p.intervalMonths)) * 100) / 100
}

export type PipelineSummary = {
  open: number
  inDemo: number
  /** Σ monthly PEN × probability of the open prospects. */
  weightedMonthlyPen: number
  /** Σ monthly PEN of the open prospects, as if all were won. */
  fullMonthlyPen: number
  won: number
  lost: number
  /** Open prospects whose demo ends within 7 days of `today` (or already ended). */
  demosEnding: number
  /** Open prospects with a next step on or before `today`. */
  stepsDue: number
}

export function pipelineSummary(
  prospects: ProspectLike[],
  usdPen: number,
  today: string,
): PipelineSummary {
  const s: PipelineSummary = {
    open: 0,
    inDemo: 0,
    weightedMonthlyPen: 0,
    fullMonthlyPen: 0,
    won: 0,
    lost: 0,
    demosEnding: 0,
    stepsDue: 0,
  }
  const soon = addDays(today, 7)
  for (const p of prospects) {
    if (p.stage === "won") s.won++
    if (p.stage === "lost") s.lost++
    if (!isOpen(p)) continue
    s.open++
    if (DEMO_STAGES.includes(p.stage)) s.inDemo++
    const m = prospectMonthlyPen(p, usdPen)
    s.fullMonthlyPen += m
    s.weightedMonthlyPen += (m * p.probability) / 100
    if (p.demoEndOn && p.demoEndOn <= soon) s.demosEnding++
    if (p.nextStepOn && p.nextStepOn <= today) s.stepsDue++
  }
  s.weightedMonthlyPen = Math.round(s.weightedMonthlyPen * 100) / 100
  s.fullMonthlyPen = Math.round(s.fullMonthlyPen * 100) / 100
  return s
}

/**
 * Open prospects as expected billing for the ledger, weighted by probability.
 * A prospect whose expected start is already behind starts next month.
 */
export function prospectsToExpected(
  prospects: ProspectLike[],
  todayMonth: string,
): ExpectedBillingLike[] {
  const out: ExpectedBillingLike[] = []
  for (const p of prospects) {
    if (!isOpen(p) || !p.monthlyAmount || p.monthlyAmount <= 0 || p.probability <= 0) continue
    if (!p.expectedStartMonth) continue
    const nextMonth = shift(todayMonth, 1)
    const startMonth = p.expectedStartMonth < nextMonth ? nextMonth : p.expectedStartMonth
    out.push({
      amount: Math.round(p.monthlyAmount * p.probability) / 100,
      currency: p.currency,
      intervalMonths: p.intervalMonths,
      billingMode: p.billingMode,
      startMonth,
      firstUncovered: startMonth,
    })
  }
  return out
}

function shift(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number)
  const idx = y * 12 + (m - 1) + n
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`
}
function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
