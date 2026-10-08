/**
 * Billing calendar math for the super-admin "Facturación" section. Pure:
 * works on "YYYY-MM-DD" strings in the Cuik office timezone (America/Lima).
 */

export const BILLING_TIMEZONE = "America/Lima"

/** How long after the due date an unissued invoice counts as overdue. */
export const OVERDUE_AFTER_DAYS = 7

export type BillingRule = {
  /** "YYYY-MM-DD" | null: day the service started. Periods run monthly from it. */
  serviceStartOn: string | null
  /** Optional override 1..28; null = day of serviceStartOn (capped at 28). */
  billingDay: number | null
}

export type BillingStatus =
  | "sin_configurar" // no service start yet
  | "sin_iniciar" // configured, service starts in the future
  | "al_dia" // invoice for the current period exists
  | "pendiente" // due date passed (≤ 7 days), no invoice yet
  | "vencida" // due date passed more than 7 days ago, no invoice

export type BillingOutlook = {
  status: BillingStatus
  /** Most recent due date ≤ today, "YYYY-MM-DD" (null before the first one). */
  currentDue: string | null
  /** Period of `currentDue`, "YYYY-MM". */
  currentPeriod: string | null
  /** Next due date strictly after today (or today itself when due today and not yet invoiced). */
  nextDue: string | null
  /** Days from today to `nextDue` (0 = today). */
  daysUntilNext: number | null
  /** Days since `currentDue` when it has no invoice. */
  daysOverdue: number | null
  /** Full months elapsed since the service start (0 during the first month). */
  monthsOfService: number | null
}

export function todayYmd(now = new Date(), timezone = BILLING_TIMEZONE): string {
  return now.toLocaleDateString("en-CA", { timeZone: timezone })
}

function split(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split("-").map(Number)
  return [y, m, d]
}

function ymd(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10)
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  const [y1, m1, d1] = split(fromYmd)
  const [y2, m2, d2] = split(toYmd)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

export function periodOf(dueYmd: string): string {
  return dueYmd.slice(0, 7)
}

/** Due date (billing day) of the month that contains `ymd`. */
function dueInMonthOf(ymd: string, billingDay: number): string {
  const [y, m] = split(ymd)
  return ymd_(y, m, billingDay)
}
function ymd_(y: number, m: number, d: number) {
  return ymd(y, m, d)
}

function addMonths(due: string, months: number, billingDay: number): string {
  const [y, m] = split(due)
  const total = y * 12 + (m - 1) + months
  return ymd(Math.floor(total / 12), (total % 12) + 1, billingDay)
}

/** Day of month the invoices fall on: override, else the service start day capped at 28. */
export function effectiveBillingDay(rule: BillingRule): number | null {
  if (rule.billingDay) return rule.billingDay
  if (!rule.serviceStartOn) return null
  return Math.min(split(rule.serviceStartOn)[2], 28)
}

/** First due date: the service start itself (first month is billed at start). */
export function firstDue(rule: BillingRule): string | null {
  return rule.serviceStartOn ?? null
}

/** Full months elapsed between `serviceStartOn` and `today` (0 within the first month). */
export function monthsOfService(serviceStartOn: string, today: string): number {
  if (today < serviceStartOn) return 0
  const [y1, m1, d1] = split(serviceStartOn)
  const [y2, m2, d2] = split(today)
  let months = (y2 - y1) * 12 + (m2 - m1)
  if (d2 < d1) months -= 1
  return Math.max(0, months)
}

/**
 * Where the tenant stands today given its rule and the periods that already
 * have a (non-void) invoice. Due dates: service start, then every month on
 * the billing day.
 */
export function billingOutlook(
  rule: BillingRule,
  invoicedPeriods: Iterable<string>,
  today: string = todayYmd(),
): BillingOutlook {
  const empty: BillingOutlook = {
    status: "sin_configurar",
    currentDue: null,
    currentPeriod: null,
    nextDue: null,
    daysUntilNext: null,
    daysOverdue: null,
    monthsOfService: null,
  }
  const first = firstDue(rule)
  const day = effectiveBillingDay(rule)
  if (!first || !day) return empty
  const invoiced = new Set(invoicedPeriods)

  if (first > today) {
    return {
      ...empty,
      status: "sin_iniciar",
      nextDue: first,
      daysUntilNext: daysBetween(today, first),
      monthsOfService: 0,
    }
  }

  // Most recent due date ≤ today: the start itself, or the billing day of this/previous month.
  let currentDue = dueInMonthOf(today, day)
  if (currentDue > today) currentDue = addMonths(currentDue, -1, day)
  if (currentDue < first) currentDue = first
  const currentPeriod = periodOf(currentDue)
  const invoicedNow = invoiced.has(currentPeriod)

  const nextDue = invoicedNow || currentDue !== today ? addMonths(currentDue, 1, day) : currentDue
  const daysOverdue = invoicedNow ? null : daysBetween(currentDue, today)

  let status: BillingStatus = "al_dia"
  if (!invoicedNow) status = (daysOverdue ?? 0) > OVERDUE_AFTER_DAYS ? "vencida" : "pendiente"

  return {
    status,
    currentDue,
    currentPeriod,
    nextDue,
    daysUntilNext: daysBetween(today, nextDue),
    daysOverdue,
    monthsOfService: monthsOfService(first, today),
  }
}

export const BILLING_STATUS_LABEL: Record<BillingStatus, string> = {
  sin_configurar: "Sin configurar",
  sin_iniciar: "Aún no inicia",
  al_dia: "Al día",
  pendiente: "Pendiente de emitir",
  vencida: "Vencida",
}

/** "16 nov 2026" in Spanish, from "YYYY-MM-DD". */
export function formatYmd(ymdStr: string): string {
  const [y, m, d] = split(ymdStr)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}
