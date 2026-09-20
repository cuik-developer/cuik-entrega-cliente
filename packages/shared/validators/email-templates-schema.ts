import { z } from "zod"

/**
 * Editable emails sent from Solicitudes (super-admin). Stored in
 * `global_config` under `email_tpl_approval` / `email_tpl_rejection`.
 * Bodies are plain text: blank lines separate paragraphs, `{{var}}` are
 * replaced (see SOLICITUD_EMAIL_VARIABLES). The approval mail always appends
 * the credentials box and the login button, so they cannot be lost by editing.
 */

const emailTemplateSchema = z.object({
  subject: z.string().trim().min(1, "El asunto es obligatorio").max(150),
  body: z.string().trim().min(1, "El mensaje es obligatorio").max(5000),
})

export const solicitudEmailTemplatesSchema = z.object({
  approval: emailTemplateSchema,
  rejection: emailTemplateSchema.extend({
    /** Rejections send nothing unless the SA turns this on. */
    enabled: z.boolean().default(false),
  }),
})

export type SolicitudEmailTemplates = z.infer<typeof solicitudEmailTemplatesSchema>
export type SolicitudEmailKind = keyof SolicitudEmailTemplates

export const SOLICITUD_EMAIL_VARIABLES: Array<{
  key: string
  label: string
  kinds: SolicitudEmailKind[]
}> = [
  { key: "{{businessName}}", label: "Nombre del comercio", kinds: ["approval", "rejection"] },
  { key: "{{contactName}}", label: "Nombre del contacto", kinds: ["approval", "rejection"] },
  { key: "{{email}}", label: "Email del contacto", kinds: ["approval", "rejection"] },
  { key: "{{trialDays}}", label: "Dias de prueba", kinds: ["approval"] },
  { key: "{{reason}}", label: "Motivo del rechazo", kinds: ["rejection"] },
  { key: "{{platformName}}", label: "Nombre de la plataforma", kinds: ["approval", "rejection"] },
  { key: "{{supportEmail}}", label: "Email de soporte", kinds: ["approval", "rejection"] },
]

export const DEFAULT_SOLICITUD_EMAIL_TEMPLATES: SolicitudEmailTemplates = {
  approval: {
    subject: "¡Bienvenido a {{platformName}}, {{businessName}}!",
    body: [
      "Hola {{contactName}}, tu cuenta para {{businessName}} ya está activa. Podés empezar a configurar tu programa de fidelización ahora mismo.",
      "Te recomendamos cambiar tu contraseña después del primer ingreso.",
      "Tenés {{trialDays}} días de prueba para explorar todas las funcionalidades. Si necesitás ayuda, respondé a este email.",
    ].join("\n\n"),
  },
  rejection: {
    enabled: false,
    subject: "Sobre tu solicitud para {{businessName}}",
    body: [
      "Hola {{contactName}}, gracias por tu interés en {{platformName}}.",
      "Por ahora no vamos a poder avanzar con la solicitud de {{businessName}}. Motivo: {{reason}}",
      "Si creés que hubo un error o querés que la revisemos de nuevo, escribinos a {{supportEmail}}.",
    ].join("\n\n"),
  },
}

/** Replaces {{var}} placeholders; unknown variables are left as-is so they are visible. */
export function renderEmailTemplateText(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) =>
    key in vars ? vars[key] : match,
  )
}

/** Paragraphs of a rendered body (blank-line separated, trimmed, empty ones dropped). */
export function emailBodyParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}
