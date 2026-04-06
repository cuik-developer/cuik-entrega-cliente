import type { campaignSegments, campaigns, notifications } from "@cuik/db"
import type { InferInsertModel, InferSelectModel } from "drizzle-orm"

export type Campaign = InferSelectModel<typeof campaigns>
export type NewCampaign = InferInsertModel<typeof campaigns>

export type Notification = InferSelectModel<typeof notifications>
export type NewNotification = InferInsertModel<typeof notifications>

export type CampaignSegment = InferSelectModel<typeof campaignSegments>
export type NewCampaignSegment = InferInsertModel<typeof campaignSegments>

export type SegmentPreset =
  | "todos"
  | "activos"
  | "inactivos"
  | "vip"
  | "nuevos"
  | "frecuentes"
  | "esporadicos"
  | "one_time"
  | "en_riesgo"

export type SegmentOperator = "eq" | "gte" | "lte" | "between"

export interface SegmentCondition {
  field: "totalVisits" | "lastVisitAt" | "tier" | "createdAt" | "status"
  operator: SegmentOperator
  value: string | number
  valueTo?: string | number
}

export interface SegmentFilter {
  preset?: SegmentPreset
  conditions?: SegmentCondition[]
  tagIds?: string[]
}

export interface CampaignWithStats extends Campaign {
  sent: number
  delivered: number
  failed: number
  total: number
}

export interface CampaignDetail extends Campaign {
  segment: CampaignSegment | null
  stats: {
    sent: number
    delivered: number
    failed: number
    total: number
  }
}

export interface CampaignExecutionResult {
  campaignId: string
  status: "sent" | "failed"
  targetCount: number
  sentCount: number
  deliveredCount: number
  failedCount: number
  errors: string[]
}
