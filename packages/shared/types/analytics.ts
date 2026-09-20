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

export type FunnelStepKey = "registered" | "visited" | "loyal" | "redeemed"

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

// ─── Points program ────────────────────────────────────────────────────

export interface PointsSeriesRow {
  date: string // YYYY-MM-DD (tenant-local bucket)
  earned: number
  redeemed: number
}

export interface TopRewardRow {
  id: string
  name: string
  count: number
  points: number
  lastAt: string | null
}

export interface PointsAnalytics {
  kpis: {
    earned: number
    earnedPrev: number
    redeemed: number
    redeemedPrev: number
    /** Sum of balances of active clients: what the business owes in rewards. */
    outstanding: number
    avgTicket: number | null
    ticketCount: number
  }
  series: PointsSeriesRow[]
  topRewards: TopRewardRow[]
  balances: {
    activeClients: number
    cheapestCost: number | null
    mostExpensiveCost: number | null
    belowCheapest: number
    canRedeemCheapest: number
    canRedeemMostExpensive: number
  }
  incentives: {
    bonusPoints: number
    birthdayExtraPoints: number
  }
  /** Lifetime: clients that redeemed points at least once (funnel last step). */
  redeemers: number
}
