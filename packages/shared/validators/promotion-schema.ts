import { z } from "zod"

// --- Sub-schemas ---

const doubleStampsDaySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(0).max(23),
})

// --- Expiration policy (shared by points and stamps) ---

/** 0 = domingo ... 6 = sabado, like Date#getDay(). */
const weekdaySchema = z.number().int().min(0).max(6)

/**
 * When do points / stamps expire. Every cutoff is the END of the given local
 * day in the tenant timezone (the points are still valid all Thursday and are
 * gone Friday 00:00).
 *
 * - never:    no expiration.
 * - rolling:  each earn lot lasts `days` days from the day it was earned.
 * - weekly:   everything resets at the end of `weekday`, every week.
 * - monthly:  everything resets at the end of the `ordinal`-th `weekday` of
 *             the month ("primer jueves", "ultimo viernes").
 * - interval: everything resets every `days` days counted from `anchor`
 *             (a local "YYYY-MM-DD"), regardless of weekday.
 */
export const expirationPolicySchema = z.preprocess(
  (raw) => {
    // Legacy shape {type: "never"|"months"|"inactivity", value} was never
    // acted on: read it as "never" so old rows keep parsing.
    if (raw && typeof raw === "object" && "type" in raw && !("mode" in raw)) {
      return { mode: "never" }
    }
    return raw
  },
  z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("never") }),
    z.object({ mode: z.literal("rolling"), days: z.number().int().min(1).max(730) }),
    z.object({ mode: z.literal("weekly"), weekday: weekdaySchema }),
    z.object({
      mode: z.literal("monthly"),
      weekday: weekdaySchema,
      ordinal: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal("last")]),
    }),
    z.object({
      mode: z.literal("interval"),
      days: z.number().int().min(1).max(730),
      anchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  ]),
)

export type ExpirationPolicy = z.infer<typeof expirationPolicySchema>

// --- Bonus windows ("hora x2": double or triple stamps / points) ---

const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "Hora inválida")

/** "08:30" -> 510. "24:00" -> 1440 (end of day). */
export function minutesOfClock(value: string): number {
  const [h, m] = value.split(":").map(Number)
  return h * 60 + m
}

/**
 * A time window in which each visit earns `multiplier` times the stamps or
 * points. Weekly windows repeat on `days` (0 = domingo ... 6 = sabado);
 * date windows apply on one local "YYYY-MM-DD". Times are tenant-local, the
 * start is inclusive and the end exclusive ("08:00"-"12:00" ends at 11:59).
 */
export const bonusWindowSchema = z
  .object({
    id: z.string().min(1).max(40),
    // No commas: the cashier screen splits the applied bonuses on ", ".
    label: z
      .string()
      .trim()
      .max(60)
      .regex(/^[^,]*$/, "El nombre no puede llevar comas")
      .default(""),
    kind: z.enum(["weekly", "date"]),
    days: z.array(weekdaySchema).max(7).default([]),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
    start: clockTimeSchema,
    end: clockTimeSchema,
    multiplier: z.number().int().min(2).max(10),
    active: z.boolean().default(true),
  })
  .superRefine((w, ctx) => {
    if (w.kind === "weekly" && w.days.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["days"],
        message: "Elige al menos un día",
      })
    }
    if (w.kind === "date" && !w.date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["date"], message: "Elige la fecha" })
    }
    if (minutesOfClock(w.end) <= minutesOfClock(w.start)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end"],
        message: "La hora de fin debe ser posterior a la de inicio",
      })
    }
  })

export type BonusWindow = z.infer<typeof bonusWindowSchema>

/** What the panel saves: every window must be valid. */
export const bonusWindowsSchema = z.array(bonusWindowSchema).max(20)

/** Highest multiplier per program: x3 keeps a short stamps card from filling in one scan. */
export const BONUS_MAX_MULTIPLIER = { stamps: 3, points: 10 } as const

/** `bonusWindowsSchema` plus the multiplier cap of the promotion type. */
export function bonusWindowsSchemaFor(type: "stamps" | "points") {
  const max = BONUS_MAX_MULTIPLIER[type]
  return bonusWindowsSchema.superRefine((list, ctx) => {
    list.forEach((w, i) => {
      if (w.multiplier > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, "multiplier"],
          message: `Máximo ×${max} para ${type === "stamps" ? "sellos" : "puntos"}`,
        })
      }
    })
  })
}

