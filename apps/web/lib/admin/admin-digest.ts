import { and, campaigns, db, eq, globalConfig, gte, sql, user } from "@cuik/db"
import { MensajePersonalizado, sendEmail } from "@cuik/email"
import forge from "node-forge"
import { createElement } from "react"
import { daysBetween, formatYmd, todayYmd } from "./billing"
import { billingDueRows, summarize } from "./billing-overview"
import { getInternalTenantIds } from "./internal-tenants"

/**
 * Daily digest for the super-admins: everything that needs a human today,
 * in one email and one strip on the tenant manager.
 *
 * - Facturación: invoices due in 3 days and the ones overdue (every day).
 * - Comercios fríos: clients but no visit in 14+ days (when they cross the
 *   line, then every 7 days).
 * - Demos: ending in 3 days or less, with or without real usage (once per end date).
 * - Certificados Apple: per-tenant certificates and the shared Cuik one, at
 *   30 / 14 / 7 / 1 days and when expired (once per threshold; expired weekly).
 * - Campañas fallidas: left in draft with an error in the last 24 h (once).
 *
 * `collectAdminAlerts` is the live list (strip). `sendAdminDigest` applies
 * the once-per-day marker and the per-alert cadence stored in global_config.
 */

import {
  type AdminAlert,
  type AlertKind,
  type AlertSeverity,
  ALERT_SECTION_TITLE as SECTION_TITLE,
} from "./admin-alerts-types"

export type { AdminAlert, AlertKind, AlertSeverity } from "./admin-alerts-types"

export const COLD_AFTER_DAYS = 14
export const COLD_REPEAT_DAYS = 7
export const DEMO_HEADS_UP_DAYS = 3
export const CERT_THRESHOLDS = [30, 14, 7, 1, 0] as const
export const CERT_EXPIRED_REPEAT_DAYS = 7
export const FAILED_CAMPAIGN_WINDOW_HOURS = 24

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://cuik.org").replace(/\/+$/, "")
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Calendar days from `now` (Lima) to a timestamp, floor. */
function daysFromNow(iso: string | Date | null, today: string): number | null {
  if (!iso) return null
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
  return daysBetween(today, ymd)
}

/** Expiry of the shared Cuik signing certificate (demo mode), from the env. */
export function sharedAppleCertExpiry(): Date | null {
  const input = process.env.APPLE_SIGNER_CERT_BASE64
  if (!input) return null
  try {
    // Same tolerance as the wallet routes: raw PEM, base64 of a PEM, or base64 DER.
    if (input.startsWith("-----BEGIN")) return forge.pki.certificateFromPem(input).validity.notAfter
    const raw = Buffer.from(input, "base64")
    const str = raw.toString("utf8")
    if (str.startsWith("-----BEGIN")) return forge.pki.certificateFromPem(str).validity.notAfter
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(raw.toString("binary")))
    return forge.pki.certificateFromAsn1(asn1).validity.notAfter
  } catch (err) {
    console.error("[admin-digest] APPLE_SIGNER_CERT_BASE64 is not a readable certificate", err)
    return null
  }
}

/* ── Collection ──────────────────────────────────────────────────── */

type TenantRow = {
  id: string
  name: string
  status: string
  clients: number
  last_visit: Date | string | null
  trial_ends_at: Date | string | null
  since_at: Date | string | null
  apple_mode: string | null
  cert_expires: string | null
  design_published: boolean
}

function certAlerts(
  who: string,
  href: string,
  keyBase: string,
  expiresAt: string | Date | null,
  today: string,
): AdminAlert[] {
  const days = daysFromNow(expiresAt, today)
  if (days === null) return []
  const date = formatYmd(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(
      new Date(expiresAt as string),
    ),
  )
  if (days < 0) {
    // Weekly reminder while expired: the key changes every 7 days.
    const week = Math.floor(-days / CERT_EXPIRED_REPEAT_DAYS)
    return [
      {
        key: `${keyBase}:expired:${week}`,
        kind: "cert",
        severity: "critical",
        who,
        text: `El certificado Apple venció el ${date} (hace ${plural(-days, "día", "días")}). Los pases ya no se actualizan.`,
        href,
        days,
      },
    ]
  }
  // Tightest threshold reached (the array is descending): 12 days → 14, not 30.
  const threshold = [...CERT_THRESHOLDS].reverse().find((t) => days <= t)
  if (threshold === undefined) return []
  return [
    {
      key: `${keyBase}:${threshold}`,
      kind: "cert",
      severity: days <= 7 ? "critical" : "warning",
      who,
      text:
        days === 0
          ? `El certificado Apple vence hoy (${date}). Renovar y subir el nuevo.`
          : `El certificado Apple vence el ${date}, en ${plural(days, "día", "días")}.`,
      href,
      days,
    },
  ]
}

