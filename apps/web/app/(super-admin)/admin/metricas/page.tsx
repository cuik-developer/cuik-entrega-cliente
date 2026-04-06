import { Suspense } from "react"

export const dynamic = "force-dynamic"

import { getDailyVisits, getPlanDistribution, getPlatformSummary, getTopTenants } from "./actions"
import { DateRangeSelector } from "./components/date-range-selector"
import { KpiCards } from "./components/kpi-cards"
import { PlanDistribution } from "./components/plan-distribution"
import { TopTenants } from "./components/top-tenants"
import { VisitsChart } from "./components/visits-chart"

type SearchParams = Promise<{ days?: string }>

export default async function MetricasPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const days = Math.min(Math.max(Number(params.days) || 30, 7), 365)

  const [summaryResult, visitsResult, planResult, topResult] = await Promise.all([
    getPlatformSummary(),
    getDailyVisits(days),
    getPlanDistribution(),
    getTopTenants(5),
  ])

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          Métricas de plataforma
        </h1>
        <Suspense>
          <DateRangeSelector />
        </Suspense>
      </div>

      {summaryResult.success && <KpiCards data={summaryResult.data} />}

      <div className="grid gap-6 lg:grid-cols-2">
        {visitsResult.success && <VisitsChart data={visitsResult.data} />}
        {planResult.success && <PlanDistribution data={planResult.data} />}
      </div>

      {topResult.success && <TopTenants data={topResult.data} />}
    </div>
  )
}