/**
 * Windows as stored in a promotion config. Invalid entries are dropped instead
 * of failing the whole config, so one bad row (manual edit, a future stricter
 * rule) can never break every scan of the tenant.
 */
function storedBonusWindowsSchema(maxMultiplier: number) {
  return z.preprocess(
    (raw) =>
      Array.isArray(raw)
        ? raw
            .filter((w) => {
              const parsed = bonusWindowSchema.safeParse(w)
              return parsed.success && parsed.data.multiplier <= maxMultiplier
            })
            .slice(0, 20)
        : [],
    z.array(bonusWindowSchema),
  )
}

/** Tenant-local clock reading used to match bonus windows. */
export type LocalClock = { date: string; weekday: number; minutes: number }

/**
 * The active window with the highest multiplier at this local moment, or
 * null. Windows do not stack with each other.
 */
export function activeBonusWindow(
  windows: readonly BonusWindow[] | undefined,
  clock: LocalClock,
): BonusWindow | null {
  let best: BonusWindow | null = null
  for (const w of windows ?? []) {
    if (!w.active) continue
    const onDay = w.kind === "weekly" ? w.days.includes(clock.weekday) : w.date === clock.date
    if (!onDay) continue
    if (clock.minutes < minutesOfClock(w.start) || clock.minutes >= minutesOfClock(w.end)) continue
    if (!best || w.multiplier > best.multiplier) best = w
  }
  return best
}

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
  bonusWindows: storedBonusWindowsSchema(BONUS_MAX_MULTIPLIER.stamps),
  minimumPurchaseAmount: z.number().positive().nullable().default(null),
})

// --- Intermediate rewards ("escalera": a gift at visit 4, another at 8...) ---

/**
 * A milestone inside the stamps cycle. The business hands the gift over itself
 * (nothing is recorded as a reward); the system tells the client through the
 * pass one visit before and on the visit itself, and tells the cashier on the
 * scan screen. `at` is the position within the cycle (1-based) and must be
 * below the cycle length, which is the promotion's `maxVisits`.
 */
const stampMilestoneSchema = z.object({
  at: z.number().int().min(1).max(49),
  label: z.string().trim().min(1).max(80),
})

export const DEFAULT_MILESTONE_MESSAGES = {
  /** Sent one visit before the milestone. */
  next: "Tu próxima visita tiene premio: {premio}",
  /** Sent on the visit that reaches the milestone. */
  reached: "¡Hoy tienes un premio: {premio}! Pídelo en caja",
} as const

/** An empty template disables that notice (the cashier banner still shows). */
const milestoneMessagesSchema = z.object({
  next: z.string().trim().max(200).default(DEFAULT_MILESTONE_MESSAGES.next),
  reached: z.string().trim().max(200).default(DEFAULT_MILESTONE_MESSAGES.reached),
})

const stampsBlockSchema = z.object({
  maxVisitsPerDay: z.number().int().min(1).max(10).default(1),
  rewardExpirationDays: z.number().int().min(1).nullable().default(null),
  stampsExpiration: expirationPolicySchema.default({ mode: "never" }),
  milestones: z
    .array(stampMilestoneSchema)
    .max(10)
    .default([])
    .refine((list) => new Set(list.map((m) => m.at)).size === list.length, {
      message: "Cada visita puede tener un solo hito",
    }),
  milestoneMessages: milestoneMessagesSchema.default({}),
})

export type StampMilestone = z.infer<typeof stampMilestoneSchema>
export type MilestoneMessages = z.infer<typeof milestoneMessagesSchema>

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

export const POINTS_CALC_MODES = ["per_currency", "currency_per_point"] as const
export type PointsCalcMode = (typeof POINTS_CALC_MODES)[number]