export async function collectAdminAlerts(now = new Date()): Promise<AdminAlert[]> {
  const today = todayYmd(now)
  const internal = new Set(await getInternalTenantIds())
  const base = appUrl()
  const tenantHref = (id: string, tab?: string) =>
    `${base}/admin/tenants/${id}${tab ? `?tab=${tab}` : ""}`
  const out: AdminAlert[] = []

  // ── Billing (every day while it applies) ──
  const billing = summarize(await billingDueRows(today))
  for (const r of billing.overdue) {
    if (internal.has(r.tenantId)) continue
    const d = r.outlook.daysOverdue ?? 0
    out.push({
      key: `billing:${r.tenantId}:${r.outlook.currentPeriod ?? today}:overdue`,
      kind: "billing",
      severity: "critical",
      who: r.tenantName,
      text: `Sin factura registrada para el periodo ${r.outlook.currentPeriod ?? "actual"}, ${d ? `hace ${plural(d, "día", "días")}` : "vence hoy"}.`,
      href: tenantHref(r.tenantId, "facturacion"),
      days: -d,
    })
  }
  for (const r of billing.dueSoon) {
    if (internal.has(r.tenantId)) continue
    const d = r.outlook.daysUntilNext ?? 0
    if (d > DEMO_HEADS_UP_DAYS) continue
    out.push({
      key: `billing:${r.tenantId}:${r.outlook.nextDue ?? today}:due`,
      kind: "billing",
      severity: "warning",
      who: r.tenantName,
      text: `Factura por emitir ${d === 0 ? "hoy" : d === 1 ? "mañana" : `en ${d} días`} (${formatYmd(r.outlook.nextDue ?? today)}).`,
      href: tenantHref(r.tenantId, "facturacion"),
      days: d,
    })
  }

  // ── Tenants: cold, demos, certificates ──
  const res = await db.execute<TenantRow>(sql`
    SELECT t.id, t.name, t.status, t.trial_ends_at, coalesce(t.activated_at, t.created_at) AS since_at,
           (SELECT count(*)::int FROM loyalty.clients c WHERE c.tenant_id = t.id AND c.status <> 'deleted') AS clients,
           (SELECT max(v.created_at) FROM loyalty.visits v WHERE v.tenant_id = t.id AND v.source <> 'bonus') AS last_visit,
           t.apple_config ->> 'mode' AS apple_mode,
           t.apple_config ->> 'expiresAt' AS cert_expires,
           EXISTS (SELECT 1 FROM passes.pass_designs d WHERE d.tenant_id = t.id AND d.is_active) AS design_published
    FROM tenants t
    WHERE t.status IN ('active', 'trial')
    ORDER BY t.name`)
  for (const t of res.rows) {
    if (internal.has(t.id)) continue
    const clients = Number(t.clients ?? 0)

    // Cold: clients but no real visit in 14+ days (or never, once the tenant
    // itself is 14+ days old: a fresh import of clients is not a cold tenant).
    if (clients > 0) {
      const since = t.last_visit ? -(daysFromNow(t.last_visit, today) ?? 0) : null
      const age = -(daysFromNow(t.since_at, today) ?? 0)
      if (
        (since === null && age >= COLD_AFTER_DAYS) ||
        (since !== null && since >= COLD_AFTER_DAYS)
      ) {
        out.push({
          key: `cold:${t.id}`,
          kind: "cold",
          severity: "critical",
          who: t.name,
          text:
            since === null
              ? `Tiene ${plural(clients, "cliente", "clientes")} y nunca registró una visita.`
              : `Lleva ${plural(since, "día", "días")} sin registrar visitas (${plural(clients, "cliente", "clientes")}).`,
          href: tenantHref(t.id),
          days: since === null ? undefined : -since,
        })
      }
    }

    // Demos ending in 3 days or less, and demos already past their end date.
    if (t.status === "trial" && t.trial_ends_at) {
      const d = daysFromNow(t.trial_ends_at, today)
      const endYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(
        new Date(t.trial_ends_at),
      )
      if (d !== null && d < 0) {
        out.push({
          key: `demo:${t.id}:${endYmd}:lapsed`,
          kind: "demo",
          severity: "warning",
          who: t.name,
          text: `La demo venció el ${formatYmd(endYmd)} (hace ${plural(-d, "día", "días")}) y sigue en estado demo. Activar con plan, extender o pausar.`,
          href: tenantHref(t.id),
          days: d,
        })
      }
      if (d !== null && d >= 0 && d <= DEMO_HEADS_UP_DAYS) {
        const used = clients > 0 && t.design_published
        out.push({
          key: `demo:${t.id}:${endYmd}`,
          kind: "demo",
          severity: used ? "info" : "warning",
          who: t.name,
          text: used
            ? `La demo vence ${d === 0 ? "hoy" : d === 1 ? "mañana" : `en ${d} días`} y tiene uso real (${plural(clients, "cliente", "clientes")}). Momento de proponer el plan.`
            : `La demo vence ${d === 0 ? "hoy" : d === 1 ? "mañana" : `en ${d} días`} ${clients === 0 ? "sin clientes" : "sin diseño publicado"}. Sin uso no va a convertir.`,
          href: tenantHref(t.id),
          days: d,
        })
      }
    }

    // Per-tenant Apple certificate.
    if (t.apple_mode === "production" && t.cert_expires) {
      out.push(
        ...certAlerts(t.name, tenantHref(t.id, "apple"), `cert:${t.id}`, t.cert_expires, today),
      )
    }
  }

  // ── Shared Cuik certificate (demo mode tenants) ──
  const shared = sharedAppleCertExpiry()
  if (shared) {
    out.push(
      ...certAlerts(
        "Cuik (certificado compartido)",
        `${base}/admin/configuracion`,
        "cert:shared",
        shared,
        today,
      ),
    )
  }

  // ── Failed campaigns in the last 24 h ──
  const since = new Date(now.getTime() - FAILED_CAMPAIGN_WINDOW_HOURS * 3_600_000)
  const failed = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      tenantId: campaigns.tenantId,
      content: campaigns.content,
    })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.status, "draft"),
        gte(campaigns.updatedAt, since),
        // The error timestamp, not updated_at: editing an old failed draft must not re-surface it.
        sql`(${campaigns.content} ->> 'lastErrorAt')::timestamptz >= ${since.toISOString()}::timestamptz`,
      ),
    )
  const nameOf = new Map(res.rows.map((t) => [t.id, t.name]))
  for (const c of failed) {
    if (internal.has(c.tenantId)) continue
    const content = c.content as { lastError?: unknown; lastErrorAt?: unknown } | null
    const err = String(content?.lastError ?? "").slice(0, 160)
    const at = String(content?.lastErrorAt ?? "").slice(0, 10)
    out.push({
      // A new failure on another day is a new alert.
      key: `campaign:${c.id}:${at}`,
      kind: "campaign",
      severity: "warning",
      who: nameOf.get(c.tenantId) ?? "Comercio",
      text: `La campaña "${c.name}" no se envió y volvió a borrador${err ? `: ${err}` : "."}`,
      href: tenantHref(c.tenantId),
    })
  }

  const order: AlertSeverity[] = ["critical", "warning", "info"]
  return out.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
}

