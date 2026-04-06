import { and, clients, db, eq, passInstances, rewardCatalog, tenants } from "@cuik/db"
import { notFound } from "next/navigation"
import {
  assemblePassConfig,
  getActiveDesignForTenant,
} from "@/app/(dashboard)/panel/mi-pase/queries"
import { verifyClientToken } from "@/lib/client-token"
import type { ServerData } from "./bienvenido-client"
import BienvenidoClient from "./bienvenido-client"

const DEFAULT_PRIMARY = "#0e70db"

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: server page with multiple sequential DB queries and token verification
export default async function TenantBienvenidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { tenant: slug } = await params
  const resolvedSearchParams = await searchParams

  // Fetch tenant with id (needed for pass design + catalog queries)
  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      branding: tenants.branding,
    })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1)

  if (!tenant) {
    notFound()
  }

  const primaryColor =
    (tenant.branding as Record<string, string> | null)?.primaryColor ?? DEFAULT_PRIMARY

  const clientToken =
    typeof resolvedSearchParams.clientToken === "string"
      ? resolvedSearchParams.clientToken
      : undefined

  let serverData: ServerData | undefined

  if (clientToken) {
    const secret = process.env.BETTER_AUTH_SECRET
    if (!secret) {
      serverData = { error: "expired" }
    } else {
      const result = verifyClientToken(secret, clientToken)
      if (!result.valid || !result.clientId) {
        serverData = { error: "expired" }
      } else {
        try {
          // Fetch client data
          const clientRows = await db
            .select({ id: clients.id, name: clients.name, qrCode: clients.qrCode })
            .from(clients)
            .where(eq(clients.id, result.clientId))
            .limit(1)

          const client = clientRows[0]
          if (!client) {
            serverData = { error: "expired" }
          } else {
            // Fetch pass_instances for wallet URLs
            const passRows = await db
              .select({
                authToken: passInstances.authToken,
                googleSaveUrl: passInstances.googleSaveUrl,
              })
              .from(passInstances)
              .where(eq(passInstances.clientId, client.id))
              .limit(1)

            const pass = passRows[0]

            const appleUrl = pass?.authToken
              ? `/api/${slug}/wallet/apple/${client.id}/${pass.authToken}`
              : null
            const googleUrl = pass?.googleSaveUrl ?? null

            serverData = {
              nombre: client.name,
              appleUrl,
              googleUrl,
            }
          }
        } catch (err) {
          console.error("[bienvenido] Error fetching client data:", err)
          serverData = { error: "expired" }
        }
      }
    }
  }

  // Fetch pass design for real wallet preview
  const designResult = await getActiveDesignForTenant(tenant.id)
  const passConfig = designResult
    ? assemblePassConfig(designResult.design, designResult.assets)
    : null
  const promotionType =
    designResult?.promotion?.type === "points" ? ("points" as const) : ("stamps" as const)

  // Check if tenant has active catalog items (for "Ver premios" link)
  const [catalogCount] = await db
    .select({ count: rewardCatalog.id })
    .from(rewardCatalog)
    .where(and(eq(rewardCatalog.tenantId, tenant.id), eq(rewardCatalog.active, true)))
    .limit(1)

  const hasCatalog = !!catalogCount

  return (
    <BienvenidoClient
      tenantName={tenant.name}
      tenantSlug={slug}
      primaryColor={primaryColor}
      logoUrl={(tenant.branding as Record<string, string> | null)?.logoUrl ?? null}
      serverData={serverData}
      passConfig={passConfig}
      promotionType={promotionType}
      hasCatalog={hasCatalog}
    />
  )
}
