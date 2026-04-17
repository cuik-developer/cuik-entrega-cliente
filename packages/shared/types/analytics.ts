export interface VisitsDailyRow {
  tenantId: string
  date: string
  locationId: string
  totalVisits: number
  uniqueClients: number
  newClients: number
  rewardsRedeemed: number
}

export interface RetentionCohortRow {
  tenantId: string
  cohortMonth: string
  monthOffset: number
  clientsCount: number
  retentionPct: number
}

export interface TopClient {
  id: string
  name: string
  tier: string | null
  visitCount: number
}

export interface AnalyticsSummary {
  totalVisits: number
  uniqueClients: number
  newClients: number
  rewardsRedeemed: number
  redemptionRate: number
  avgVisitsPerClient: number
  topClients: TopClient[]
}

export interface AnalyticsQueryParams {
  from: string
  to: string
  granularity?: "day" | "week" | "month"
  locationId?: string
}

export interface RetentionQueryParams {
  months?: number
}
