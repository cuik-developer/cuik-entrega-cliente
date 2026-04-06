import { z } from "zod"

export const segmentConditionSchema = z.object({
  field: z.enum(["totalVisits", "lastVisitAt", "tier", "createdAt", "status"]),
  operator: z.enum(["eq", "gte", "lte", "between"]),
  value: z.union([z.string(), z.number()]),
  valueTo: z.union([z.string(), z.number()]).optional(),
})

export type SegmentConditionInput = z.infer<typeof segmentConditionSchema>

export const segmentFilterSchema = z.object({
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
  scheduledAt: z.string().datetime().optional(),
})

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>

export const campaignListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["draft", "scheduled", "sending", "sent", "cancelled"]).optional(),
})

export type CampaignListInput = z.infer<typeof campaignListSchema>
