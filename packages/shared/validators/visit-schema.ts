import { z } from "zod"

// Messages are shown to the cashier as-is (visits route), so they are in Spanish.
export const registerVisitSchema = z.object({
  qrCode: z
    .string({ required_error: "Falta el código QR", invalid_type_error: "Código QR inválido" })
    .trim()
    .min(1, "Falta el código QR"),
  locationId: z.string().uuid("Sucursal inválida").optional(),
  // "qr" = camera scan in Escanear; "manual" = Buscar or a typed code.
  source: z.enum(["qr", "manual"]).optional(),
  // Typo guard at the till: 100000 instead of 100.00 would give 1000x the points.
  amount: z
    .number({ invalid_type_error: "Ingresa un monto válido" })
    .positive("El monto debe ser mayor a 0")
    .max(10000, "El monto máximo por compra es S/ 10,000")
    .optional(),
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
  status: z.enum(["active", "inactive", "blocked", "archived", "deleted"]).optional(),
  segment: z
    .enum(["nuevo", "frecuente", "esporadico", "regular", "one_time", "en_riesgo", "inactivo"])
    .optional(),
  // "1" → only clients with at least one reward pending redemption
  pendingReward: z.enum(["1"]).optional(),
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
