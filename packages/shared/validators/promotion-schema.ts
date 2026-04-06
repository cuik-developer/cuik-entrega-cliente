import { z } from "zod"

// --- Sub-schemas ---

const doubleStampsDaySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(0).max(23),
})

const stampsExpirationSchema = z.object({
  type: z.enum(["never", "months", "inactivity"]).default("never"),
  value: z.number().int().min(0).default(0),
})

const tierLevelSchema = z.object({
  name: z.string().min(1).max(50),
  minVisits: z.number().int().min(0),
  maxVisits: z.number().int().min(1).nullable().default(null),
})

const tiersSchema = z.object({
  enabled: z.boolean().default(true),
  levels: z.array(tierLevelSchema).default([
    { name: "Nuevo", minVisits: 0, maxVisits: 4 },
    { name: "Frecuente", minVisits: 5, maxVisits: 19 },
    { name: "VIP", minVisits: 20, maxVisits: null },
  ]),
})

const locationRestrictionsSchema = z.object({
  restrictToLocations: z.boolean().default(false),
  allowedLocationIds: z.array(z.string().uuid()).default([]),
})

const accumulationSchema = z.object({
  bonusOnRegistration: z.number().int().min(0).max(5).default(0),
  doubleStampsDays: z.array(doubleStampsDaySchema).default([]),
  birthdayBonus: z.number().int().min(0).max(5).default(0),
  minimumPurchaseAmount: z.number().positive().nullable().default(null),
})

const stampsBlockSchema = z.object({
  maxVisitsPerDay: z.number().int().min(1).max(10).default(1),
  rewardExpirationDays: z.number().int().min(1).nullable().default(null),
  stampsExpiration: stampsExpirationSchema.default({}),
})

// --- Main config schema ---

export const stampsPromotionConfigSchema = z.object({
  version: z.literal(1).default(1),
  stamps: stampsBlockSchema.default({}),
  accumulation: accumulationSchema.default({}),
  tiers: tiersSchema.default({}),
  locationRestrictions: locationRestrictionsSchema.default({}),
})

export type StampsPromotionConfig = z.infer<typeof stampsPromotionConfigSchema>

export const DEFAULT_STAMPS_CONFIG: StampsPromotionConfig = stampsPromotionConfigSchema.parse({})

// --- Points config schema ---

const pointsMultiplierSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(0).max(23),
  multiplier: z.number().positive().min(1).max(10).default(2),
})

const pointsExpirationSchema = z.object({
  type: z.enum(["never", "months", "inactivity"]).default("never"),
  value: z.number().int().min(0).default(0),
})

const pointsBlockSchema = z.object({
  pointsPerCurrency: z.number().positive().default(1),
  roundingMethod: z.enum(["floor", "round", "ceil"]).default("floor"),
  minimumPurchaseForPoints: z.number().positive().nullable().default(null),
  maxVisitsPerDay: z.number().int().min(1).max(10).default(1),
  pointsExpiration: pointsExpirationSchema.default({}),
})

const pointsAccumulationSchema = z.object({
  pointsMultipliers: z.array(pointsMultiplierSchema).default([]),
  birthdayMultiplier: z.number().positive().min(1).max(10).default(1),
  bonusPointsOnRegistration: z.number().int().min(0).default(0),
})

export const pointsPromotionConfigSchema = z.object({
  version: z.literal(1).default(1),
  points: pointsBlockSchema.default({}),
  accumulation: pointsAccumulationSchema.default({}),
  tiers: tiersSchema.default({}),
  locationRestrictions: locationRestrictionsSchema.default({}),
})

export type PointsPromotionConfig = z.infer<typeof pointsPromotionConfigSchema>

export const DEFAULT_POINTS_CONFIG: PointsPromotionConfig = pointsPromotionConfigSchema.parse({})

// --- API schemas ---

export const createPromotionSchema = z.object({
  type: z.enum(["stamps", "points"]),
  maxVisits: z.number().int().min(2).max(50).optional(),
  rewardValue: z.string().trim().min(1).max(200),
  active: z.boolean().default(true),
  config: z.union([stampsPromotionConfigSchema, pointsPromotionConfigSchema]).default({}),
})

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>

export const updateStampsPromotionSchema = z.object({
  maxVisits: z.number().int().min(2).max(50).optional(),
  rewardValue: z.string().trim().min(1).max(200).optional(),
  active: z.boolean().optional(),
  config: stampsPromotionConfigSchema.partial().optional(),
})

export const updatePointsPromotionSchema = z.object({
  maxVisits: z.number().int().min(2).max(50).optional(),
  rewardValue: z.string().trim().min(1).max(200).optional(),
  active: z.boolean().optional(),
  config: pointsPromotionConfigSchema.partial().optional(),
})

// Keep backward-compatible alias — stamps config partial by default
export const updatePromotionSchema = updateStampsPromotionSchema

export type UpdatePromotionInput = z.infer<typeof updateStampsPromotionSchema>
export type UpdatePointsPromotionInput = z.infer<typeof updatePointsPromotionSchema>
