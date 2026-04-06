import { z } from "zod"

export const createCatalogItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().default(null),
  imageUrl: z.string().url().nullable().default(null),
  pointsCost: z.number().int().positive(),
  category: z.string().trim().max(50).nullable().default(null),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
})

export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>

export const updateCatalogItemSchema = createCatalogItemSchema.partial()

export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>
