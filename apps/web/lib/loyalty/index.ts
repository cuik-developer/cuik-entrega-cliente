export type { ClientSegment, ClientSegmentInput, SegmentationThresholds } from "./client-segments"
export {
  BUSINESS_TYPE_DEFAULTS,
  computeClientSegment,
  DEFAULT_THRESHOLDS,
  getThresholds,
  SEGMENT_COLORS,
  SEGMENT_LABELS,
} from "./client-segments"
export { getClientStatus } from "./client-status"
export { redeemPoints } from "./redeem-points"
export { redeemReward } from "./redeem-reward"
export { registerPointsVisit } from "./register-points-visit"
export { registerVisit } from "./register-visit"
export { computeTier, evaluatePointsRules, evaluateStampRules, getNextTier } from "./rules-engine"
export type {
  ClientStatus,
  CreateCatalogItemInput,
  CreatePromotionInput,
  PointsPromotionConfig,
  PointsRedeemResult,
  PointsRedeemResultCode,
  PointsRulesContext,
  PointsRulesResult,
  PointsVisitResult,
  RedeemResult,
  RedeemResultCode,
  RulesEvaluationContext,
  RulesEvaluationResult,
  StampsPromotionConfig,
  TierInfo,
  UpdateCatalogItemInput,
  UpdatePromotionInput,
  VisitResult,
  VisitResultCode,
} from "./types"
export { DEFAULT_POINTS_CONFIG, DEFAULT_STAMPS_CONFIG } from "./types"
