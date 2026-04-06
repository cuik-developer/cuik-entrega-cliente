import { z } from "zod"

export const appleConfigModeSchema = z.enum(["demo", "configuring", "production"])

export const appleConfigSchema = z.object({
  mode: appleConfigModeSchema,
  teamId: z.string().min(1).optional(),
  passTypeId: z.string().min(1).optional(),
  signerCertBase64: z.string().min(1).optional(),
  signerKeyBase64: z.string().min(1).optional(),
  signerKeyPassphrase: z.string().optional(),
  authSecret: z.string().min(1).optional(),
  wwdrBase64: z.string().optional(),
  configuredAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
})

export type AppleConfig = z.infer<typeof appleConfigSchema>

/** Strict version for production activation — all required fields enforced */
export const appleConfigProductionSchema = appleConfigSchema.extend({
  mode: z.literal("production"),
  teamId: z.string().min(1),
  passTypeId: z.string().min(1),
  signerCertBase64: z.string().min(1),
  signerKeyBase64: z.string().min(1),
  authSecret: z.string().min(1),
  configuredAt: z.string().datetime(),
})

export type AppleConfigProduction = z.infer<typeof appleConfigProductionSchema>
