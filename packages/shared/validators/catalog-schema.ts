import { z } from "zod"

/**
 * Reward photo: an absolute URL or a relative asset path as returned by the
 * upload routes (`/api/assets/tenants/<id>/assets/<uuid>.png`).
 */
export const catalogImageUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^https?:\/\/\S+$/.test(v) || /^\/api\/assets\/[\w\-./]+$/.test(v), {
    message: "URL de imagen inválida",
  })

export const createCatalogItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().default(null),
  imageUrl: catalogImageUrlSchema.nullable().default(null),
  pointsCost: z.number().int().positive(),
  category: z.string().trim().max(50).nullable().default(null),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
})

export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>

export const updateCatalogItemSchema = createCatalogItemSchema.partial()

export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>
