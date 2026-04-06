import { z } from "zod"

export const registerVisitSchema = z.object({
  qrCode: z.string().trim().min(1, "QR code is required"),
  locationId: z.string().uuid().optional(),
  amount: z.number().positive().optional(),
})

export type RegisterVisitInput = z.infer<typeof registerVisitSchema>

export const redeemRewardSchema = z.object({
  qrCode: z.string().trim().min(1, "QR code is required"),
  catalogItemId: z.string().uuid().optional(),
})

export type RedeemRewardInput = z.infer<typeof redeemRewardSchema>

export const clientSearchSchema = z.object({
  search: z.string().trim().optional(),
  qr: z.string().trim().optional(),
  status: z.enum(["active", "inactive", "blocked"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type ClientSearchInput = z.infer<typeof clientSearchSchema>

export const visitHistorySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  date: z.string().date().optional(),
  clientId: z.string().uuid().optional(),
})

export type VisitHistoryInput = z.infer<typeof visitHistorySchema>
