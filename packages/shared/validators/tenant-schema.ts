import { z } from "zod"

export const createTenantSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens"),
  planId: z.string().uuid().optional(),
})

export type CreateTenantInput = z.infer<typeof createTenantSchema>

export const segmentationConfigSchema = z
  .object({
    frequentMaxDays: z.number().int().positive().optional(),
    oneTimeInactiveDays: z.number().int().positive().optional(),
    riskMultiplier: z.number().positive().optional(),
    newClientDays: z.number().int().positive().optional(),
  })
  .nullable()
  .optional()

export type SegmentationConfigInput = z.infer<typeof segmentationConfigSchema>

export const updateTenantSchema = createTenantSchema.partial().extend({
  status: z.enum(["pending", "trial", "active", "expired", "cancelled", "paused"]).optional(),
  settings: z.record(z.unknown()).optional(),
  trialEndsAt: z.string().datetime().optional(),
  businessType: z.string().trim().optional().or(z.literal("")),
  address: z
    .string()
    .trim()
    .max(200, "La dirección no puede superar 200 caracteres")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s\-()]{6,14}$/, "Formato de teléfono inválido")
    .optional()
    .or(z.literal("")),
  contactEmail: z.string().trim().email("Email inválido").optional().or(z.literal("")),
  timezone: z.string().trim().min(1).optional(),
  segmentationConfig: segmentationConfigSchema,
})

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>

export const createSolicitudSchema = z.object({
  businessName: z.string().trim().min(1, "Business name is required"),
  businessType: z.string().trim().optional(),
  contactName: z.string().trim().min(1, "Contact name is required"),
  email: z.string().trim().email("Invalid email address"),
  phone: z.string().trim().optional(),
  city: z.string().trim().optional(),
  message: z.string().trim().optional(),
})

export type CreateSolicitudInput = z.infer<typeof createSolicitudSchema>

export const updateSolicitudSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("approved"),
  }),
  z.object({
    status: z.literal("rejected"),
    rejectionReason: z.string().trim().min(1, "Rejection reason is required"),
  }),
])

export type UpdateSolicitudInput = z.infer<typeof updateSolicitudSchema>

// --- Tenant config (admin-editable business profile) ---

export const tenantConfigSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(100),
  businessType: z.string().trim().optional().or(z.literal("")),
  address: z
    .string()
    .trim()
    .max(200, "La dirección no puede superar 200 caracteres")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s\-()]{6,14}$/, "Formato de teléfono inválido")
    .optional()
    .or(z.literal("")),
  contactEmail: z.string().trim().email("Email inválido").optional().or(z.literal("")),
})

export type TenantConfigInput = z.infer<typeof tenantConfigSchema>

// --- Query param schemas ---

export const listSolicitudesQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
})

export type ListSolicitudesQuery = z.infer<typeof listSolicitudesQuerySchema>

export const listTenantsQuerySchema = z.object({
  status: z.enum(["pending", "trial", "active", "expired", "cancelled", "paused"]).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
})

export type ListTenantsQuery = z.infer<typeof listTenantsQuerySchema>
