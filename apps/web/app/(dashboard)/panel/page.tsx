import { and, clients, count, db, desc, eq, sql, visits } from "@cuik/db"
import { headers } from "next/headers"

import { auth } from "@/lib/auth"
import { getDashboardKpis, getTodayItems } from "@/lib/dashboard/compute-dashboard"
import { getTenantForUser } from "@/lib/tenant-context"

import { KpiCompareCards } from "./components/kpi-compare-cards"
import { TodayBlock } from "./components/today-block"
import { TransactionsTable } from "./components/transactions-table"
import { WeeklyChart } from "./components/weekly-chart"

export default async function DashboardPage() {
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })

  if (!session) {
    return <p className="text-slate-500">No autenticado</p>
  }

  const tenant = await getTenantForUser(session.user.id)
  if (!tenant) {
    return <p className="text-slate-500">Sin comercio asignado</p>
  }

  const tenantId = tenant.tenantId
  // Inline the tz literal (not as a bound parameter) to avoid PG's "must
  // appear in GROUP BY" when the same tz appears in SELECT and GROUP BY —
  // Drizzle gives each ${tz} a separate $N, breaking expression equality.
  const rawTz = tenant.timezone
  const safeTz = rawTz.replace(/[^A-Za-z0-9_/+-]/g, "") || "America/Lima"
  const tz = sql.raw(`'${safeTz}'`)

  const [kpis, today, recentVisits, weeklyVisitsData] = await Promise.all([
    getDashboardKpis(tenantId, tenant.timezone),
    getTodayItems({ tenantId, organizationId: tenant.organizationId }),

    // Last 10 visits with client join
    db
      .select({
        id: visits.id,
        visitNum: visits.visitNum,
        cycleNumber: visits.cycleNumber,
        createdAt: visits.createdAt,
        clientName: clients.name,
        clientLastName: clients.lastName,
      })
      .from(visits)
      .innerJoin(clients, eq(visits.clientId, clients.id))
      .where(eq(visits.tenantId, tenantId))
      .orderBy(desc(visits.createdAt))
      .limit(10),

    // Daily visit counts for last 7 days (bucketed by tenant's local day).
    // Returns the date as "YYYY-MM-DD" text and lets the UI name the weekday:
    // to_char(..., 'Dy') depends on Postgres' lc_time and came back in English.
    db
      .select({
        date: sql<string>`to_char((${visits.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date, 'YYYY-MM-DD')`,
        visits: count(),
      })
      .from(visits)
      .where(
        and(
          eq(visits.tenantId, tenantId),
          sql`(${visits.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date >= (NOW() AT TIME ZONE ${tz})::date - interval '6 days'`,
        ),
      )
      .groupBy(sql`(${visits.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date`)
      .orderBy(sql`(${visits.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date`),
  ])

  // Always 7 bars (today and the 6 days before, tenant-local), zero-filled, so a
  // quiet Monday shows as 0 instead of disappearing from the axis.
  const visitsByDate = new Map(weeklyVisitsData.map((d) => [d.date, Number(d.visits)]))
  const todayLocal = new Date().toLocaleDateString("en-CA", { timeZone: tenant.timezone })
  const [ty, tm, td] = todayLocal.split("-").map(Number)
  const weeklyChart = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ty, tm - 1, td - (6 - i), 12)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const label = d.toLocaleDateString("es-PE", { weekday: "short" }).replace(".", "")
    return {
      day: label.charAt(0).toUpperCase() + label.slice(1),
      visits: visitsByDate.get(key) ?? 0,
    }
  })

  const transactions = recentVisits.map((v) => ({
    id: v.id,
    visitNum: v.visitNum,
    cycleNumber: v.cycleNumber,
    createdAt: v.createdAt.toISOString(),
    clientName: v.clientName,
    clientLastName: v.clientLastName,
  }))

  const now = new Date()
  const dateStr = now.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: tenant.timezone,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">
          {tenant.tenantName} · {dateStr}
        </p>
      </div>

      <KpiCompareCards kpis={kpis} />

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2">
          <TodayBlock items={today} timezone={tenant.timezone} />
        </div>
        <div className="lg:col-span-3">
          <WeeklyChart data={weeklyChart} />
        </div>
      </div>

      <TransactionsTable data={transactions} timezone={tenant.timezone} />
    </div>
  )
}
