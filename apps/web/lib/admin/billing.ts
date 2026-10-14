/**
 * Billing calendar math for the super-admin "Facturación" section. Pure:
 * works on "YYYY-MM-DD" strings in the Cuik office timezone (America/Lima).
 */

export const BILLING_TIMEZONE = "America/Lima"

/** How long after the due date an unissued invoice counts as overdue. */
export const OVERDUE_AFTER_DAYS = 7

/**
 * "advance": the invoice of a period is due on that period's billing day (the
 * month is paid at its start). "arrears": a period is invoiced on the billing
 * day of the following month (the month is paid once it ended).
 */
export type BillingMode = "advance" | "arrears"

export type BillingRule = {
  /** "YYYY-MM-DD" | null: day the service started. Periods run monthly from it. */
  serviceStartOn: string | null
  /** Optional override 1..28; null = day of serviceStartOn (capped at 28). */
  billingDay: number | null
  /** Defaults to "advance" (the original behaviour) when absent. */
  billingMode?: BillingMode | null
  /** Months covered by each invoice: 1 (default), 3, 6 or 12. */
  intervalMonths?: BillingInterval | null
}

export type BillingInterval = 1 | 3 | 6 | 12
export const BILLING_INTERVALS: BillingInterval[] = [1, 3, 6, 12]
/** Narrows a stored integer to a supported interval (anything else = monthly). */
export function asInterval(n: number | null | undefined): BillingInterval {
  return n === 3 || n === 6 || n === 12 ? n : 1
}
export const BILLING_INTERVAL_LABEL: Record<BillingInterval, string> = {
  1: "Mensual",
  3: "Trimestral",
  6: "Semestral",
  12: "Anual",
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
  /** Service period that `nextDue` invoices, by its first month "YYYY-MM". */
  nextPeriod: string | null
  /** Months each invoice covers (1, 3, 6 or 12), for period labels. */
  intervalMonths: BillingInterval
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

/**
 * Service period an invoice due on `dueYmd` pays for, as its first month
 * ("YYYY-MM"). In advance that is the due month; in arrears the period ended
 * just before the due date, so it started `months` months earlier.
 */
export function periodOf(
  dueYmd: string,
  mode: BillingMode = "advance",
  months: BillingInterval = 1,
): string {
  if (mode === "advance") return dueYmd.slice(0, 7)
  return shiftMonth(dueYmd.slice(0, 7), -months)
}

/** "YYYY-MM" moved by `n` months. */
export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`
}

const MONTH_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "set",
  "oct",
  "nov",
  "dic",
]

/** "oct 2026" for a monthly period, "oct 2026 – sep 2027" for a longer one. */
export function periodLabel(period: string, months: BillingInterval = 1): string {
  const fmt = (ym: string) => {
    const [y, m] = ym.split("-").map(Number)
    return `${MONTH_SHORT[(m - 1 + 12) % 12] ?? ym} ${y}`
  }
  if (months <= 1) return fmt(period)
  return `${fmt(period)} – ${fmt(shiftMonth(period, months - 1))}`
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

/**
 * First due date. In advance: the service start itself (the first period is
 * billed at start). In arrears: the billing day one period after the start
 * (the first period is billed once it ended).
 */
export function firstDue(rule: BillingRule): string | null {
  if (!rule.serviceStartOn) return null
  if ((rule.billingMode ?? "advance") === "advance") return rule.serviceStartOn
  const day = effectiveBillingDay(rule)
  if (!day) return null
  return addMonths(dueInMonthOf(rule.serviceStartOn, day), rule.intervalMonths ?? 1, day)
}

/** Full months elapsed between `serviceStartOn` and `today` (0 within the first month). */
export function monthsOfService(serviceStartOn: string, today: string): number {
  if (today < serviceStartOn) return 0
  const [y1, m1, d1] = split(serviceStartOn)
  const [y2, m2, d2] = split(today)
  let months = (y2 - y1) * 12 + (m2 - m1)
  // Same cap as the billing day: a service started on the 31st completes its
  // month on the 28th, when that month's invoice is due.
  if (d2 < Math.min(d1, 28)) months -= 1
  return Math.max(0, months)
}

/**
 * "5 meses y 4 días" since `serviceStartOn` (calendar months, then days),
 * for the tenant summary. Empty string when the start is in the future.
 */
export function activeTimeLabel(serviceStartOn: string, today: string): string {
  if (today < serviceStartOn) return `Empieza el ${formatYmd(serviceStartOn)}`
  const [y1, m1, d1] = split(serviceStartOn)
  const [y2, m2, d2] = split(today)
  // Same 28-day cap as monthsOfService, so "Tiempo activo" and the invoice
  // count never disagree (a service started on the 31st completes its month on the 28th).
  const day = Math.min(d1, 28)
  let months = (y2 - y1) * 12 + (m2 - m1)
  if (d2 < day) months -= 1
  // Day remainder: distance from the last monthly anniversary to today.
  const anchor = new Date(Date.UTC(y1, m1 - 1 + months, day))
  const days = Math.max(0, Math.round((Date.UTC(y2, m2 - 1, d2) - anchor.getTime()) / 86_400_000))
  const m = months === 1 ? "1 mes" : `${months} meses`
  const d = days === 1 ? "1 día" : `${days} días`
  if (months === 0) return d
  if (days === 0) return m
  return `${m} y ${d}`
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
    nextPeriod: null,
    intervalMonths: rule.intervalMonths ?? 1,
    daysUntilNext: null,
    daysOverdue: null,
    monthsOfService: null,
  }
  const mode: BillingMode = rule.billingMode ?? "advance"
  const every: BillingInterval = rule.intervalMonths ?? 1
  const first = firstDue(rule)
  const day = effectiveBillingDay(rule)
  if (!first || !day || !rule.serviceStartOn) return empty
  const invoiced = new Set(invoicedPeriods)

  if (first > today) {
    // In arrears the service may already be running with nothing to invoice yet.
    const started = rule.serviceStartOn <= today
    return {
      ...empty,
      status: started ? "al_dia" : "sin_iniciar",
      nextDue: first,
      nextPeriod: periodOf(first, mode, every),
      intervalMonths: every,
      daysUntilNext: daysBetween(today, first),
      monthsOfService: started ? monthsOfService(rule.serviceStartOn, today) : 0,
    }
  }

  // Most recent due date ≤ today, stepping one period at a time from the first one.
  let currentDue = first
  for (;;) {
    const next = addMonths(currentDue, every, day)
    if (next > today) break
    currentDue = next
  }
  const currentPeriod = periodOf(currentDue, mode, every)
  const invoicedNow = invoiced.has(currentPeriod)

  const nextDue =
    invoicedNow || currentDue !== today ? addMonths(currentDue, every, day) : currentDue
  const daysOverdue = invoicedNow ? null : daysBetween(currentDue, today)

  let status: BillingStatus = "al_dia"
  if (!invoicedNow) status = (daysOverdue ?? 0) > OVERDUE_AFTER_DAYS ? "vencida" : "pendiente"

  return {
    status,
    currentDue,
    currentPeriod,
    nextDue,
    nextPeriod: periodOf(nextDue, mode, every),
    intervalMonths: every,
    daysUntilNext: daysBetween(today, nextDue),
    daysOverdue,
    monthsOfService: monthsOfService(rule.serviceStartOn, today),
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
