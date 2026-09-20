"use server"

import { db, globalConfig } from "@cuik/db"
import { sendEmail } from "@cuik/email"
import {
  DEFAULT_PLATFORM_CONFIG,
  type PlatformConfig,
  platformConfigSchema,
  type SolicitudEmailKind,
  type SolicitudEmailTemplates,
  solicitudEmailTemplatesSchema,
} from "@cuik/shared/validators"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import {
  buildApprovalEmail,
  buildRejectionEmail,
  EMAIL_TPL_KEYS,
  getSolicitudEmailTemplates as readSolicitudEmailTemplates,
} from "@/lib/admin/solicitud-emails"
import { auth } from "@/lib/auth"

// ── Types ───────────────────────────────────────────────────────────

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

// ── Auth helper ─────────────────────────────────────────────────────

async function requireSuperAdmin() {
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })

  if (!session) {
    return { session: null, error: "No autenticado" } as const
  }

  const role = session.user.role ?? "user"
  if (role !== "super_admin") {
    return { session: null, error: "No autorizado — se requiere super_admin" } as const
  }

  return { session, error: null } as const
}

// ── Key mapping ─────────────────────────────────────────────────────

const CONFIG_KEY_MAP: Record<keyof PlatformConfig, string> = {
  platformName: "platform_name",
  baseUrl: "base_url",
  supportEmail: "support_email",
  defaultTrialDays: "default_trial_days",
}

const REVERSE_KEY_MAP = Object.fromEntries(
  Object.entries(CONFIG_KEY_MAP).map(([k, v]) => [v, k]),
) as Record<string, keyof PlatformConfig>

// ── Actions ─────────────────────────────────────────────────────────

export async function getGlobalConfig(): Promise<ActionResult<PlatformConfig>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  try {
    const rows = await db.select().from(globalConfig)

    const config = { ...DEFAULT_PLATFORM_CONFIG }

    for (const row of rows) {
      const field = REVERSE_KEY_MAP[row.key]
      if (field) {
        // biome-ignore lint/suspicious/noExplicitAny: key-value mapping requires dynamic assignment
        ;(config as any)[field] = row.value
      }
    }

    return { success: true, data: config }
  } catch (err) {
    console.error("[getGlobalConfig]", err)
    return { success: false, error: "Error al obtener configuración" }
  }
}

export async function saveGlobalConfig(data: PlatformConfig): Promise<ActionResult<void>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  const parsed = platformConfigSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  try {
    const now = new Date()

    for (const [field, dbKey] of Object.entries(CONFIG_KEY_MAP)) {
      const value = parsed.data[field as keyof PlatformConfig]

      await db
        .insert(globalConfig)
        .values({ key: dbKey, value, updatedAt: now })
        .onConflictDoUpdate({
          target: globalConfig.key,
          set: { value, updatedAt: now },
        })
    }

    revalidatePath("/admin/configuracion")

    return { success: true, data: undefined }
  } catch (err) {
    console.error("[saveGlobalConfig]", err)
    return { success: false, error: "Error al guardar configuración" }
  }
}

// ── Solicitud emails (approval / rejection templates) ───────────────

export async function getSolicitudEmailTemplates(): Promise<ActionResult<SolicitudEmailTemplates>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }
  try {
    return { success: true, data: await readSolicitudEmailTemplates() }
  } catch (err) {
    console.error("[getSolicitudEmailTemplates]", err)
    return { success: false, error: "Error al obtener las plantillas de correo" }
  }
}

export async function saveSolicitudEmailTemplates(
  data: SolicitudEmailTemplates,
): Promise<ActionResult<void>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  const parsed = solicitudEmailTemplatesSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos invalidos" }
  }

  try {
    for (const kind of ["approval", "rejection"] as SolicitudEmailKind[]) {
      await db
        .insert(globalConfig)
        .values({ key: EMAIL_TPL_KEYS[kind], value: parsed.data[kind], updatedAt: new Date() })
        .onConflictDoUpdate({
          target: globalConfig.key,
          set: { value: parsed.data[kind], updatedAt: new Date() },
        })
    }
    revalidatePath("/admin/configuracion")
    return { success: true, data: undefined }
  } catch (err) {
    console.error("[saveSolicitudEmailTemplates]", err)
    return { success: false, error: "Error al guardar las plantillas de correo" }
  }
}

/** Sends the given (unsaved) template to the logged-in super-admin with sample data. */
export async function sendSolicitudEmailTest(
  kind: SolicitudEmailKind,
  template: SolicitudEmailTemplates[SolicitudEmailKind],
): Promise<ActionResult<{ to: string }>> {
  const { session, error } = await requireSuperAdmin()
  if (error) return { success: false, error }
  const to = session.user.email
  if (!to) return { success: false, error: "Tu usuario no tiene email" }

  const current = await readSolicitudEmailTemplates()
  const templates: SolicitudEmailTemplates =
    kind === "approval"
      ? { ...current, approval: solicitudEmailTemplatesSchema.shape.approval.parse(template) }
      : {
          ...current,
          rejection: {
            ...solicitudEmailTemplatesSchema.shape.rejection.parse(template),
            enabled: true, // a test always sends, whatever the switch says
          },
        }

  try {
    const built =
      kind === "approval"
        ? await buildApprovalEmail(
            {
              businessName: "Café del Centro (prueba)",
              contactName: session.user.name ?? "María",
              email: to,
              password: "cuik-ejemplo1",
              loginUrl: `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/login`,
              trialDays: DEFAULT_PLATFORM_CONFIG.defaultTrialDays,
            },
            templates,
          )
        : await buildRejectionEmail(
            {
              businessName: "Café del Centro (prueba)",
              contactName: session.user.name ?? "María",
              email: to,
              reason: "Motivo de ejemplo escrito al rechazar",
            },
            templates,
          )
    if (!built) return { success: false, error: "No se pudo armar el correo" }
    const result = await sendEmail({
      to,
      subject: `[Prueba] ${built.subject}`,
      template: built.template,
    })
    if ("error" in result) return { success: false, error: result.error }
    return { success: true, data: { to } }
  } catch (err) {
    console.error("[sendSolicitudEmailTest]", err)
    return { success: false, error: "No se pudo enviar la prueba" }
  }
}