/* ── Cadence + email ─────────────────────────────────────────────── */

const RUN_KEY = "admin_digest"
type DigestState = { lastRunYmd?: string; sent?: Record<string, string> }

async function loadState(): Promise<DigestState> {
  const [row] = await db
    .select({ value: globalConfig.value })
    .from(globalConfig)
    .where(eq(globalConfig.key, RUN_KEY))
    .limit(1)
  return (row?.value as DigestState | null) ?? {}
}

async function saveState(state: DigestState): Promise<void> {
  await db
    .insert(globalConfig)
    .values({ key: RUN_KEY, value: state, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: globalConfig.key,
      set: { value: state, updatedAt: new Date() },
    })
}

/** Which alerts go out today given what was already sent. Pure. */
export function dueToday(
  alerts: AdminAlert[],
  sent: Record<string, string>,
  today: string,
): AdminAlert[] {
  return alerts.filter((a) => {
    if (a.kind === "billing") return true
    const last = sent[a.key]
    if (!last) return true
    if (a.kind === "cold") return daysBetween(last, today) >= COLD_REPEAT_DAYS
    return false
  })
}

export function composeDigest(alerts: AdminAlert[]) {
  const byKind = new Map<AlertKind, AdminAlert[]>()
  for (const a of alerts) byKind.set(a.kind, [...(byKind.get(a.kind) ?? []), a])
  const paragraphs = [...byKind.entries()].map(
    ([kind, list]) =>
      `${SECTION_TITLE[kind]}:\n${list.map((a) => `• ${a.who}: ${a.text} ${a.href}`).join("\n")}`,
  )
  const parts: string[] = []
  const n = (k: AlertKind) => byKind.get(k)?.length ?? 0
  if (n("cert")) parts.push(`${n("cert")} certificado${n("cert") === 1 ? "" : "s"} Apple`)
  if (n("cold"))
    parts.push(
      `${n("cold")} comercio${n("cold") === 1 ? "" : "s"} frío${n("cold") === 1 ? "" : "s"}`,
    )
  if (n("billing")) parts.push(`${n("billing")} de facturación`)
  if (n("demo")) parts.push(`${n("demo")} demo${n("demo") === 1 ? "" : "s"}`)
  if (n("campaign"))
    parts.push(
      `${n("campaign")} campaña${n("campaign") === 1 ? "" : "s"} fallida${n("campaign") === 1 ? "" : "s"}`,
    )
  return { subject: `Resumen Cuik: ${parts.join(", ")}`, paragraphs }
}

