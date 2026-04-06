"use server"

import { db, globalConfig } from "@cuik/db"
import {
  DEFAULT_PLATFORM_CONFIG,
  type PlatformConfig,
  platformConfigSchema,
} from "@cuik/shared/validators"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

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