const pointsBlockSchema = z
  .object({
    // How base points are computed from the purchase amount:
    //   per_currency:       points = amount x pointsPerCurrency  ("2 puntos por sol")
    //   currency_per_point: points = amount / solesPerPoint      ("1 punto por cada S/ 4.50")
    // Existing configs have no `calcMode` and keep multiplying, unchanged.
    calcMode: z.enum(POINTS_CALC_MODES).default("per_currency"),
    pointsPerCurrency: z.number().positive().default(1),
    solesPerPoint: z.number().positive().nullable().default(null),
    roundingMethod: z.enum(["floor", "round", "ceil"]).default("floor"),
    minimumPurchaseForPoints: z.number().positive().nullable().default(null),
    maxVisitsPerDay: z.number().int().min(1).max(10).default(1),
    pointsExpiration: expirationPolicySchema.default({ mode: "never" }),
  })
  .superRefine((points, ctx) => {
    if (points.calcMode === "currency_per_point" && points.solesPerPoint === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["solesPerPoint"],
        message: "Indica cuantos soles hacen 1 punto",
      })
    }
  })

/** The subset of the points block that drives the base-points calculation. */
export type PointsRate = {
  calcMode?: PointsCalcMode | null
  pointsPerCurrency?: number | null
  solesPerPoint?: number | null
  roundingMethod?: "floor" | "round" | "ceil" | null
}

/**
 * Base points for a purchase amount. Single source of truth for the rules
 * engine, the super-admin preview and analytics estimates.
 *
 * The raw quotient/product is snapped to 6 decimals before rounding: binary
 * floating point turns 100 x 0.29 into 28.999999999999996 (floor -> 28 instead
 * of 29) and 0.3 / 0.1 into 2.9999999999999996. No real rate uses more than
 * 4 decimals, so 6 removes the noise without changing any legitimate result.
 */
export function pointsForAmount(amount: number, rate: PointsRate): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  let raw: number
  if (rate.calcMode === "currency_per_point") {
    const soles = rate.solesPerPoint ?? 0
    if (soles <= 0) return 0
    raw = amount / soles
  } else {
    raw = amount * (rate.pointsPerCurrency ?? 1)
  }
  raw = Number(raw.toFixed(6))
  switch (rate.roundingMethod ?? "floor") {
    case "ceil":
      return Math.ceil(raw)
    case "round":
      return Math.round(raw)
    default:
      return Math.floor(raw)
  }
}

function fmtSoles(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

/** Human label for the rate: "1 punto por cada S/ 4.50" / "2 puntos por sol". */
export function describePointsRate(rate: PointsRate): string {
  if (rate.calcMode === "currency_per_point" && rate.solesPerPoint) {
    return `1 punto por cada S/ ${fmtSoles(rate.solesPerPoint)}`
  }
  const ppc = rate.pointsPerCurrency ?? 1
  if (ppc === 1) return "1 punto por sol"
  return `${ppc} puntos por sol`
}

const pointsAccumulationSchema = z.object({
  pointsMultipliers: z.array(pointsMultiplierSchema).default([]),
  birthdayMultiplier: z.number().positive().min(1).max(10).default(1),
  bonusPointsOnRegistration: z.number().int().min(0).default(0),
  bonusWindows: storedBonusWindowsSchema(BONUS_MAX_MULTIPLIER.points),
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

/**
 * `config` is validated by the schema that matches `type`. A plain
 * `z.union([stamps, points])` is NOT enough: Zod takes the first branch that
 * parses, and the stamps schema accepts any object thanks to its defaults, so a
 * points config used to be silently rewritten as a default stamps config.
 */
export const createPromotionSchema = z
  .object({
    type: z.enum(["stamps", "points"]),
    maxVisits: z.number().int().min(2).max(50).optional(),
    rewardValue: z.string().trim().min(1).max(200),
    active: z.boolean().default(true),
    config: z.unknown().optional(),
  })
  .transform((value, ctx) => {
    const schema =
      value.type === "points" ? pointsPromotionConfigSchema : stampsPromotionConfigSchema
    const parsed = schema.safeParse(value.config ?? {})
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ ...issue, path: ["config", ...issue.path] })
      }
      return z.NEVER
    }
    return { ...value, config: parsed.data }
  })

/** What callers pass in (config may be partial: defaults are filled by the matching schema). */
export type CreatePromotionInput = z.input<typeof createPromotionSchema>
export type CreatePromotionParsed = z.output<typeof createPromotionSchema>

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

/** What callers send: nested defaults (e.g. `bonusWindows`) may be left out. */
export type UpdatePromotionInput = z.input<typeof updateStampsPromotionSchema>
export type UpdatePointsPromotionInput = z.input<typeof updatePointsPromotionSchema>
