import { z } from "zod"

export const designChangeRequestTypeEnum = z.enum(["color", "texto", "imagen", "reglas", "otro"])

export type DesignChangeRequestType = z.infer<typeof designChangeRequestTypeEnum>

export const createDesignChangeRequestSchema = z.object({
  type: designChangeRequestTypeEnum.default("otro"),
  message: z
    .string()
    .trim()
    .min(10, "Cuéntanos en al menos 10 caracteres qué cambio necesitas")
    .max(2000, "El mensaje no puede superar 2000 caracteres"),
})

export type CreateDesignChangeRequestInput = z.infer<typeof createDesignChangeRequestSchema>
