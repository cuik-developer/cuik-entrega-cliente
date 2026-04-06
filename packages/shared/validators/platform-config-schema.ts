import { z } from "zod"

export const platformConfigSchema = z.object({
  platformName: z.string().min(2, "Mínimo 2 caracteres").max(100, "Máximo 100 caracteres"),
  baseUrl: z.string().url("URL inválida"),
  supportEmail: z.string().email("Email inválido"),
  defaultTrialDays: z.coerce
    .number()
    .int("Debe ser un número entero")
    .min(1, "Mínimo 1 día")
    .max(90, "Máximo 90 días"),
})

export type PlatformConfig = z.infer<typeof platformConfigSchema>

export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  platformName: "Cuik",
  baseUrl: "https://app.cuik.pe",
  supportEmail: "soporte@cuik.pe",
  defaultTrialDays: 7,
}
