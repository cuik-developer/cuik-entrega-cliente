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

// ── Points about to expire ──────────────────────────────────────────

export const DEFAULT_POINTS_EXPIRY_MESSAGE =
  "Tus puntos en {{tenant.name}} vencen el {{points.expiresAt}}. Pásate antes y úsalos."

/**
 * Push sent to clients whose points expire within `daysBefore` days. Only
 * meaningful when the tenant's points promotion has an expiration policy
 * (set by the Cuik team); the merchant owns the text, the timing and the
 * on/off switch.
 */
export const pointsExpiryAutomationSchema = z.object({
  enabled: z.boolean(),
  message: z
    .string()
    .trim()
    .min(1, "El mensaje es requerido")
    .max(150, "Apple Wallet trunca mensajes a 150 caracteres"),
  /** Days before the cutoff. 2 = the push goes out two days before the points expire. */
  daysBefore: z.number().int().min(1).max(30),
  /** Local hour (tenant timezone) at which the push goes out, 0-23. */
  sendHour: z.number().int().min(0).max(23),
})

export type PointsExpiryAutomation = z.infer<typeof pointsExpiryAutomationSchema>

export const DEFAULT_POINTS_EXPIRY_AUTOMATION: PointsExpiryAutomation = {
  enabled: false,
  message: DEFAULT_POINTS_EXPIRY_MESSAGE,
  daysBefore: 2,
  sendHour: 10,
}

// ── Reports by email ────────────────────────────────────────────────

/** Weekly report: sent once a week, on `dayOfWeek` (1 = Monday … 7 = Sunday) at `sendHour`. */
export const weeklyReportSchema = z.object({
  enabled: z.boolean(),
  dayOfWeek: z.number().int().min(1).max(7),
  sendHour: z.number().int().min(0).max(23),
  /** Period key of the last report sent (e.g. "2026-09-07"), so a re-run never duplicates. */
  lastSentPeriod: z.string().optional(),
})

/** Monthly report (with the all-time section): sent on `dayOfMonth` (1-28) at `sendHour`. */
export const monthlyReportSchema = z.object({
  enabled: z.boolean(),
  dayOfMonth: z.number().int().min(1).max(28),
  sendHour: z.number().int().min(0).max(23),
  lastSentPeriod: z.string().optional(),
})

/** Who receives the reports. Empty/absent = the default list (contact email + owner + admins). */
export const reportRecipientsSchema = z
  .array(z.string().trim().toLowerCase().email("Correo inválido"))
  .max(10, "Máximo 10 correos")

export const reportsAutomationSchema = z.object({
  weekly: weeklyReportSchema.optional(),
  monthly: monthlyReportSchema.optional(),
  recipients: reportRecipientsSchema.optional(),
})

export type WeeklyReportConfig = z.infer<typeof weeklyReportSchema>
export type MonthlyReportConfig = z.infer<typeof monthlyReportSchema>
export type ReportsAutomation = z.infer<typeof reportsAutomationSchema>

export const DEFAULT_WEEKLY_REPORT: WeeklyReportConfig = {
  enabled: false,
  dayOfWeek: 1,
  sendHour: 8,
}
export const DEFAULT_MONTHLY_REPORT: MonthlyReportConfig = {
  enabled: false,
  dayOfMonth: 1,
  sendHour: 8,
}

export const automationsConfigSchema = z.object({
  birthday: birthdayAutomationSchema.optional(),
  pointsExpiry: pointsExpiryAutomationSchema.optional(),
  reports: reportsAutomationSchema.optional(),
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
    pointsExpiry: pointsExpiryAutomationSchema.optional(),
    reports: z
      .object({
        weekly: weeklyReportSchema.omit({ lastSentPeriod: true }).optional(),
        monthly: monthlyReportSchema.omit({ lastSentPeriod: true }).optional(),
        recipients: reportRecipientsSchema.optional(),
      })
      .optional(),
  })
  .refine(
    (v) => v.birthday !== undefined || v.pointsExpiry !== undefined || v.reports !== undefined,
    {
      message: "Nada que actualizar",
    },
  )

export type UpdateAutomationsInput = z.infer<typeof updateAutomationsSchema>
