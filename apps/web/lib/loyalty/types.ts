// Loyalty business logic types
// Canonical types come from @cuik/shared (Zod inferred)
// Re-export here for convenience within the loyalty module

export type {
  CreateCatalogItemInput,
  CreatePromotionInput,
  PointsPromotionConfig,
  StampsPromotionConfig,
  UpdateCatalogItemInput,
  UpdatePointsPromotionInput,
  UpdatePromotionInput,
} from "@cuik/shared/validators"

export { DEFAULT_POINTS_CONFIG, DEFAULT_STAMPS_CONFIG } from "@cuik/shared/validators"

// --- Rules Engine Types ---

export type RulesEvaluationContext = {
  visitDate: Date
  clientTotalVisits: number
  clientBirthday?: Date | null
  visitAmount?: number | null
  locationId?: string | null
  todayVisitCount: number
}

export type RulesEvaluationResult = {
  eligible: boolean
  stampsToEarn: number
  bonusReasons: string[]
  rejectionReason?: string
}

export type TierInfo = {
  name: string
  minVisits: number
  maxVisits: number | null
}

// --- Result Codes ---

export type VisitResultCode =
  | "OK"
  | "ALREADY_SCANNED_TODAY"
  | "MAX_VISITS_REACHED"
  | "CLIENT_NOT_FOUND"
  | "NO_ACTIVE_PROMOTION"
  | "BELOW_MINIMUM_PURCHASE"
  | "AMOUNT_REQUIRED"
  | "LOCATION_NOT_ALLOWED"

export type RedeemResultCode = "OK" | "NO_PENDING_REWARD" | "CLIENT_NOT_FOUND" | "REWARD_EXPIRED"

// --- Result Types ---

export type VisitResult = {
  code: VisitResultCode
  visit?: {
    id: string
    visitNum: number
    cycleNumber: number
    createdAt: Date
  }
  client: {
    id: string
    name: string
    lastName: string | null
    totalVisits: number
    currentCycle: number
    tier?: string | null
  }
  stamps: {
    current: number
    max: number
  }
  cycleComplete: boolean
  pendingRewards: number
  rewardValue?: string | null
  bonusApplied?: string | null
}

export type RedeemResult = {
  code: RedeemResultCode
  reward?: {
    id: string
    cycleNumber: number
    rewardType: string | null
    redeemedAt: Date
  }
  remainingPendingRewards: number
}

export type ClientStatus = {
  client: {
    id: string
    name: string
    lastName: string | null
    dni: string | null
    phone: string | null
    email: string | null
    qrCode: string | null
    status: string
    totalVisits: number
    currentCycle: number
    tier: string | null
    createdAt: Date
  }
  segment: string
  stamps: {
    current: number | null
    max: number | null
  }
  pendingRewards: number
  promotion: {
    id: string
    type: string
    maxVisits: number
    rewardValue: string | null
  } | null
  tierInfo?: {
    current: string
    nextTier: string | null
    visitsToNext: number | null
  }
  rewardExpiration?: {
    nearestExpiresAt: Date | null
    expiredCount: number
  }
  points?: {
    balance: number
    availableCatalogItems?: number
  }
}

// --- Points Rules Engine Types ---

export type PointsRulesContext = {
  visitDate: Date
  clientTotalVisits: number
  clientBirthday?: Date | null
  visitAmount: number
  locationId?: string | null
  todayVisitCount: number
}

export type PointsRulesResult = {
  eligible: boolean
  pointsToEarn: number
  bonusReasons: string[]
  rejectionReason?: string
}

// --- Points Result Codes ---

export type PointsRedeemResultCode =
  | "OK"
  | "INSUFFICIENT_POINTS"
  | "CATALOG_ITEM_NOT_FOUND"
  | "CATALOG_ITEM_INACTIVE"
  | "CLIENT_NOT_FOUND"
  | "NO_ACTIVE_PROMOTION"

// --- Points Result Types ---

export type PointsVisitResult = {
  code: VisitResultCode
  visit?: {
    id: string
    pointsEarned: number
    createdAt: Date
  }
  client: {
    id: string
    name: string
    lastName: string | null
    totalVisits: number
    pointsBalance: number
    tier?: string | null
  }
  points: {
    earned: number
    balance: number
  }
  bonusApplied?: string | null
}

export type PointsRedeemResult = {
  code: PointsRedeemResultCode
  catalogItem?: {
    id: string
    name: string
    pointsCost: number
  }
  points?: {
    deducted: number
    newBalance: number
  }
}
