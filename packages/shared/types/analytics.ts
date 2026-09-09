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

/** One cell of the day-of-week × hour heatmap. `dow` is ISO (1 = Monday … 7 = Sunday), `hour` 0-23, in the tenant's timezone. */
export interface HeatmapCell {
  dow: number
  hour: number
  visits: number
}

export interface HeatmapData {
  cells: HeatmapCell[]
  totalVisits: number
}

export type FunnelStepKey = "registered" | "wallet" | "visited" | "loyal" | "redeemed"

export interface FunnelStep {
  key: FunnelStepKey
  count: number
}

export interface FunnelData {
  steps: FunnelStep[]
}

export interface SegmentCount {
  segment: string
  count: number
}

export interface SegmentsData {
  segments: SegmentCount[]
  total: number
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
