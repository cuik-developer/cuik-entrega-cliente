import { db, eq, promotions, solicitudes, tenants } from "@cuik/db"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

import { getDesignById } from "../../queries"
import { EditorPageClient } from "./editor-page-client"

interface EditorPageProps {
  params: Promise<{ designId: string }>
}

export default async function EditorPage({ params }: EditorPageProps) {
  const { designId } = await params

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
      strategicFields={strategicFields}
    />
  )
}
