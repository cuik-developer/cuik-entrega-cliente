import { and, clients, count, db, desc, eq, sql, visits } from "@cuik/db"
import { Award, Coins, Gift, TrendingUp, UserPlus, Users } from "lucide-react"
import { headers } from "next/headers"

import { auth } from "@/lib/auth"
import { getDashboardKpis, getTodayItems } from "@/lib/dashboard/compute-dashboard"
import {
  getPointsDashboardKpis,
  getPointsDashboardState,
  getPointsPerDay,
} from "@/lib/dashboard/compute-points-dashboard"
import { getTenantForUser } from "@/lib/tenant-context"

import { type KpiCard, KpiCompareCards } from "./components/kpi-compare-cards"
import { PointsStateCards } from "./components/points-state-cards"
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
  const isPoints = tenant.promotionType === "points"
  // Inline the tz literal (not as a bound parameter) to avoid PG's "must
  // appear in GROUP BY" when the same tz appears in SELECT and GROUP BY —
  // Drizzle gives each ${tz} a separate $N, breaking expression equality.
  const rawTz = tenant.timezone
  const safeTz = rawTz.replace(/[^A-Za-z0-9_/+-]/g, "") || "America/Lima"
  const tz = sql.raw(`'${safeTz}'`)

  const [kpis, pointsKpis, pointsState, pointsPerDay, today, recentVisits, weeklyVisitsData] =
    await Promise.all([
      isPoints ? null : getDashboardKpis(tenantId, tenant.timezone),
      isPoints ? getPointsDashboardKpis(tenantId, tenant.timezone) : null,
      isPoints ? getPointsDashboardState(tenantId, tenant.timezone) : null,
      isPoints ? getPointsPerDay(tenantId, tenant.timezone) : null,
      getTodayItems({ tenantId, organizationId: tenant.organizationId }),

      // Last 10 visits with client join
      db
        .select({
          id: visits.id,
          visitNum: visits.visitNum,
          cycleNumber: visits.cycleNumber,
          createdAt: visits.createdAt,
          points: visits.points,
          amount: visits.amount,
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
      // Points programs chart the points granted; stamps programs the visits.
      value: pointsPerDay ? (pointsPerDay.get(key) ?? 0) : (visitsByDate.get(key) ?? 0),
    }
  })

  // Stamps: visits, unique clients, new clients, rewards redeemed.
  // Points: points granted, points redeemed, clients who earned, redemptions.
  const kpiCards: KpiCard[] = pointsKpis
    ? [
        {
          key: "pointsEarned",
          label: "Puntos otorgados hoy",
          icon: Coins,
          bg: "bg-blue-50 text-primary",
          kpi: pointsKpis.pointsEarned,
        },
        {
          key: "pointsRedeemed",
          label: "Puntos canjeados hoy",
          icon: Gift,
          bg: "bg-orange-50 text-accent",
          kpi: pointsKpis.pointsRedeemed,
        },
        {
          key: "clientsEarned",
          label: "Clientes que sumaron hoy",
          icon: Users,
          bg: "bg-emerald-50 text-emerald-600",
          kpi: pointsKpis.clientsEarned,
        },
        {
          key: "redemptions",
          label: "Canjes hoy",
          icon: Award,
          bg: "bg-amber-50 text-amber-600",
          kpi: pointsKpis.redemptions,
        },
      ]
    : kpis
      ? [
          {
            key: "visits",
            label: "Visitas hoy",
            icon: TrendingUp,
            bg: "bg-blue-50 text-primary",
            kpi: kpis.visits,
          },
          {
            key: "uniqueClients",
            label: "Clientes que vinieron hoy",
            icon: Users,
            bg: "bg-emerald-50 text-emerald-600",
            kpi: kpis.uniqueClients,
          },
          {
            key: "newClients",
            label: "Clientes nuevos hoy",
            icon: UserPlus,
            bg: "bg-amber-50 text-amber-600",
            kpi: kpis.newClients,
          },
          {
            key: "rewardsRedeemed",
            label: "Premios canjeados hoy",
            icon: Award,
            bg: "bg-orange-50 text-accent",
            kpi: kpis.rewardsRedeemed,
          },
        ]
      : []

  const transactions = recentVisits.map((v) => ({
    id: v.id,
    visitNum: v.visitNum,
    cycleNumber: v.cycleNumber,
    createdAt: v.createdAt.toISOString(),
    points: v.points,
    amount: v.amount,
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

      <KpiCompareCards cards={kpiCards} />

      {pointsState && <PointsStateCards state={pointsState} />}

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2">
          <TodayBlock items={today} timezone={tenant.timezone} points={pointsState ?? undefined} />
        </div>
        <div className="lg:col-span-3">
          <WeeklyChart
            data={weeklyChart}
            title={isPoints ? "Puntos otorgados esta semana" : "Visitas esta semana"}
            unit={isPoints ? "puntos" : "visitas"}
          />
        </div>
      </div>

      <TransactionsTable
        data={transactions}
        timezone={tenant.timezone}
        mode={isPoints ? "points" : "stamps"}
      />
    </div>
  )
}
