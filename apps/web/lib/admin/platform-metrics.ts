import { db, sql } from "@cuik/db"

/**
 * Data for the super-admin Métricas dashboard. One call, every block, all
 * scoped by the same filters and compared against the previous period of the
 * same length. Timezone: Lima (platform-wide reference, as elsewhere in SA).
 *
 * "Visits" never count `source = 'bonus'` rows. "Installed pass" = Apple
 * device registered (real signal) or Google save link (best proxy).
 */

export const PLATFORM_TZ = "America/Lima"

export type MetricsFilters = {
  from: string // YYYY-MM-DD, Lima
  to: string
  status: "all" | "active" | "trial"
  program: "all" | "stamps" | "points"
  planId: string | null
  tenantIds: string[]
}

export type Pair = { cur: number; prev: number }

export type TenantMetricsRow = {
  id: string
  name: string
  slug: string
  status: string
  plan: string | null
  planPrice: number
  program: "stamps" | "points" | null
  clients: number
  newClients: number
  visits: number
  visitsPrev: number
  returnRate: number | null
  installed: number
  installRate: number | null
  redemptions: number
  avgTicket: number | null
  lastVisitAt: string | null
  trialEndsAt: string | null
  trialDaysLeft: number | null
  designPublished: boolean
  activePromotions: number
  canRedeem: number
  health: "good" | "warn" | "bad" | "none"
}

export type Insight = {
  severity: "critical" | "warning" | "info" | "positive"
  text: string
  href?: string
  tenantIds?: string[]
}

export type PlatformMetrics = {
  range: { from: string; to: string; prevFrom: string; prevTo: string; days: number }
  kpis: {
    activeTenants: Pair
    visits: Pair
    newClients: Pair
    returnRate: Pair
    installRate: Pair
    avgTicket: Pair
    redemptions: Pair
    mrr: Pair
    scopeTenants: number
  }
  daily: {
    dates: string[] // current period, YYYY-MM-DD
    prevDates: string[]
    visits: { cur: number[]; prev: number[] }
    newClients: { cur: number[]; prev: number[] }
    installs: { cur: number[]; prev: number[] }
    redemptions: { cur: number[]; prev: number[] }
  }
  insights: Insight[]
  tenants: TenantMetricsRow[]
  funnel: {
    requests: number
    approved: number
    withFirstClient: number
    withTenClients: number
    activeThisWeek: number
    avgDaysToFirstClient: number | null
    avgDaysFirstToTen: number | null
  }
  wallet: {
    apple: number
    google: number
    none: number
    installsWeekly: Array<{ week: string; count: number }>
  }
  campaigns: {
    sent: number
    notifications: number
    delivered: number
    failed: number
    deliveryRate: number | null
  }
  options: {
    plans: Array<{ id: string; name: string }>
    tenants: Array<{ id: string; name: string }>
  }
}

type Num = number | string | null | undefined
const n = (v: Num): number => (v === null || v === undefined ? 0 : Number(v))
const pct = (num: number, den: number): number =>
  den > 0 ? Math.round((num / den) * 1000) / 10 : 0

function shiftDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function daysBetween(from: string, to: string): number {
  return (
    Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1
  )
}
function dateList(from: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => shiftDays(from, i))
}

