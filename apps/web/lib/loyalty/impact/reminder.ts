import { db, eq, sql, tenants } from "@cuik/db"
import { MensajePersonalizado, sendEmail } from "@cuik/email"
import { automationsConfigSchema } from "@cuik/shared/validators"
import { createElement } from "react"

import { defaultRecipients } from "@/lib/reports/send-report"

/**
 * Monthly reminder of the Impacto module: a merchant that loaded its sales
 * at least once gets, the first days of each month, an email asking for the
 * previous month's file, until it is loaded. Idempotent per month
 * (tenants.automations.impact.lastReminderPeriod).
 */

/** Days 1-5 of the month: when the reminder may go out. */
const REMINDER_UNTIL_DAY = 5
/** From this day on, a missing month shows as an alert for Cuik. */
const ALERT_FROM_DAY = 6

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]

/** "2026-10" -> "octubre 2026". */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return `${MONTHS[(m ?? 1) - 1] ?? ym} ${y}`
}

/** The month before `today` ("YYYY-MM-DD") as "YYYY-MM", and its last day. */
export function previousMonth(today: string): { key: string; lastDay: string } {
  const [y, m] = today.split("-").map(Number)
  const prevY = m === 1 ? y - 1 : y
  const prevM = m === 1 ? 12 : m - 1
  const last = new Date(Date.UTC(prevY, prevM, 0)).toISOString().slice(0, 10)
  return { key: `${prevY}-${String(prevM).padStart(2, "0")}`, lastDay: last }
}

export type MissingMonth = {
  tenantId: string
  tenantName: string
  missingMonth: string
  lastPeriodTo: string
}

type Row = { id: string; name: string; last_to: string; automations: unknown }

/** Tenants with at least one ready import whose latest period ends before the previous month's last day. */
async function candidates(today: string): Promise<Row[]> {
  const { lastDay } = previousMonth(today)
  const res = await db.execute<Row>(sql`
    SELECT t.id, t.name, to_char(max(i.period_to), 'YYYY-MM-DD') AS last_to, t.automations
    FROM tenants t
    JOIN analytics.sales_imports i ON i.tenant_id = t.id AND i.status = 'ready' AND i.period_to IS NOT NULL
    WHERE t.status IN ('active', 'trial')
      -- With the POS connector on, the sales arrive by API: nothing to ask for.
      AND NOT EXISTS (
        SELECT 1 FROM analytics.pos_connections c WHERE c.tenant_id = t.id AND c.enabled
      )
    GROUP BY t.id, t.name, t.automations
    HAVING max(i.period_to) < ${lastDay}::date
    ORDER BY t.name`)
  return res.rows
}

/** For the super-admin digest and Home: who skipped last month (from the 6th on). */
export async function tenantsMissingLastMonth(today: string): Promise<MissingMonth[]> {
  const day = Number(today.slice(8, 10))
  if (day < ALERT_FROM_DAY) return []
  const prev = previousMonth(today)
  return (await candidates(today)).map((r) => ({
    tenantId: r.id,
    tenantName: r.name,
    missingMonth: prev.key,
    lastPeriodTo: r.last_to,
  }))
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://cuik.org").replace(/\/$/, "")
}

export type ReminderRunResult = {
  checked: number
  sent: { tenantId: string; to: string[] }[]
  skipped: { tenantId: string; reason: string }[]
  errors: { tenantId: string; error: string }[]
}

/**
 * Sends the reminder to every merchant that qualifies today. `force` ignores
 * the day-of-month window (manual run); the per-month guard still applies.
 */
export async function runImpactReminders(params: {
  force?: boolean
  now?: Date
}): Promise<ReminderRunResult> {
  const now = params.now ?? new Date()
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(now)
  const day = Number(today.slice(8, 10))
  const out: ReminderRunResult = { checked: 0, sent: [], skipped: [], errors: [] }
  if (!params.force && day > REMINDER_UNTIL_DAY) return out

  const prev = previousMonth(today)
  const rows = await candidates(today)
  out.checked = rows.length
  const base = appUrl()
  for (const r of rows) {
    const cfg = automationsConfigSchema.safeParse(r.automations ?? {})
    const impact = cfg.success ? cfg.data.impact : undefined
    if (impact && impact.reminder === false) {
      out.skipped.push({ tenantId: r.id, reason: "disabled" })
      continue
    }
    if (impact?.lastReminderPeriod === prev.key) {
      out.skipped.push({ tenantId: r.id, reason: "already_sent" })
      continue
    }
    const to = await defaultRecipients(r.id)
    if (to.length === 0) {
      out.skipped.push({ tenantId: r.id, reason: "no_recipients" })
      continue
    }
    const month = monthLabel(prev.key)
    const result = await sendEmail({
      to,
      subject: `${r.name}: sube tus ventas de ${month} para ver el impacto de tu tarjeta`,
      template: createElement(MensajePersonalizado, {
        preview: `Con tus ventas de ${month} calculamos el corte: registro en caja, retención y a quién invitar.`,
        heading: `Tus ventas de ${month}`,
        paragraphs: [
          `Hola, equipo de ${r.name}.`,
          `Ya cerró ${month}. Sube la exportación de ventas del mes (DNI, fecha y monto) en tu panel y en minutos tendrás el corte de Impacto: cuánto se registra en caja, cómo retienen los clientes con tarjeta frente a los que no la tienen, y la lista de clientes frecuentes que todavía no la tienen.`,
          `Tu última carga llega hasta el ${r.last_to}. Si prefieres, mándanos el archivo y lo subimos nosotros.`,
        ],
        cta: { label: "Subir ventas", url: `${base}/panel/impacto` },
      }),
    })
    if ("error" in result) {
      out.errors.push({ tenantId: r.id, error: result.error })
      continue
    }
    await db
      .update(tenants)
      .set({
        automations: sql`jsonb_set(coalesce(${tenants.automations}, '{}'::jsonb), '{impact}', coalesce(${tenants.automations} -> 'impact', '{}'::jsonb) || ${JSON.stringify({ lastReminderPeriod: prev.key })}::jsonb, true)`,
      })
      .where(eq(tenants.id, r.id))
    out.sent.push({ tenantId: r.id, to })
  }
  return out
}
