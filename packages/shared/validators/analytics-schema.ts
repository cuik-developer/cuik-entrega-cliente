import { z } from "zod"

export const analyticsQuerySchema = z
  .object({
    from: z.string().date("Invalid date format for 'from'"),
    to: z.string().date("Invalid date format for 'to'"),
    granularity: z.enum(["day", "week", "month"]).default("day"),
    locationId: z.string().uuid("Invalid location ID").optional(),
  })
  .refine((data) => data.from <= data.to, {
    message: "from date must be before to date",
    path: ["from"],
  })

export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>

export const retentionQuerySchema = z.object({
  months: z.coerce.number().int().min(3).max(12).default(6),
})

export type RetentionQueryInput = z.infer<typeof retentionQuerySchema>

export const summaryQuerySchema = z
  .object({
    from: z.string().date("Invalid date format for 'from'"),
    to: z.string().date("Invalid date format for 'to'"),
  })
  .refine((data) => data.from <= data.to, {
    message: "from date must be before to date",
    path: ["from"],
  })

export type SummaryQueryInput = z.infer<typeof summaryQuerySchema>
