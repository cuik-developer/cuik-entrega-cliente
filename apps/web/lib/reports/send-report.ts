import { db, eq, sql, tenants } from "@cuik/db"
import { ReportePeriodico, sendEmail } from "@cuik/email"
import type { AutomationsConfig } from "@cuik/shared/validators"
import {
  automationsConfigSchema,
  DEFAULT_MONTHLY_REPORT,
  DEFAULT_WEEKLY_REPORT,
} from "@cuik/shared/validators"
import { createElement } from "react"
import { hourLocal, todayLocal } from "@/lib/campaigns/birthday"
import { buildReportXlsx, reportFilename } from "./build-excel"
import { composeReportEmail, reportSubject } from "./compose-email"
import { computeReport } from "./compute-report"
import { isoWeekday, type Period, type ReportKind } from "./period"

/**
 * Sending a report: compute → compose → xlsx → email → remember the period.
 * The cron runner decides *when*; this module only knows *how*.
 */

export function getReportsConfig(raw: unknown) {
  const parsed = automationsConfigSchema.safeParse(raw ?? {})
  const cfg: AutomationsConfig = parsed.success ? parsed.data : {}
  return {
    weekly: { ...DEFAULT_WEEKLY_REPORT, ...(cfg.reports?.weekly ?? {}) },
    monthly: { ...DEFAULT_MONTHLY_REPORT, ...(cfg.reports?.monthly ?? {}) },
    /** Explicit list chosen in the panel; empty = use defaultRecipients(). */
    recipients: cfg.reports?.recipients ?? [],
  }
}

/** Who actually gets the scheduled report: the configured list, else the default one. */
export async function resolveRecipients(
  tenantId: string,
  cfg: ReturnType<typeof getReportsConfig>,
): Promise<string[]> {
  if (cfg.recipients.length > 0) return cfg.recipients
  return defaultRecipients(tenantId)
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://cuik.org").replace(/\/$/, "")
}

/** Contact email + owner + admins of the tenant's organization, de-duplicated. */
export async function defaultRecipients(tenantId: string): Promise<string[]> {
  const res = await db.execute<{ email: string | null }>(sql`
    SELECT t.contact_email AS email FROM tenants t WHERE t.id = ${tenantId}
    UNION
    SELECT u.email FROM tenants t JOIN "user" u ON u.id = t.owner_id WHERE t.id = ${tenantId}
    UNION
    SELECT u.email
    FROM tenants t
    JOIN organization o ON o.slug = t.slug
    JOIN member m ON m.organization_id = o.id AND m.role IN ('owner', 'admin')
    JOIN "user" u ON u.id = m.user_id
    WHERE t.id = ${tenantId}`)
  const seen = new Set<string>()
  for (const r of res.rows) {
    const e = r.email?.trim().toLowerCase()
    if (e?.includes("@")) seen.add(e)
  }
  return [...seen]
}

export type SendReportResult =
  | { status: "sent"; to: string[]; subject: string; period: Period; emailId: string }
  | { status: "skipped"; reason: "no_recipients" | "already_sent" }
  | { status: "error"; error: string }

