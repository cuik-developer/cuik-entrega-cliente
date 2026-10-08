import { z } from "zod"

export const segmentConditionSchema = z.object({
  field: z.enum(["totalVisits", "lastVisitAt", "tier", "createdAt", "status"]),
  operator: z.enum(["eq", "gte", "lte", "between"]),
  value: z.union([z.string(), z.number()]),
  valueTo: z.union([z.string(), z.number()]).optional(),
})

export type SegmentConditionInput = z.infer<typeof segmentConditionSchema>

export const segmentFilterSchema = z
  .object({
    preset: z
      .enum([
        "todos",
        "activos",
        "inactivos",
        "vip",
        "nuevos",
        "frecuentes",
        "esporadicos",
        "one_time",
        "en_riesgo",
      ])
      .optional(),
    conditions: z.array(segmentConditionSchema).max(10).optional(),
    tagIds: z.array(z.string().uuid()).optional(),
    // Explicit recipient list resolved from an Excel upload (see import-recipients route).
    // Snapshot semantics: IDs are resolved at upload time, not at send time.
    clientIds: z
      .array(z.string().uuid())
      .max(20000, "Máximo 20.000 destinatarios por campaña")
      .optional(),
  })
  // An empty list would add no WHERE condition and target EVERY client, so it must
  // be rejected. This lives on the object (not as array.min(1)) so the error lands on
  // the `segment` path itself and react-hook-form's <FormMessage> can display it —
  // a nested `segment.clientIds` error renders nothing in the form.
  .refine((s) => s.clientIds === undefined || s.clientIds.length > 0, {
    message: "Sube un archivo con al menos un destinatario válido",
  })

export type SegmentFilterInput = z.infer<typeof segmentFilterSchema>

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1, "Campaign name is required").max(200),
  type: z.enum(["push", "wallet_update"], {
    errorMap: () => ({ message: "Only push and wallet_update campaign types are supported" }),
  }),
  message: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(150, "Apple Wallet trunca mensajes a 150 caracteres"),
  segment: segmentFilterSchema,
  scheduledAt: z
    .string()
    .datetime()
    .optional()
    .refine((v) => !v || new Date(v).getTime() > Date.now() - 60_000, {
      message: "La fecha de envío debe ser futura",
    }),
})

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>

/**
 * PATCH body for a draft / scheduled campaign. Every field optional;
 * `scheduledAt: null` removes the schedule (back to draft).
 */
export const updateCampaignSchema = z
  .object({
    name: z.string().trim().min(1, "Campaign name is required").max(200).optional(),
    type: z.enum(["push", "wallet_update"]).optional(),
    message: z
      .string()
      .trim()
      .min(1, "Message is required")
      .max(150, "Apple Wallet trunca mensajes a 150 caracteres")
      .optional(),
    segment: segmentFilterSchema.optional(),
    scheduledAt: z
      .string()
      .datetime()
      .nullable()
      .optional()
      .refine((v) => !v || new Date(v).getTime() > Date.now() - 60_000, {
        message: "La fecha de envío debe ser futura",
      }),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nada que actualizar" })

export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>

export const campaignListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["draft", "scheduled", "sending", "sent", "cancelled"]).optional(),
})

export type CampaignListInput = z.infer<typeof campaignListSchema>

// ─── Recurring campaigns ────────────────────────────────────────────────

const YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * Schedule of a recurring campaign, in the tenant timezone.
 * - weekly: every `intervalWeeks` weeks on each of `weekdays` (0 = domingo).
 * - monthly_weekday: the `weekOfMonth`-th `weekdays[0]` of every month (-1 = último).
 */
export const recurrenceRuleSchema = z
  .object({
    frequency: z.enum(["weekly", "monthly_weekday"]),
    intervalWeeks: z.number().int().min(1).max(12).default(1),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Elige al menos un día").max(7),
    weekOfMonth: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)])
      .nullable()
      .optional(),
    sendHour: z.number().int().min(0).max(23),
    sendMinute: z.number().int().min(0).max(59).default(0),
    startsOn: z.string().regex(YMD, "Fecha de inicio inválida"),
    endsOn: z.string().regex(YMD, "Fecha de fin inválida").nullable().optional(),
    maxOccurrences: z.number().int().min(1).max(1000).nullable().optional(),
  })
  .superRefine((r, ctx) => {
    if (r.frequency === "monthly_weekday") {
      if (r.weekdays.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["weekdays"],
          message: "Para la repetición mensual elige un solo día de la semana",
        })
      }
      if (!r.weekOfMonth) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["weekOfMonth"],
          message: "Indica qué semana del mes (primera, segunda... o última)",
        })
      }
    }
    if (r.endsOn && r.endsOn < r.startsOn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsOn"],
        message: "La fecha de fin debe ser posterior al inicio",
      })
    }
  })

export type RecurrenceRuleInput = z.infer<typeof recurrenceRuleSchema>

export const createRecurringCampaignSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  type: z.enum(["push", "wallet_update"]).default("push"),
  /** Rotation: occurrence k sends messages[k mod n]. */
  messages: z
    .array(
      z.string().trim().min(1, "El mensaje no puede estar vacío").max(150, "Máximo 150 caracteres"),
    )
    .min(1, "Escribe al menos un mensaje")
    .max(6, "Máximo 6 mensajes en rotación"),
  // Dynamic audience: an uploaded list is a snapshot, which defeats recurrence.
  segment: segmentFilterSchema.refine((s) => !s.clientIds, {
    message: "Una campaña recurrente usa un segmento, no una lista fija",
  }),
  rule: recurrenceRuleSchema,
  /** Omit clients who visited in the last N days. */
  skipIfVisitedDays: z.number().int().min(1).max(365).nullable().optional(),
  /** Omit clients who received any campaign push in the last N days. */
  minDaysSincePush: z.number().int().min(1).max(365).nullable().optional(),
})

export type CreateRecurringCampaignInput = z.infer<typeof createRecurringCampaignSchema>

/** PATCH body. `status` only toggles active/paused; the cron sets `finished`. */
export const updateRecurringCampaignSchema = createRecurringCampaignSchema.partial().extend({
  status: z.enum(["active", "paused"]).optional(),
})

export type UpdateRecurringCampaignInput = z.infer<typeof updateRecurringCampaignSchema>
