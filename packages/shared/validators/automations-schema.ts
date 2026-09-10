import { z } from "zod"

/**
 * Per-tenant automations, stored in tenants.automations (jsonb).
 * Each automation is optional so new ones can be added without migrating data.
 */

export const DEFAULT_BIRTHDAY_MESSAGE =
  "¡Feliz cumpleaños, {{client.name}}! 🎉 Pasá hoy por {{tenant.name}} y celebrá con nosotros."

export const birthdayAutomationSchema = z.object({
  enabled: z.boolean(),
  message: z
    .string()
    .trim()
    .min(1, "El mensaje es requerido")
    .max(150, "Apple Wallet trunca mensajes a 150 caracteres"),
  /** Local hour (tenant timezone) at which the greeting goes out, 0-23. */
  sendHour: z.number().int().min(0).max(23),
})

export type BirthdayAutomation = z.infer<typeof birthdayAutomationSchema>

export const automationsConfigSchema = z.object({
  birthday: birthdayAutomationSchema.optional(),
})

export type AutomationsConfig = z.infer<typeof automationsConfigSchema>

export const DEFAULT_BIRTHDAY_AUTOMATION: BirthdayAutomation = {
  enabled: false,
  message: DEFAULT_BIRTHDAY_MESSAGE,
  sendHour: 10,
}

/** Body of PUT /api/[tenant]/automations — partial update, one automation at a time. */
export const updateAutomationsSchema = z
  .object({
    birthday: birthdayAutomationSchema.optional(),
  })
  .refine((v) => v.birthday !== undefined, { message: "Nada que actualizar" })

export type UpdateAutomationsInput = z.infer<typeof updateAutomationsSchema>
