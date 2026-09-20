import { db, globalConfig, inArray } from "@cuik/db"
import { MensajePersonalizado } from "@cuik/email"
import {
  DEFAULT_PLATFORM_CONFIG,
  DEFAULT_SOLICITUD_EMAIL_TEMPLATES,
  emailBodyParagraphs,
  renderEmailTemplateText,
  type SolicitudEmailKind,
  type SolicitudEmailTemplates,
  solicitudEmailTemplatesSchema,
} from "@cuik/shared/validators"
import type { ReactElement } from "react"

export const EMAIL_TPL_KEYS: Record<SolicitudEmailKind, string> = {
  approval: "email_tpl_approval",
  rejection: "email_tpl_rejection",
}
const PLATFORM_KEYS = { platformName: "platform_name", supportEmail: "support_email" } as const

/** Templates from global_config, each falling back to the default when missing/invalid. */
export async function getSolicitudEmailTemplates(): Promise<SolicitudEmailTemplates> {
  const rows = await db
    .select({ key: globalConfig.key, value: globalConfig.value })
    .from(globalConfig)
    .where(inArray(globalConfig.key, [EMAIL_TPL_KEYS.approval, EMAIL_TPL_KEYS.rejection]))
  const byKey = new Map(rows.map((r) => [r.key, r.value]))
  const parsed = solicitudEmailTemplatesSchema.safeParse({
    approval: byKey.get(EMAIL_TPL_KEYS.approval) ?? DEFAULT_SOLICITUD_EMAIL_TEMPLATES.approval,
    rejection: byKey.get(EMAIL_TPL_KEYS.rejection) ?? DEFAULT_SOLICITUD_EMAIL_TEMPLATES.rejection,
  })
  if (parsed.success) return parsed.data
  // One of the stored values is broken: use it only if it parses on its own.
  const approval = solicitudEmailTemplatesSchema.shape.approval.safeParse(
    byKey.get(EMAIL_TPL_KEYS.approval),
  )
  const rejection = solicitudEmailTemplatesSchema.shape.rejection.safeParse(
    byKey.get(EMAIL_TPL_KEYS.rejection),
  )
  return {
    approval: approval.success ? approval.data : DEFAULT_SOLICITUD_EMAIL_TEMPLATES.approval,
    rejection: rejection.success ? rejection.data : DEFAULT_SOLICITUD_EMAIL_TEMPLATES.rejection,
  }
}

async function platformVars(): Promise<{ platformName: string; supportEmail: string }> {
  const rows = await db
    .select({ key: globalConfig.key, value: globalConfig.value })
    .from(globalConfig)
    .where(inArray(globalConfig.key, [PLATFORM_KEYS.platformName, PLATFORM_KEYS.supportEmail]))
  const byKey = new Map(rows.map((r) => [r.key, r.value]))
  const str = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v : fallback)
  return {
    platformName: str(byKey.get(PLATFORM_KEYS.platformName), DEFAULT_PLATFORM_CONFIG.platformName),
    supportEmail: str(byKey.get(PLATFORM_KEYS.supportEmail), DEFAULT_PLATFORM_CONFIG.supportEmail),
  }
}

export type ApprovalEmailVars = {
  businessName: string
  contactName: string
  email: string
  password: string
  loginUrl: string
  trialDays: number
}
export type RejectionEmailVars = {
  businessName: string
  contactName: string
  email: string
  reason: string
}

/**
 * Subject + React Email element for an approval mail. The credentials box
 * and the login button are always appended, whatever the edited text says.
 */
export async function buildApprovalEmail(
  vars: ApprovalEmailVars,
  templates?: SolicitudEmailTemplates,
): Promise<{ subject: string; template: ReactElement }> {
  const tpl = (templates ?? (await getSolicitudEmailTemplates())).approval
  const pv = await platformVars()
  const dict: Record<string, string> = {
    businessName: vars.businessName,
    contactName: vars.contactName,
    email: vars.email,
    trialDays: String(vars.trialDays),
    platformName: pv.platformName,
    supportEmail: pv.supportEmail,
  }
  const subject = renderEmailTemplateText(tpl.subject, dict)
  const paragraphs = emailBodyParagraphs(renderEmailTemplateText(tpl.body, dict))
  return {
    subject,
    template: MensajePersonalizado({
      preview: subject,
      heading: `¡Bienvenido a ${pv.platformName}!`,
      paragraphs,
      credentials: { email: vars.email, password: vars.password },
      cta: { label: "Ingresar al panel", url: vars.loginUrl },
    }),
  }
}

/** Subject + element for a rejection mail, or null when rejections are not sent. */
export async function buildRejectionEmail(
  vars: RejectionEmailVars,
  templates?: SolicitudEmailTemplates,
): Promise<{ subject: string; template: ReactElement } | null> {
  const tpl = (templates ?? (await getSolicitudEmailTemplates())).rejection
  if (!tpl.enabled) return null
  const pv = await platformVars()
  const dict: Record<string, string> = {
    businessName: vars.businessName,
    contactName: vars.contactName,
    email: vars.email,
    reason: vars.reason || "no especificado",
    platformName: pv.platformName,
    supportEmail: pv.supportEmail,
  }
  const subject = renderEmailTemplateText(tpl.subject, dict)
  return {
    subject,
    template: MensajePersonalizado({
      preview: subject,
      paragraphs: emailBodyParagraphs(renderEmailTemplateText(tpl.body, dict)),
    }),
  }
}
