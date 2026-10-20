import { and, db, eq, promotions, solicitudes, tenants } from "@cuik/db"
import { notFound } from "next/navigation"
import { NoAccess } from "@/components/admin/admin-access"
import { currentAdminAccess } from "@/lib/admin-access"
import { canAccess } from "@/lib/staff-permissions"

export const dynamic = "force-dynamic"

import { getDesignById } from "../../queries"
import { EditorPageClient } from "./editor-page-client"

interface EditorPageProps {
  params: Promise<{ designId: string }>
}

export default async function EditorPage({ params }: EditorPageProps) {
  const { designId } = await params

  // Reads the DB directly: check access here too, not only in the middleware.
  const { access } = await currentAdminAccess()
  if (!canAccess(access, "designs")) return <NoAccess access={access} />
  const canPublish = access.kind === "super_admin"

  const result = await getDesignById(designId)

  if (!result) {
    notFound()
  }

  const { design, assets } = result

  // Fetch tenant name + business type + registration config for editor context
  const [tenant] = await db
    .select({ name: tenants.name, registrationConfig: tenants.registrationConfig })
    .from(tenants)
    .where(eq(tenants.id, design.tenantId))
    .limit(1)

  // Get business type from the solicitud linked to this tenant
  const [solicitud] = await db
    .select({ businessType: solicitudes.businessType })
    .from(solicitudes)
    .where(eq(solicitudes.tenantId, design.tenantId))
    .limit(1)

  // Fetch linked promotion context (if any)
  let promotionContext:
    | { type: string; maxVisits: number | null; rewardValue: string | null; active: boolean }
    | undefined
  if (design.promotionId) {
    const [promo] = await db
      .select({
        type: promotions.type,
        maxVisits: promotions.maxVisits,
        rewardValue: promotions.rewardValue,
        active: promotions.active,
      })
      .from(promotions)
      .where(eq(promotions.id, design.promotionId))
      .limit(1)
    if (promo) {
      promotionContext = promo
    }
  }

  // Not linked: the wallet routes count against the tenant's active promotion,
  // so the previews use it too (the "Promoción vinculada" banner stays empty).
  let livePromotion: { type: string; maxVisits: number | null } | undefined = promotionContext
  if (!livePromotion) {
    const [active] = await db
      .select({ type: promotions.type, maxVisits: promotions.maxVisits })
      .from(promotions)
      .where(and(eq(promotions.tenantId, design.tenantId), eq(promotions.active, true)))
      .limit(1)
    livePromotion = active
  }

  const tenantName = tenant?.name ?? "Comercio"
  const businessType = solicitud?.businessType ?? undefined

  // Extract strategic field names from registration config for the editor variable dropdown
  const regConfig = tenant?.registrationConfig as
    | { strategicFields?: Array<{ key: string; label: string }> }
    | null
    | undefined
  const strategicFields = regConfig?.strategicFields ?? []

  return (
    <EditorPageClient
      initialDesign={design}
      initialAssets={assets}
      tenantName={tenantName}
      businessType={businessType}
      promotionContext={promotionContext}
      livePromotion={livePromotion}
      strategicFields={strategicFields}
      canPublish={canPublish}
    />
  )
}
