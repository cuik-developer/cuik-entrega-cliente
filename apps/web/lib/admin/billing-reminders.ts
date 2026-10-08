import { db, eq, globalConfig, user } from "@cuik/db"
import { MensajePersonalizado, sendEmail } from "@cuik/email"
import { createElement } from "react"
import { daysBetween, formatYmd, todayYmd } from "./billing"
import { type BillingDueRow, billingDueRows } from "./billing-overview"

/** How many days before the due date the heads-up goes out. */
export const REMINDER_DAYS_BEFORE = 3

export type ReminderRunResult =
  | { status: "skipped"; reason: "nothing_due" | "no_recipients" | "already_sent_today" }
  | { status: "sent"; to: string[]; upcoming: number; overdue: number }
  | { status: "error"; error: string }

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://cuik.org").replace(/\/+$/, "")
}

function money(r: BillingDueRow): string {
  const a = r.outlook.monthlyAmount
  if (a === null) return ""
  return ` (${r.outlook.currency === "USD" ? "US$" : "S/"} ${a.toLocaleString("es-PE", { minimumFractionDigits: 2 })})`
}

/**
 * What the reminder would say today. Pure, so it can be unit-tested.
 * `missedDays` = days the cron did not run before today: the heads-up window
 * widens from "exactly 3 days ahead" to "1..3 days ahead" so a missed run
 * never loses an invoice.
 */
export function composeReminder(rows: BillingDueRow[], today: string, missedDays = 0) {
  const minAhead = Math.max(1, REMINDER_DAYS_BEFORE - missedDays)
  const upcoming = rows.filter(
    (r) =>
      ["active", "trial", "expired"].includes(r.tenantStatus) &&
      r.outlook.status !== "pendiente" &&
      r.outlook.status !== "vencida" &&
      r.outlook.daysUntilNext !== null &&
      r.outlook.daysUntilNext >= minAhead &&
      r.outlook.daysUntilNext <= REMINDER_DAYS_BEFORE,
  )
  const overdue = rows.filter(
    (r) => r.outlook.status === "pendiente" || r.outlook.status === "vencida",
  )
  if (upcoming.length === 0 && overdue.length === 0) return null

  const paragraphs: string[] = []
  if (upcoming.length > 0) {
    paragraphs.push(
      `Facturas para emitir en ${REMINDER_DAYS_BEFORE} días:\n${upcoming
        .map((r) => `• ${r.tenantName}: ${formatYmd(r.outlook.nextDue ?? today)}${money(r)}`)
        .join("\n")}`,
    )
  }
  if (overdue.length > 0) {
    paragraphs.push(
      `Sin factura registrada:\n${overdue
        .map((r) => {
          const since = r.outlook.daysOverdue
            ? `hace ${r.outlook.daysOverdue} ${r.outlook.daysOverdue === 1 ? "día" : "días"}`
            : "vence hoy"
          return `• ${r.tenantName}: periodo ${r.outlook.currentPeriod ?? "—"}, ${since}${money(r)}`
        })
        .join("\n")}`,
    )
  }
  paragraphs.push(
    "Registra cada factura en la sección Facturación del tenant para que deje de aparecer aquí.",
  )

  const dates = [...new Set(upcoming.map((r) => r.outlook.nextDue ?? today))].sort()
  const subject =
    overdue.length > 0
      ? `Facturación Cuik: ${overdue.length} sin registrar, ${upcoming.length} por emitir`
      : `Facturación Cuik: ${upcoming.length} ${upcoming.length === 1 ? "factura" : "facturas"} por emitir el ${dates.map(formatYmd).join(" y ")}`

  return { subject, paragraphs, upcoming: upcoming.length, overdue: overdue.length }
}

/** Everyone with the super_admin role gets the reminder. */
export async function superAdminEmails(): Promise<string[]> {
  const rows = await db.select({ email: user.email }).from(user).where(eq(user.role, "super_admin"))
  return rows.map((r) => r.email).filter((e): e is string => Boolean(e))
}

const RUN_KEY = "billing_reminders"

async function lastRunYmd(): Promise<string | null> {
  const [row] = await db
    .select({ value: globalConfig.value })
    .from(globalConfig)
    .where(eq(globalConfig.key, RUN_KEY))
    .limit(1)
  const v = row?.value as { lastRunYmd?: string } | null
  return v?.lastRunYmd ?? null
}

async function markRun(today: string): Promise<void> {
  await db
    .insert(globalConfig)
    .values({ key: RUN_KEY, value: { lastRunYmd: today }, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: globalConfig.key,
      set: { value: { lastRunYmd: today }, updatedAt: new Date() },
    })
}

/**
 * Daily reminder (cron): invoices due in 3 days and invoices already due
 * without a record. Runs at most once per day (marker in global_config), so
 * a duplicated cron fire never sends twice; a missed day widens the heads-up
 * window instead of losing it. `force` ignores the marker and sends even
 * when nothing is due (manual check).
 */
export async function sendBillingReminders(
  opts: { force?: boolean; now?: Date } = {},
): Promise<ReminderRunResult> {
  const today = todayYmd(opts.now)
  const last = await lastRunYmd()
  if (last === today && !opts.force) return { status: "skipped", reason: "already_sent_today" }
  const missedDays = last && last < today ? Math.max(0, daysBetween(last, today) - 1) : 0

  const rows = await billingDueRows(today)
  const composed = composeReminder(rows, today, missedDays)
  if (!composed && !opts.force) {
    await markRun(today)
    return { status: "skipped", reason: "nothing_due" }
  }

  const to = await superAdminEmails()
  if (to.length === 0) return { status: "skipped", reason: "no_recipients" }

  const body = composed ?? {
    subject: "Facturación Cuik: nada pendiente hoy",
    paragraphs: ["No hay facturas por emitir en los próximos 3 días ni pendientes de registrar."],
    upcoming: 0,
    overdue: 0,
  }
  // sendEmail never throws: Resend failures come back as { error }.
  const sent = await sendEmail({
    to,
    subject: body.subject,
    template: createElement(MensajePersonalizado, {
      preview: body.subject,
      heading: "Recordatorio de facturación",
      paragraphs: body.paragraphs,
      cta: { label: "Abrir gestor de tenants", url: `${appUrl()}/admin/tenants` },
    }),
  })
  if ("error" in sent) return { status: "error", error: sent.error }
  await markRun(today)
  return { status: "sent", to, upcoming: body.upcoming, overdue: body.overdue }
}
