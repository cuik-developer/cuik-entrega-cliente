import { db, eq, user } from "@cuik/db"
import { MensajePersonalizado, sendEmail } from "@cuik/email"
import { createElement } from "react"
import { formatYmd, todayYmd } from "./billing"
import { type BillingDueRow, billingDueRows } from "./billing-overview"

/** How many days before the due date the heads-up goes out. */
export const REMINDER_DAYS_BEFORE = 3

export type ReminderRunResult =
  | { status: "skipped"; reason: "nothing_due" | "no_recipients" }
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

/** What the reminder would say today. Pure, so it can be unit-tested. */
export function composeReminder(rows: BillingDueRow[], today: string) {
  const upcoming = rows.filter(
    (r) =>
      r.outlook.status !== "pendiente" &&
      r.outlook.status !== "vencida" &&
      r.outlook.daysUntilNext === REMINDER_DAYS_BEFORE,
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

  const subject =
    overdue.length > 0
      ? `Facturación Cuik: ${overdue.length} sin registrar, ${upcoming.length} por emitir`
      : `Facturación Cuik: ${upcoming.length} ${upcoming.length === 1 ? "factura" : "facturas"} por emitir el ${formatYmd(upcoming[0]?.outlook.nextDue ?? today)}`

  return { subject, paragraphs, upcoming: upcoming.length, overdue: overdue.length }
}

/** Everyone with the super_admin role gets the reminder. */
export async function superAdminEmails(): Promise<string[]> {
  const rows = await db.select({ email: user.email }).from(user).where(eq(user.role, "super_admin"))
  return rows.map((r) => r.email).filter((e): e is string => Boolean(e))
}

/**
 * Daily reminder (cron): invoices due in 3 days and invoices already due
 * without a record. Sends nothing when there is nothing to say unless
 * `force` is set (manual check).
 */
export async function sendBillingReminders(
  opts: { force?: boolean; now?: Date } = {},
): Promise<ReminderRunResult> {
  const today = todayYmd(opts.now)
  const rows = await billingDueRows(today)
  const composed = composeReminder(rows, today)
  if (!composed && !opts.force) return { status: "skipped", reason: "nothing_due" }

  const to = await superAdminEmails()
  if (to.length === 0) return { status: "skipped", reason: "no_recipients" }

  const body = composed ?? {
    subject: "Facturación Cuik: nada pendiente hoy",
    paragraphs: ["No hay facturas por emitir en los próximos 3 días ni pendientes de registrar."],
    upcoming: 0,
    overdue: 0,
  }
  try {
    await sendEmail({
      to,
      subject: body.subject,
      template: createElement(MensajePersonalizado, {
        preview: body.subject,
        heading: "Recordatorio de facturación",
        paragraphs: body.paragraphs,
        cta: { label: "Abrir gestor de tenants", url: `${appUrl()}/admin/tenants` },
      }),
    })
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) }
  }
  return { status: "sent", to, upcoming: body.upcoming, overdue: body.overdue }
}
