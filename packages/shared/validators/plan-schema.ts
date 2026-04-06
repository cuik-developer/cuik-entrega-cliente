import { z } from "zod"

export const createPlanSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(100),
  price: z.number().int().min(0, "El precio no puede ser negativo"),
  maxLocations: z.number().int().positive("Debe ser al menos 1"),
  maxPromos: z.number().int().positive("Debe ser al menos 1"),
  maxClients: z.number().int().positive("Debe ser al menos 1"),
  features: z.record(z.string(), z.unknown()).optional(),
})

export type CreatePlanInput = z.infer<typeof createPlanSchema>

export const updatePlanSchema = createPlanSchema.partial()

export type UpdatePlanInput = z.infer<typeof updatePlanSchema>