export async function computePlatformMetrics(f: MetricsFilters): Promise<PlatformMetrics> {
  const days = daysBetween(f.from, f.to)
  const prevTo = shiftDays(f.from, -1)
  const prevFrom = shiftDays(prevTo, -(days - 1))

  // ── Tenant scope (every other query joins this) ────────────────────
  const statusCond =
    f.status === "active"
      ? sql`AND t.status = 'active'`
      : f.status === "trial"
        ? sql`AND t.status = 'trial'`
        : sql`AND t.status IN ('active', 'trial')`
  const programCond =
    f.program === "all"
      ? sql``
      : sql`AND (SELECT pr.type FROM loyalty.promotions pr WHERE pr.tenant_id = t.id AND pr.active = true ORDER BY pr.created_at DESC LIMIT 1) = ${f.program}`
  const planCond = f.planId ? sql`AND t.plan_id = ${f.planId}::uuid` : sql``
  const tenantCond =
    f.tenantIds.length > 0
      ? sql`AND t.id IN (${sql.join(
          f.tenantIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`
      : sql``
  const scope = sql`(SELECT t.id FROM tenants t WHERE true ${statusCond} ${programCond} ${planCond} ${tenantCond})`

  const local = (col: string) =>
    sql.raw(`(${col} AT TIME ZONE 'UTC' AT TIME ZONE '${PLATFORM_TZ}')::date`)
  const inCur = (col: string) => sql`${local(col)} BETWEEN ${f.from}::date AND ${f.to}::date`
  const inPrev = (col: string) => sql`${local(col)} BETWEEN ${prevFrom}::date AND ${prevTo}::date`

  const [kpiRes, dailyRes, tenantRes, funnelRes, walletRes, campaignRes, optionsRes] =
    await Promise.all([
      // ── KPIs current vs previous ──
      db.execute<Record<string, Num>>(sql`
        WITH s AS (SELECT id FROM ${scope}),
        v AS (SELECT v.* FROM loyalty.visits v WHERE v.tenant_id IN (SELECT id FROM s) AND v.source <> 'bonus'),
        c AS (SELECT c.* FROM loyalty.clients c WHERE c.tenant_id IN (SELECT id FROM s)),
        inst AS (
          SELECT DISTINCT pi.client_id FROM passes.pass_instances pi
          LEFT JOIN passes.apple_devices ad ON ad.serial_number = pi.serial_number
          WHERE ad.serial_number IS NOT NULL OR (pi.google_save_url IS NOT NULL AND pi.google_save_url <> '')
        ),
        red AS (
          SELECT r.tenant_id, r.redeemed_at AS at FROM loyalty.rewards r WHERE r.status = 'redeemed' AND r.redeemed_at IS NOT NULL AND r.tenant_id IN (SELECT id FROM s)
          UNION ALL
          SELECT pt.tenant_id, pt.created_at FROM loyalty.points_transactions pt WHERE pt.type = 'redeem' AND pt.tenant_id IN (SELECT id FROM s)
        )
        SELECT
          (SELECT count(*)::int FROM s) AS scope_tenants,
          (SELECT count(DISTINCT tenant_id)::int FROM v WHERE ${inCur("v.created_at")}) AS active_cur,
          (SELECT count(DISTINCT tenant_id)::int FROM v WHERE ${inPrev("v.created_at")}) AS active_prev,
          (SELECT count(*)::int FROM v WHERE ${inCur("v.created_at")}) AS visits_cur,
          (SELECT count(*)::int FROM v WHERE ${inPrev("v.created_at")}) AS visits_prev,
          (SELECT count(*)::int FROM c WHERE ${inCur("c.created_at")}) AS newc_cur,
          (SELECT count(*)::int FROM c WHERE ${inPrev("c.created_at")}) AS newc_prev,
          (SELECT count(*)::int FROM (SELECT client_id FROM v WHERE ${inCur("v.created_at")} GROUP BY client_id HAVING count(*) >= 2) x) AS ret_num_cur,
          (SELECT count(DISTINCT client_id)::int FROM v WHERE ${inCur("v.created_at")}) AS ret_den_cur,
          (SELECT count(*)::int FROM (SELECT client_id FROM v WHERE ${inPrev("v.created_at")} GROUP BY client_id HAVING count(*) >= 2) x) AS ret_num_prev,
          (SELECT count(DISTINCT client_id)::int FROM v WHERE ${inPrev("v.created_at")}) AS ret_den_prev,
          (SELECT count(*)::int FROM c WHERE ${inCur("c.created_at")} AND c.id IN (SELECT client_id FROM inst)) AS inst_num_cur,
          (SELECT count(*)::int FROM c WHERE ${inPrev("c.created_at")} AND c.id IN (SELECT client_id FROM inst)) AS inst_num_prev,
          (SELECT avg(amount)::numeric(10,2) FROM v WHERE amount > 0 AND ${inCur("v.created_at")}) AS ticket_cur,
          (SELECT avg(amount)::numeric(10,2) FROM v WHERE amount > 0 AND ${inPrev("v.created_at")}) AS ticket_prev,
          (SELECT count(*)::int FROM red WHERE ${inCur("red.at")}) AS red_cur,
          (SELECT count(*)::int FROM red WHERE ${inPrev("red.at")}) AS red_prev,
          (SELECT coalesce(sum(p.price), 0)::int FROM tenants t JOIN plans p ON p.id = t.plan_id
             WHERE t.id IN (SELECT id FROM s) AND t.status = 'active') AS mrr_cur,
          (SELECT coalesce(sum(p.price), 0)::int FROM tenants t JOIN plans p ON p.id = t.plan_id
             WHERE t.id IN (SELECT id FROM s) AND t.status = 'active'
               AND coalesce(t.activated_at, t.created_at) <= (${prevTo}::date + 1)) AS mrr_prev
      `),
      // ── Daily series for both periods ──
      db.execute<{ kind: string; day: string; cnt: Num }>(sql`
        WITH s AS (SELECT id FROM ${scope})
        SELECT 'visits' AS kind, to_char(${local("v.created_at")}, 'YYYY-MM-DD') AS day, count(*)::int AS cnt
          FROM loyalty.visits v WHERE v.tenant_id IN (SELECT id FROM s) AND v.source <> 'bonus'
           AND ${local("v.created_at")} BETWEEN ${prevFrom}::date AND ${f.to}::date GROUP BY 2
        UNION ALL
        SELECT 'newClients', to_char(${local("c.created_at")}, 'YYYY-MM-DD'), count(*)::int
          FROM loyalty.clients c WHERE c.tenant_id IN (SELECT id FROM s)
           AND ${local("c.created_at")} BETWEEN ${prevFrom}::date AND ${f.to}::date GROUP BY 2
        UNION ALL
        SELECT 'installs', to_char(${local("ad.created_at")}, 'YYYY-MM-DD'), count(*)::int
          FROM passes.apple_devices ad
          JOIN passes.pass_instances pi ON pi.serial_number = ad.serial_number
          JOIN loyalty.clients c ON c.id = pi.client_id
          WHERE c.tenant_id IN (SELECT id FROM s)
           AND ${local("ad.created_at")} BETWEEN ${prevFrom}::date AND ${f.to}::date GROUP BY 2
        UNION ALL
        SELECT 'redemptions', day, sum(cnt)::int FROM (
          SELECT to_char(${local("r.redeemed_at")}, 'YYYY-MM-DD') AS day, count(*) AS cnt
            FROM loyalty.rewards r WHERE r.status = 'redeemed' AND r.redeemed_at IS NOT NULL
             AND r.tenant_id IN (SELECT id FROM s) AND ${local("r.redeemed_at")} BETWEEN ${prevFrom}::date AND ${f.to}::date GROUP BY 1
          UNION ALL
          SELECT to_char(${local("pt.created_at")}, 'YYYY-MM-DD'), count(*)
            FROM loyalty.points_transactions pt WHERE pt.type = 'redeem'
             AND pt.tenant_id IN (SELECT id FROM s) AND ${local("pt.created_at")} BETWEEN ${prevFrom}::date AND ${f.to}::date GROUP BY 1
        ) x GROUP BY day
      `),
      // ── Per-tenant table ──
      db.execute<Record<string, Num | boolean | Date | null>>(sql`
        WITH s AS (SELECT id FROM ${scope}),
        inst AS (
          SELECT DISTINCT pi.client_id FROM passes.pass_instances pi
          LEFT JOIN passes.apple_devices ad ON ad.serial_number = pi.serial_number
          WHERE ad.serial_number IS NOT NULL OR (pi.google_save_url IS NOT NULL AND pi.google_save_url <> '')
        )
        SELECT t.id, t.name, t.slug, t.status, p.name AS plan, coalesce(p.price, 0)::int AS plan_price,
          t.trial_ends_at,
          (SELECT pr.type FROM loyalty.promotions pr WHERE pr.tenant_id = t.id AND pr.active = true ORDER BY pr.created_at DESC LIMIT 1) AS program,
          (SELECT count(*)::int FROM loyalty.promotions pr WHERE pr.tenant_id = t.id AND pr.active = true) AS active_promotions,
          EXISTS (SELECT 1 FROM passes.pass_designs d WHERE d.tenant_id = t.id AND d.is_active = true) AS design_published,
          (SELECT count(*)::int FROM loyalty.clients c WHERE c.tenant_id = t.id) AS clients,
          (SELECT count(*)::int FROM loyalty.clients c WHERE c.tenant_id = t.id AND ${inCur("c.created_at")}) AS new_clients,
          (SELECT count(*)::int FROM loyalty.clients c WHERE c.tenant_id = t.id AND ${inCur("c.created_at")} AND c.id IN (SELECT client_id FROM inst)) AS new_installed,
          (SELECT count(*)::int FROM loyalty.visits v WHERE v.tenant_id = t.id AND v.source <> 'bonus' AND ${inCur("v.created_at")}) AS visits,
          (SELECT count(*)::int FROM loyalty.visits v WHERE v.tenant_id = t.id AND v.source <> 'bonus' AND ${inPrev("v.created_at")}) AS visits_prev,
          (SELECT count(*)::int FROM (SELECT v.client_id FROM loyalty.visits v WHERE v.tenant_id = t.id AND v.source <> 'bonus' AND ${inCur("v.created_at")} GROUP BY v.client_id HAVING count(*) >= 2) x) AS ret_num,
          (SELECT count(DISTINCT v.client_id)::int FROM loyalty.visits v WHERE v.tenant_id = t.id AND v.source <> 'bonus' AND ${inCur("v.created_at")}) AS ret_den,
          (SELECT count(*)::int FROM loyalty.clients c WHERE c.tenant_id = t.id AND c.id IN (SELECT client_id FROM inst)) AS installed,
          (SELECT avg(v.amount)::numeric(10,2) FROM loyalty.visits v WHERE v.tenant_id = t.id AND v.amount > 0 AND ${inCur("v.created_at")}) AS avg_ticket,
          ((SELECT count(*)::int FROM loyalty.rewards r WHERE r.tenant_id = t.id AND r.status = 'redeemed' AND r.redeemed_at IS NOT NULL AND ${inCur("r.redeemed_at")})
           + (SELECT count(*)::int FROM loyalty.points_transactions pt WHERE pt.tenant_id = t.id AND pt.type = 'redeem' AND ${inCur("pt.created_at")})) AS redemptions,
          (SELECT max(v.created_at) FROM loyalty.visits v WHERE v.tenant_id = t.id AND v.source <> 'bonus') AS last_visit_at,
          (SELECT count(*)::int FROM loyalty.clients c WHERE c.tenant_id = t.id AND c.status <> 'blocked'
             AND c.points_balance >= (SELECT min(rc.points_cost) FROM loyalty.reward_catalog rc WHERE rc.tenant_id = t.id AND rc.active = true)) AS can_redeem
        FROM tenants t
        LEFT JOIN plans p ON p.id = t.plan_id
        WHERE t.id IN (SELECT id FROM s)
        ORDER BY visits DESC, t.name
      `),
      // ── Platform funnel (lifecycle, not period-scoped) ──
      db.execute<Record<string, Num>>(sql`
        WITH firsts AS (
          SELECT c.tenant_id, min(c.created_at) AS first_at,
                 (SELECT c2.created_at FROM loyalty.clients c2 WHERE c2.tenant_id = c.tenant_id ORDER BY c2.created_at OFFSET 9 LIMIT 1) AS tenth_at
          FROM loyalty.clients c GROUP BY c.tenant_id
        )
        SELECT
          (SELECT count(*)::int FROM solicitudes) AS requests,
          (SELECT count(*)::int FROM solicitudes WHERE status = 'approved') AS approved,
          (SELECT count(*)::int FROM tenants t WHERE t.status IN ('active','trial') AND EXISTS (SELECT 1 FROM loyalty.clients c WHERE c.tenant_id = t.id)) AS with_first,
          (SELECT count(*)::int FROM tenants t WHERE t.status IN ('active','trial') AND (SELECT count(*) FROM loyalty.clients c WHERE c.tenant_id = t.id) >= 10) AS with_ten,
          (SELECT count(DISTINCT v.tenant_id)::int FROM loyalty.visits v JOIN tenants t ON t.id = v.tenant_id
             WHERE t.status IN ('active','trial') AND v.source <> 'bonus' AND v.created_at >= now() - interval '7 days') AS active_week,
          (SELECT avg(EXTRACT(EPOCH FROM (fs.first_at - t.created_at)) / 86400)::numeric(10,1) FROM firsts fs JOIN tenants t ON t.id = fs.tenant_id) AS avg_to_first,
          (SELECT avg(EXTRACT(EPOCH FROM (fs.tenth_at - fs.first_at)) / 86400)::numeric(10,1) FROM firsts fs WHERE fs.tenth_at IS NOT NULL) AS avg_first_to_ten
      `),
      // ── Wallet split + weekly Apple installs (last 8 weeks) ──
      db.execute<Record<string, Num>>(sql`
        WITH s AS (SELECT id FROM ${scope}),
        cw AS (
          SELECT c.id,
            bool_or(ad.serial_number IS NOT NULL) AS has_apple,
            bool_or(pi.google_save_url IS NOT NULL AND pi.google_save_url <> '') AS has_google
          FROM loyalty.clients c
          LEFT JOIN passes.pass_instances pi ON pi.client_id = c.id
          LEFT JOIN passes.apple_devices ad ON ad.serial_number = pi.serial_number
          WHERE c.tenant_id IN (SELECT id FROM s)
          GROUP BY c.id
        )
        SELECT
          count(*) FILTER (WHERE has_apple)::int AS apple,
          count(*) FILTER (WHERE has_google AND NOT has_apple)::int AS google,
          count(*) FILTER (WHERE NOT has_apple AND NOT coalesce(has_google, false))::int AS none
        FROM cw
      `),
      // ── Campaigns in period ──
      db.execute<Record<string, Num>>(sql`
        WITH s AS (SELECT id FROM ${scope})
        SELECT
          (SELECT count(*)::int FROM campaigns.campaigns cp WHERE cp.tenant_id IN (SELECT id FROM s) AND cp.status = 'sent' AND cp.sent_at IS NOT NULL AND ${inCur("cp.sent_at")}) AS sent,
          (SELECT count(*)::int FROM campaigns.notifications nt JOIN campaigns.campaigns cp ON cp.id = nt.campaign_id
             WHERE cp.tenant_id IN (SELECT id FROM s) AND nt.sent_at IS NOT NULL AND ${inCur("nt.sent_at")}) AS notifications,
          (SELECT count(*)::int FROM campaigns.notifications nt JOIN campaigns.campaigns cp ON cp.id = nt.campaign_id
             WHERE cp.tenant_id IN (SELECT id FROM s) AND nt.status = 'delivered' AND nt.sent_at IS NOT NULL AND ${inCur("nt.sent_at")}) AS delivered,
          (SELECT count(*)::int FROM campaigns.notifications nt JOIN campaigns.campaigns cp ON cp.id = nt.campaign_id
             WHERE cp.tenant_id IN (SELECT id FROM s) AND nt.status = 'failed' AND nt.sent_at IS NOT NULL AND ${inCur("nt.sent_at")}) AS failed
      `),
      // ── Filter options ──
      db.execute<{ kind: string; id: string; name: string }>(sql`
        SELECT 'plan' AS kind, id::text, name FROM plans WHERE active = true
        UNION ALL
        SELECT 'tenant', id::text, name FROM tenants WHERE status IN ('active','trial')
        ORDER BY kind, name
      `),
    ])

  const weeklyRes = await db.execute<{ week: string; cnt: Num }>(sql`
    WITH s AS (SELECT id FROM ${scope})
    SELECT to_char(date_trunc('week', ${local("ad.created_at")}), 'YYYY-MM-DD') AS week, count(*)::int AS cnt
    FROM passes.apple_devices ad
    JOIN passes.pass_instances pi ON pi.serial_number = ad.serial_number
    JOIN loyalty.clients c ON c.id = pi.client_id
    WHERE c.tenant_id IN (SELECT id FROM s) AND ad.created_at >= now() - interval '8 weeks'
    GROUP BY 1 ORDER BY 1
  `)

  // ── Shape KPIs ──
  const k = kpiRes.rows[0] ?? {}
  const kpis: PlatformMetrics["kpis"] = {
    scopeTenants: n(k.scope_tenants),
    activeTenants: { cur: n(k.active_cur), prev: n(k.active_prev) },
    visits: { cur: n(k.visits_cur), prev: n(k.visits_prev) },
    newClients: { cur: n(k.newc_cur), prev: n(k.newc_prev) },
    returnRate: {
      cur: pct(n(k.ret_num_cur), n(k.ret_den_cur)),
      prev: pct(n(k.ret_num_prev), n(k.ret_den_prev)),
    },
    installRate: {
      cur: pct(n(k.inst_num_cur), n(k.newc_cur)),
      prev: pct(n(k.inst_num_prev), n(k.newc_prev)),
    },
    avgTicket: { cur: n(k.ticket_cur), prev: n(k.ticket_prev) },
    redemptions: { cur: n(k.red_cur), prev: n(k.red_prev) },
    mrr: { cur: n(k.mrr_cur), prev: n(k.mrr_prev) },
  }

  // ── Daily series aligned by index ──
  const dates = dateList(f.from, days)
  const prevDates = dateList(prevFrom, days)
  const byKind = new Map<string, Map<string, number>>()
  for (const r of dailyRes.rows) {
    if (!byKind.has(r.kind)) byKind.set(r.kind, new Map())
    byKind.get(r.kind)?.set(r.day, n(r.cnt))
  }
  const series = (kind: string) => {
    const m = byKind.get(kind) ?? new Map<string, number>()
    return { cur: dates.map((d) => m.get(d) ?? 0), prev: prevDates.map((d) => m.get(d) ?? 0) }
  }
  const daily: PlatformMetrics["daily"] = {
    dates,
    prevDates,
    visits: series("visits"),
    newClients: series("newClients"),
    installs: series("installs"),
    redemptions: series("redemptions"),
  }

  // ── Tenants table ──
  const now = Date.now()
  const tenants: TenantMetricsRow[] = tenantRes.rows.map((r) => {
    const lastVisit = r.last_visit_at ? new Date(r.last_visit_at as string | Date) : null
    const trialEnds = r.trial_ends_at ? new Date(r.trial_ends_at as string | Date) : null
    const clients = n(r.clients as Num)
    const daysSince = lastVisit ? (now - lastVisit.getTime()) / 86_400_000 : null
    const health: TenantMetricsRow["health"] =
      clients === 0 && !lastVisit
        ? "none"
        : daysSince === null
          ? "bad"
          : daysSince <= 7
            ? "good"
            : daysSince <= 30
              ? "warn"
              : "bad"
    const newClients = n(r.new_clients as Num)
    const retDen = n(r.ret_den as Num)
    return {
      id: String(r.id),
      name: String(r.name),
      slug: String(r.slug),
      status: String(r.status),
      plan: (r.plan as string | null) ?? null,
      planPrice: n(r.plan_price as Num),
      program: r.program === "points" || r.program === "stamps" ? r.program : null,
      clients,
      newClients,
      visits: n(r.visits as Num),
      visitsPrev: n(r.visits_prev as Num),
      returnRate: retDen > 0 ? pct(n(r.ret_num as Num), retDen) : null,
      installed: n(r.installed as Num),
      installRate: newClients > 0 ? pct(n(r.new_installed as Num), newClients) : null,
      redemptions: n(r.redemptions as Num),
      avgTicket:
        r.avg_ticket === null || r.avg_ticket === undefined ? null : n(r.avg_ticket as Num),
      lastVisitAt: lastVisit ? lastVisit.toISOString() : null,
      trialEndsAt: trialEnds ? trialEnds.toISOString() : null,
      trialDaysLeft:
        r.status === "trial" && trialEnds
          ? Math.ceil((trialEnds.getTime() - now) / 86_400_000)
          : null,
      designPublished: Boolean(r.design_published),
      activePromotions: n(r.active_promotions as Num),
      canRedeem: n(r.can_redeem as Num),
      health,
    }
  })

  // ── Funnel ──
  const fu = funnelRes.rows[0] ?? {}
  const funnel: PlatformMetrics["funnel"] = {
    requests: n(fu.requests),
    approved: n(fu.approved),
    withFirstClient: n(fu.with_first),
    withTenClients: n(fu.with_ten),
    activeThisWeek: n(fu.active_week),
    avgDaysToFirstClient: fu.avg_to_first == null ? null : n(fu.avg_to_first),
    avgDaysFirstToTen: fu.avg_first_to_ten == null ? null : n(fu.avg_first_to_ten),
  }

  const w = walletRes.rows[0] ?? {}
  const cp = campaignRes.rows[0] ?? {}
  const notifications = n(cp.notifications)

  const options: PlatformMetrics["options"] = {
    plans: optionsRes.rows
      .filter((r) => r.kind === "plan")
      .map((r) => ({ id: r.id, name: r.name })),
    tenants: optionsRes.rows
      .filter((r) => r.kind === "tenant")
      .map((r) => ({ id: r.id, name: r.name })),
  }

  return {
    range: { from: f.from, to: f.to, prevFrom, prevTo, days },
    kpis,
    daily,
    insights: buildInsights({ kpis, tenants, days }),
    tenants,
    funnel,
    wallet: {
      apple: n(w.apple),
      google: n(w.google),
      none: n(w.none),
      installsWeekly: weeklyRes.rows.map((r) => ({ week: r.week, count: n(r.cnt) })),
    },
    campaigns: {
      sent: n(cp.sent),
      notifications,
      delivered: n(cp.delivered),
      failed: n(cp.failed),
      deliveryRate: notifications > 0 ? pct(n(cp.delivered), notifications) : null,
    },
    options,
  }
}

