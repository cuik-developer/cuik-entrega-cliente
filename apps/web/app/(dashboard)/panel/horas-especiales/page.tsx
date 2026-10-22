import { BONUS_MAX_MULTIPLIER, type BonusWindow, bonusWindowSchema } from "@cuik/shared/validators"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { PanelMessage } from "@/components/admin/enterprise"
import { auth } from "@/lib/auth"
import { getTenantForUser } from "@/lib/tenant-context"
import { getMemberRole, isTenantAdmin } from "@/lib/tenant-roles"

import { HorasEspecialesClient } from "./_components/horas-especiales-client"

/**
 * /panel/horas-especiales — the business sets the days and hours in which
 * each visit earns double or triple stamps (or points): "lunes de 8 a 12, x2",
 * "sábado 31 de octubre, x3". Applied by the rules engine at scan time.
 */
export default async function HorasEspecialesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")

  const tenant = await getTenantForUser(session.user.id)
  if (!tenant) redirect("/login")

  if (!tenant.promotionId || !tenant.promotionType) {
    return (
      <PanelMessage className="py-20">
        Tu comercio no tiene una promoción activa. Habla con el equipo de Cuik.
      </PanelMessage>
    )
  }

  const accumulation = (tenant.promotionConfig?.accumulation ?? {}) as Record<string, unknown>
  // Same lenient read as the rules engine: a malformed or over-cap entry is
  // skipped (the till never applies it), so the list shows only what is real.
  const stored = Array.isArray(accumulation.bonusWindows) ? accumulation.bonusWindows : []
  const max = BONUS_MAX_MULTIPLIER[tenant.promotionType]
  const windows: BonusWindow[] = stored.flatMap((w) => {
    const parsed = bonusWindowSchema.safeParse(w)
    return parsed.success && parsed.data.multiplier <= max ? [parsed.data] : []
  })

  const role = tenant.readOnly ? null : await getMemberRole(session.user.id, tenant.organizationId)

  return (
    <HorasEspecialesClient
      initialWindows={windows}
      promotionType={tenant.promotionType}
      timezone={tenant.timezone}
      canEdit={!tenant.readOnly && isTenantAdmin(role)}
    />
  )
}
