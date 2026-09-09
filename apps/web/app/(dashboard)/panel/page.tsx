import { and, clients, count, db, desc, eq, rewards, sql, visits } from "@cuik/db"
import { Plus, Star, TrendingUp, Users } from "lucide-react"
import { headers } from "next/headers"

import { Card, CardContent } from "@/components/ui/card"
import { auth } from "@/lib/auth"
import { getTenantForUser } from "@/lib/tenant-context"

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

  // "Today" and "week start" evaluated in tenant's timezone via SQL AT TIME ZONE

  const [
    totalClientsResult,
    visitsToday,
    visitsWeek,
    pendingRewardsResult,
    newClientsToday,
    recentVisits,
    weeklyVisitsData,
  ] = await Promise.all([
    // Total clients
    db.select({ cnt: count() }).from(clients).where(eq(clients.tenantId, tenantId)),

    // Visits today (tenant timezone)
    db
      .select({ cnt: count() })
      .from(visits)
      .where(
        and(
          eq(visits.tenantId, tenantId),
          sql`(${visits.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date = (NOW() AT TIME ZONE ${tz})::date`,
        ),
      ),

    // Visits this week (tenant timezone, week starts Sunday)
    db
      .select({ cnt: count() })
      .from(visits)
      .where(
        and(
          eq(visits.tenantId, tenantId),
          sql`(${visits.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date >= date_trunc('week', (NOW() AT TIME ZONE ${tz}))::date`,
        ),
      ),

    // Pending rewards
    db
      .select({ cnt: count() })
      .from(rewards)
      .where(and(eq(rewards.tenantId, tenantId), eq(rewards.status, "pending"))),

    // New clients today (tenant timezone)
    db
      .select({ cnt: count() })
      .from(clients)
      .where(
        and(
          eq(clients.tenantId, tenantId),
          sql`(${clients.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date = (NOW() AT TIME ZONE ${tz})::date`,
        ),
      ),

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

  const totalClients = totalClientsResult[0]?.cnt ?? 0
  const todayVisitCount = visitsToday[0]?.cnt ?? 0
  const weekVisitCount = visitsWeek[0]?.cnt ?? 0
  const pendingRewards = pendingRewardsResult[0]?.cnt ?? 0
  const newClientsTodayCount = newClientsToday[0]?.cnt ?? 0

  const kpis = [
    {
      label: "Visitas hoy",
      value: String(todayVisitCount),
      sub: `${weekVisitCount} esta semana`,
      subColor: "text-slate-500",
      icon: TrendingUp,
      bg: "bg-blue-50 text-primary",
    },
    {
      label: "Clientes activos",
      value: String(totalClients),
      sub: "registrados",
      subColor: "text-slate-500",
      icon: Users,
      bg: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Nuevos hoy",
      value: String(newClientsTodayCount),
      sub: "clientes nuevos",
      subColor: "text-emerald-600",
      icon: Plus,
      bg: "bg-amber-50 text-amber-600",
    },
    {
      label: "Premios pendientes",
      value: String(pendingRewards),
      sub: "ciclos completados",
      subColor: "text-accent",
      icon: Star,
      bg: "bg-orange-50 text-accent",
    },
  ]

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="border border-slate-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500 font-medium">{kpi.label}</span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${kpi.bg}`}>
                  <kpi.icon className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900">{kpi.value}</div>
              <div className={`text-xs mt-0.5 font-medium ${kpi.subColor}`}>{kpi.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <WeeklyChart data={weeklyChart} />
        <TransactionsTable data={transactions} timezone={tenant.timezone} />
      </div>
    </div>
  )
}