// ── Insights: deterministic rules over the same data ──────────────────

function fmtList(names: string[], max = 3): string {
  const shown = names.slice(0, max).join(", ")
  return names.length > max ? `${shown} y ${names.length - max} más` : shown
}

function buildInsights(ctx: {
  kpis: PlatformMetrics["kpis"]
  tenants: TenantMetricsRow[]
  days: number
}): Insight[] {
  const { kpis, tenants, days } = ctx
  const out: Insight[] = []
  const nowMs = Date.now()

  // 1. Tenants with clients but silent for 14+ days
  const silent = tenants.filter(
    (t) =>
      t.clients > 0 &&
      (t.lastVisitAt === null || nowMs - Date.parse(t.lastVisitAt) > 14 * 86_400_000),
  )
  if (silent.length > 0) {
    out.push({
      severity: "critical",
      text: `${silent.length} comercio${silent.length > 1 ? "s llevan" : " lleva"} 14 días o más sin registrar visitas: ${fmtList(silent.map((t) => t.name))}. Conviene llamar antes de que se enfríen.`,
      href: "/admin/tenants",
      tenantIds: silent.map((t) => t.id),
    })
  }

  // 2. Demos expiring within 7 days that are not ready
  const expiring = tenants.filter(
    (t) =>
      t.trialDaysLeft !== null && t.trialDaysLeft <= 7 && (!t.designPublished || t.clients === 0),
  )
  if (expiring.length > 0) {
    out.push({
      severity: "warning",
      text: `${expiring.length} demo${expiring.length > 1 ? "s vencen" : " vence"} en 7 días o menos y todavía ${expiring.length > 1 ? "no tienen" : "no tiene"} diseño publicado o clientes: ${fmtList(expiring.map((t) => t.name))}. Sin uso, no van a convertir.`,
      href: "/admin/tenants?status=trial",
      tenantIds: expiring.map((t) => t.id),
    })
  }
  const expiringOk = tenants.filter(
    (t) => t.trialDaysLeft !== null && t.trialDaysLeft <= 7 && t.designPublished && t.clients > 0,
  )
  if (expiringOk.length > 0) {
    out.push({
      severity: "info",
      text: `${expiringOk.length} demo${expiringOk.length > 1 ? "s" : ""} con uso real vence${expiringOk.length > 1 ? "n" : ""} esta semana: ${fmtList(expiringOk.map((t) => t.name))}. Momento de proponer el plan.`,
      href: "/admin/tenants?status=trial",
      tenantIds: expiringOk.map((t) => t.id),
    })
  }

  // 3. Points tenants with many clients able to redeem
  const redeemable = tenants.filter((t) => t.program === "points" && t.canRedeem >= 10)
  for (const t of redeemable.slice(0, 3)) {
    out.push({
      severity: "info",
      text: `${t.name} tiene ${t.canRedeem} clientes con saldo para canjear y solo ${t.redemptions} canje${t.redemptions === 1 ? "" : "s"} en el período. Una campaña "ya podés canjear" suele moverlos.`,
      href: `/admin/tenants?q=${encodeURIComponent(t.name)}`,
      tenantIds: [t.id],
    })
  }

  // 4. Install rate
  if (kpis.newClients.cur >= 5) {
    if (kpis.installRate.prev > 0 && kpis.installRate.cur < kpis.installRate.prev - 10) {
      out.push({
        severity: "warning",
        text: `Solo ${kpis.installRate.cur}% de los clientes nuevos instaló el pase, contra ${kpis.installRate.prev}% en el período anterior. Revisá el flujo de registro y la página de bienvenida.`,
      })
    } else if (kpis.installRate.cur < 40) {
      out.push({
        severity: "warning",
        text: `Solo ${kpis.installRate.cur}% de los clientes nuevos instaló el pase. Por debajo del 40% el programa pierde la mitad del valor.`,
      })
    } else if (kpis.installRate.cur >= 60) {
      out.push({
        severity: "positive",
        text: `${kpis.installRate.cur}% de los clientes nuevos instaló el pase. Buen nivel.`,
      })
    }
  }

  // 5. Visits swing vs previous period, with the main contributor
  if (kpis.visits.prev >= 10) {
    const change = ((kpis.visits.cur - kpis.visits.prev) / kpis.visits.prev) * 100
    if (Math.abs(change) >= 15) {
      const deltas = tenants
        .map((t) => ({ t, d: t.visits - t.visitsPrev }))
        .sort((a, b) => (change < 0 ? a.d - b.d : b.d - a.d))
      const top = deltas[0]
      const who =
        top && top.d !== 0
          ? ` La mayor parte viene de ${top.t.name} (${top.d > 0 ? "+" : ""}${top.d}).`
          : ""
      out.push({
        severity: change < 0 ? "critical" : "positive",
        text: `Las visitas ${change < 0 ? "cayeron" : "subieron"} ${Math.abs(Math.round(change))}% respecto a los ${days} días anteriores.${who}`,
      })
    }
  }

  // 6. Two active promotions
  const dual = tenants.filter((t) => t.activePromotions > 1)
  if (dual.length > 0) {
    out.push({
      severity: "warning",
      text: `${fmtList(dual.map((t) => t.name))} ${dual.length > 1 ? "tienen" : "tiene"} más de una promoción activa: las visitas pueden registrarse en la equivocada. Dejá una sola.`,
      href: "/admin/tenants",
      tenantIds: dual.map((t) => t.id),
    })
  }

  // 7. Active tenants share
  if (kpis.scopeTenants > 0) {
    const share = Math.round((kpis.activeTenants.cur / kpis.scopeTenants) * 100)
    if (share < 60) {
      out.push({
        severity: "warning",
        text: `Solo ${kpis.activeTenants.cur} de ${kpis.scopeTenants} comercios del filtro registraron visitas en el período (${share}%).`,
      })
    }
  }

  // 8. MRR movement
  if (kpis.mrr.prev > 0 && kpis.mrr.cur !== kpis.mrr.prev) {
    const d = kpis.mrr.cur - kpis.mrr.prev
    out.push({
      severity: d > 0 ? "positive" : "warning",
      text: `El ingreso mensual estimado ${d > 0 ? "subió" : "bajó"} S/ ${Math.abs(d).toLocaleString("es-PE")} respecto al período anterior (comercios activos × precio de plan).`,
    })
  }

  if (out.length === 0) {
    out.push({
      severity: "positive",
      text: "Sin alertas: los comercios del filtro registran visitas, no hay demos por vencer sin uso y la instalación del pase se mantiene.",
    })
  }
  const order = { critical: 0, warning: 1, info: 2, positive: 3 }
  return out.sort((a, b) => order[a.severity] - order[b.severity])
}