export async function sendReport(params: {
  tenantId: string
  kind: ReportKind
  /** Override recipients (the "send me a test" button). Does not mark the period as sent. */
  to?: string[]
  /** Override the period (tests / manual re-sends). */
  period?: Period
  /** Skip the already-sent check (manual re-sends). */
  force?: boolean
  now?: Date
}): Promise<SendReportResult> {
  const { tenantId, kind } = params
  const tenantRows = await db
    .select({ timezone: tenants.timezone, automations: tenants.automations, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const tenant = tenantRows[0]
  if (!tenant) return { status: "error", error: "tenant not found" }
  const tz = tenant.timezone ?? "America/Lima"
  const isTest = Boolean(params.to?.length)

  const data = await computeReport({
    tenantId,
    kind,
    todayLocal: todayLocal(tz, params.now),
    period: params.period,
  })

  const cfg = getReportsConfig(tenant.automations)
  const lastSent = kind === "weekly" ? cfg.weekly.lastSentPeriod : cfg.monthly.lastSentPeriod
  if (!isTest && !params.force && lastSent === data.period.key) {
    return { status: "skipped", reason: "already_sent" }
  }

  const to = params.to?.length ? params.to : await resolveRecipients(tenantId, cfg)
  if (to.length === 0) return { status: "skipped", reason: "no_recipients" }

  const base = appUrl()
  const props = composeReportEmail(data, {
    panel: `${base}/panel`,
    campaigns: `${base}/panel/campanas`,
    clientsAtRisk: `${base}/panel/clientes?segment=en_riesgo`,
  })
  const xlsx = await buildReportXlsx(data)
  const subject = reportSubject(data)

  const result = await sendEmail({
    to,
    subject,
    template: createElement(ReportePeriodico, props),
    attachments: [
      {
        filename: reportFilename(data),
        content: xlsx,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
  })
  if ("error" in result) return { status: "error", error: result.error }

  if (!isTest) await rememberSent(tenantId, kind, data.period.key)

  return { status: "sent", to, subject, period: data.period, emailId: result.id }
}

/** Store the sent period key inside tenants.automations.reports.<kind>.lastSentPeriod. */
async function rememberSent(tenantId: string, kind: ReportKind, periodKey: string) {
  const rows = await db
    .select({ automations: tenants.automations })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const parsed = automationsConfigSchema.safeParse(rows[0]?.automations ?? {})
  const current: AutomationsConfig = parsed.success ? parsed.data : {}
  const cfg = getReportsConfig(current)
  const next: AutomationsConfig = {
    ...current,
    reports: {
      ...cfg,
      [kind]: { ...cfg[kind], lastSentPeriod: periodKey },
    },
  }
  await db.update(tenants).set({ automations: next }).where(eq(tenants.id, tenantId))
}

// ── Scheduling ──────────────────────────────────────────────────────

export type DueCheck = { due: boolean; reason?: string }

/**
 * Is the report due right now for this tenant? Pure on (config, local date,
 * local hour) so the cron and the tests share one rule:
 *   weekly  → enabled, local weekday == dayOfWeek, local hour == sendHour
 *   monthly → enabled, local day of month == dayOfMonth, local hour == sendHour
 * Idempotency per period is enforced later by sendReport (lastSentPeriod).
 */
export function isReportDue(
  kind: ReportKind,
  cfg: ReturnType<typeof getReportsConfig>,
  dateLocal: string,
  hour: number,
): DueCheck {
  if (kind === "weekly") {
    if (!cfg.weekly.enabled) return { due: false, reason: "disabled" }
    if (isoWeekday(dateLocal) !== cfg.weekly.dayOfWeek) return { due: false, reason: "not_the_day" }
    if (hour !== cfg.weekly.sendHour) return { due: false, reason: "not_the_hour" }
    return { due: true }
  }
  if (!cfg.monthly.enabled) return { due: false, reason: "disabled" }
  if (Number(dateLocal.slice(8)) !== cfg.monthly.dayOfMonth)
    return { due: false, reason: "not_the_day" }
  if (hour !== cfg.monthly.sendHour) return { due: false, reason: "not_the_hour" }
  return { due: true }
}

export type RunReportsResult = {
  sent: Array<{ tenant: string; kind: ReportKind; to: number; subject: string }>
  skipped: Array<{ tenant: string; kind: ReportKind; reason: string }>
  errors: string[]
}

/** Cron entry: every hour, send whatever is due for every active/trial tenant. */
export async function runDueReports(
  params: { force?: boolean; now?: Date } = {},
): Promise<RunReportsResult> {
  const now = params.now ?? new Date()
  const tenantRows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      timezone: tenants.timezone,
      automations: tenants.automations,
    })
    .from(tenants)
    .where(sql`${tenants.status} IN ('active', 'trial')`)

  const out: RunReportsResult = { sent: [], skipped: [], errors: [] }
  for (const t of tenantRows) {
    await runTenantReports(t, now, Boolean(params.force), out)
  }
  return out
}

type TenantLite = { id: string; slug: string; timezone: string | null; automations: unknown }

async function runTenantReports(t: TenantLite, now: Date, force: boolean, out: RunReportsResult) {
  const tz = t.timezone ?? "America/Lima"
  const cfg = getReportsConfig(t.automations)
  const date = todayLocal(tz, now)
  const hour = hourLocal(tz, now)
  for (const kind of ["weekly", "monthly"] as const) {
    if (!cfg[kind].enabled) continue
    const due = force ? { due: true } : isReportDue(kind, cfg, date, hour)
    if (!due.due) {
      out.skipped.push({ tenant: t.slug, kind, reason: due.reason ?? "not_due" })
      continue
    }
    try {
      const r = await sendReport({ tenantId: t.id, kind, now })
      if (r.status === "sent") {
        out.sent.push({ tenant: t.slug, kind, to: r.to.length, subject: r.subject })
      } else if (r.status === "skipped") {
        out.skipped.push({ tenant: t.slug, kind, reason: r.reason })
      } else {
        out.errors.push(`tenant=${t.slug} ${kind}: ${r.error}`)
      }
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).split("\n")[0]
      console.error(`[CRON reports] tenant=${t.id} kind=${kind} error:`, err)
      out.errors.push(`tenant=${t.slug} ${kind}: ${message}`)
    }
  }
}