export async function superAdminEmails(): Promise<string[]> {
  const rows = await db.select({ email: user.email }).from(user).where(eq(user.role, "super_admin"))
  return rows.map((r) => r.email).filter((e): e is string => Boolean(e))
}

export type DigestRunResult =
  | { status: "skipped"; reason: "already_sent_today" | "nothing_due" | "no_recipients" }
  | { status: "sent"; to: string[]; alerts: number; byKind: Partial<Record<AlertKind, number>> }
  | { status: "error"; error: string }

/**
 * Daily run (cron). At most once per day; `force` ignores the day marker and
 * the per-alert cadence (sends everything live) for a manual check.
 */
export async function sendAdminDigest(
  opts: { force?: boolean; now?: Date } = {},
): Promise<DigestRunResult> {
  const now = opts.now ?? new Date()
  const today = todayYmd(now)
  const state = await loadState()
  if (state.lastRunYmd === today && !opts.force) {
    return { status: "skipped", reason: "already_sent_today" }
  }
  const live = await collectAdminAlerts(now)
  const sent = state.sent ?? {}
  const due = opts.force ? live : dueToday(live, sent, today)
  if (due.length === 0) {
    await saveState({ ...state, lastRunYmd: today })
    return { status: "skipped", reason: "nothing_due" }
  }
  const to = await superAdminEmails()
  if (to.length === 0) return { status: "skipped", reason: "no_recipients" }

  const body = composeDigest(due)
  const result = await sendEmail({
    to,
    subject: body.subject,
    template: createElement(MensajePersonalizado, {
      preview: body.subject,
      heading: "Resumen diario",
      paragraphs: body.paragraphs,
      cta: { label: "Abrir gestor de tenants", url: `${appUrl()}/admin/tenants` },
    }),
  })
  if ("error" in result) return { status: "error", error: result.error }

  // Remember what went out; forget entries older than 90 days. A forced
  // (manual) run is a preview: it never consumes the cadence of real alerts.
  const nextSent: Record<string, string> = {}
  for (const [k, ymd] of Object.entries(sent)) if (daysBetween(ymd, today) < 90) nextSent[k] = ymd
  if (!opts.force) for (const a of due) if (a.kind !== "billing") nextSent[a.key] = today
  await saveState({ lastRunYmd: opts.force ? state.lastRunYmd : today, sent: nextSent })

  const byKind: Partial<Record<AlertKind, number>> = {}
  for (const a of due) byKind[a.kind] = (byKind[a.kind] ?? 0) + 1
  return { status: "sent", to, alerts: due.length, byKind }
}
